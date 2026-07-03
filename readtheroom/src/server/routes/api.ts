import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  ApiError,
  GuessResponse,
  InitResponse,
  SplashResponse,
  SubmitPromptResponse,
} from '../../shared/api';
import {
  ensurePrompt,
  getLeaderboard,
  getPlayerStats,
  recordGuess,
  revealForPlayer,
  submitPendingPrompt,
  todayUtc,
} from '../core/game';
import { keys } from '../core/keys';

export const api = new Hono();

/** Full game state for the expanded app. */
api.get('/init', async (c) => {
  try {
    const date = todayUtc();
    const userId = context.userId ?? null;
    const prompt = await ensurePrompt(date);

    if (!userId) {
      return c.json<InitResponse>({
        type: 'init',
        prompt,
        loggedIn: false,
        username: null,
        reveal: null,
        stats: null,
        leaderboard: await getLeaderboard(date, null),
      });
    }

    const [username, reveal, stats, leaderboard] = await Promise.all([
      reddit.getCurrentUsername(),
      revealForPlayer(date, userId),
      getPlayerStats(userId),
      getLeaderboard(date, userId),
    ]);
    return c.json<InitResponse>({
      type: 'init',
      prompt,
      loggedIn: true,
      username: username ?? null,
      reveal,
      stats,
      leaderboard,
    });
  } catch (error) {
    console.error('init failed', error);
    return c.json<ApiError>({ status: 'error', message: 'init failed' }, 500);
  }
});

/** Lightweight payload for the inline splash entrypoint. */
api.get('/splash', async (c) => {
  try {
    const date = todayUtc();
    const prompt = await ensurePrompt(date);
    const players = Number((await redis.get(keys.guessCount(date))) ?? '0');
    return c.json<SplashResponse>({
      type: 'splash',
      question: prompt.question,
      left: prompt.left,
      right: prompt.right,
      day: prompt.day,
      players,
    });
  } catch (error) {
    console.error('splash failed', error);
    return c.json<ApiError>({ status: 'error', message: 'splash failed' }, 500);
  }
});

type GuessBody = { value?: unknown };
type SubmitBody = { question?: unknown; left?: unknown; right?: unknown };

/** Locks in the player's one guess for today. */
api.post('/guess', async (c) => {
  const userId = context.userId;
  if (!userId) {
    return c.json<ApiError>(
      { status: 'error', message: 'You need a Reddit account to play.' },
      401
    );
  }
  const fallback: GuessBody = {};
  const body = await c.req.json<GuessBody>().catch(() => fallback);
  const value = typeof body.value === 'number' ? body.value : NaN;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return c.json<ApiError>(
      { status: 'error', message: 'Guess must be a number from 0 to 100.' },
      400
    );
  }
  try {
    const date = todayUtc();
    await ensurePrompt(date);
    const username = (await reddit.getCurrentUsername()) ?? 'someone';
    const { reveal, stats } = await recordGuess(date, userId, username, value);
    const leaderboard = await getLeaderboard(date, userId);
    return c.json<GuessResponse>({ type: 'guess', reveal, stats, leaderboard });
  } catch (error) {
    console.error('guess failed', error);
    return c.json<ApiError>({ status: 'error', message: 'guess failed' }, 500);
  }
});

/** Community prompt submissions go to the mod review queue. */
api.post('/submit-prompt', async (c) => {
  const userId = context.userId;
  if (!userId) {
    return c.json<ApiError>(
      {
        status: 'error',
        message: 'You need a Reddit account to submit a prompt.',
      },
      401
    );
  }
  const fallback: SubmitBody = {};
  const body = await c.req.json<SubmitBody>().catch(() => fallback);
  const question =
    typeof body.question === 'string' ? body.question.trim() : '';
  const left = typeof body.left === 'string' ? body.left.trim() : '';
  const right = typeof body.right === 'string' ? body.right.trim() : '';
  if (!question || !left || !right) {
    return c.json<ApiError>(
      {
        status: 'error',
        message: 'Question and both pole labels are required.',
      },
      400
    );
  }
  if (question.length > 140 || left.length > 40 || right.length > 40) {
    return c.json<ApiError>(
      {
        status: 'error',
        message: 'Keep it snappy: question under 140 chars, poles under 40.',
      },
      400
    );
  }
  try {
    const username = (await reddit.getCurrentUsername()) ?? null;
    await submitPendingPrompt({ question, left, right, author: username });
    return c.json<SubmitPromptResponse>({
      type: 'submitPrompt',
      message:
        'Sent to the mods. If approved, it becomes a future daily prompt.',
    });
  } catch (error) {
    console.error('submit-prompt failed', error);
    return c.json<ApiError>({ status: 'error', message: 'submit failed' }, 500);
  }
});
