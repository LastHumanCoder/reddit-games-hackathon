import { useCallback, useEffect, useState } from 'react';
import { showLoginPrompt } from '@devvit/web/client';
import type {
  GuessRequest,
  GuessResponse,
  InitResponse,
  LeaderboardRow,
  PlayerStats,
  PromptData,
  RevealData,
  SubmitPromptRequest,
  SubmitPromptResponse,
} from '../../shared/api';

export type GamePhase = 'loading' | 'error' | 'guess' | 'reveal';

export type GameState = {
  phase: GamePhase;
  prompt: PromptData | null;
  loggedIn: boolean;
  username: string | null;
  reveal: RevealData | null;
  stats: PlayerStats | null;
  leaderboard: LeaderboardRow[];
  locking: boolean;
  error: string | null;
};

const INITIAL: GameState = {
  phase: 'loading',
  prompt: null,
  loggedIn: false,
  username: null,
  reveal: null,
  stats: null,
  leaderboard: [],
  locking: false,
  error: null,
};

const readErrorMessage = async (res: Response): Promise<string> => {
  try {
    const data: unknown = await res.json();
    if (
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof data.message === 'string'
    ) {
      return data.message;
    }
  } catch {
    // fall through
  }
  return `Something went wrong (HTTP ${res.status}).`;
};

export const useGame = () => {
  const [state, setState] = useState<GameState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const res = await fetch('/api/init');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: InitResponse = await res.json();
        if (cancelled) return;
        setState({
          phase: data.reveal ? 'reveal' : 'guess',
          prompt: data.prompt,
          loggedIn: data.loggedIn,
          username: data.username,
          reveal: data.reveal,
          stats: data.stats,
          leaderboard: data.leaderboard,
          locking: false,
          error: null,
        });
      } catch (err) {
        console.error('init failed', err);
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          phase: 'error',
          error: 'Could not load today’s room. Pull to refresh?',
        }));
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Lock in a guess; prompts anonymous users to log in instead. */
  const lockIn = useCallback(
    async (value: number) => {
      if (!state.loggedIn) {
        showLoginPrompt();
        return;
      }
      setState((prev) => ({ ...prev, locking: true, error: null }));
      try {
        const body: GuessRequest = { value };
        const res = await fetch('/api/guess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await readErrorMessage(res));
        const data: GuessResponse = await res.json();
        setState((prev) => ({
          ...prev,
          phase: 'reveal',
          reveal: data.reveal,
          stats: data.stats,
          leaderboard: data.leaderboard,
          locking: false,
        }));
      } catch (err) {
        console.error('guess failed', err);
        setState((prev) => ({
          ...prev,
          locking: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not lock in your guess.',
        }));
      }
    },
    [state.loggedIn]
  );

  /** Sends a community prompt to the mod queue; returns a status message. */
  const submitPrompt = useCallback(
    async (
      draft: SubmitPromptRequest
    ): Promise<{ ok: boolean; message: string }> => {
      if (!state.loggedIn) {
        showLoginPrompt();
        return { ok: false, message: 'Log in to submit a prompt.' };
      }
      try {
        const res = await fetch('/api/submit-prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (!res.ok) return { ok: false, message: await readErrorMessage(res) };
        const data: SubmitPromptResponse = await res.json();
        return { ok: true, message: data.message };
      } catch (err) {
        console.error('submit prompt failed', err);
        return { ok: false, message: 'Could not send your prompt. Try again.' };
      }
    },
    [state.loggedIn]
  );

  return { ...state, lockIn, submitPrompt } as const;
};
