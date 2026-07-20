import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  ApiError,
  Guess,
  InitResponse,
  GuessResponse,
  LeaderboardResponse,
  Outcome,
  ResultResponse,
} from '../../shared/api';
import {
  ensurePuzzle,
  getCrowd,
  getGuess,
  getLeaderboardTop,
  getMetaStats,
  getOutcome,
  getStreaks,
  recordGuess,
  recordOutcome,
  settleStreak,
} from '../core/game';

export const api = new Hono();

const isGuess = (v: unknown): v is Guess => v === 'hold' || v === 'collapse';

api.get('/init', async (c) => {
  try {
    const postId = context.postId ?? 'global';
    const userId = context.userId ?? null;
    const seed = await ensurePuzzle(postId);
    const [outcome, crowd] = await Promise.all([getOutcome(postId), getCrowd(postId)]);

    if (!userId) {
      return c.json<InitResponse>({
        type: 'init',
        seed,
        loggedIn: false,
        alreadyPlayed: false,
        yourGuess: null,
        outcome,
        crowd,
        streak: 0,
        best: 0,
      });
    }

    const [yourGuess, streaks] = await Promise.all([
      getGuess(postId, userId),
      getStreaks(userId),
    ]);
    return c.json<InitResponse>({
      type: 'init',
      seed,
      loggedIn: true,
      alreadyPlayed: yourGuess !== null,
      yourGuess,
      outcome,
      crowd,
      streak: streaks.streak,
      best: streaks.best,
    });
  } catch (error) {
    console.error('init failed', error);
    return c.json<ApiError>({ status: 'error', message: 'init failed' }, 500);
  }
});

api.post('/guess', async (c) => {
  const userId = context.userId;
  if (!userId) {
    return c.json<ApiError>({ status: 'error', message: 'Log in to call it.' }, 401);
  }
  const body = await c.req.json<{ guess?: unknown }>().catch(() => ({ guess: undefined }));
  if (!isGuess(body.guess)) {
    return c.json<ApiError>({ status: 'error', message: 'Guess must be hold or collapse.' }, 400);
  }
  try {
    const postId = context.postId ?? 'global';
    await ensurePuzzle(postId);
    await recordGuess(postId, userId, body.guess);
    const crowd = await getCrowd(postId);
    return c.json<GuessResponse>({ type: 'guess', crowd });
  } catch (error) {
    console.error('guess failed', error);
    return c.json<ApiError>({ status: 'error', message: 'guess failed' }, 500);
  }
});

api.post('/result', async (c) => {
  const userId = context.userId;
  if (!userId) {
    return c.json<ApiError>({ status: 'error', message: 'Log in first.' }, 401);
  }
  const body = await c.req.json<{ outcome?: unknown }>().catch(() => ({ outcome: undefined }));
  const claimed = body.outcome;
  if (claimed !== 'hold' && claimed !== 'collapse') {
    return c.json<ApiError>({ status: 'error', message: 'Invalid outcome.' }, 400);
  }
  try {
    const postId = context.postId ?? 'global';
    const outcome: Outcome = await recordOutcome(postId, claimed);
    const yourGuess = await getGuess(postId, userId);
    const correct = yourGuess !== null && yourGuess === outcome;
    // Spectators (no guess) don't get streak/stats churn.
    const { streak, best } = yourGuess
      ? await settleStreak(
          postId,
          userId,
          (await reddit.getCurrentUsername()) ?? 'anonymous',
          correct,
          outcome
        )
      : await getStreaks(userId);
    const meta = await getMetaStats(userId);
    const crowd = await getCrowd(postId);
    return c.json<ResultResponse>({
      type: 'result',
      outcome,
      correct,
      streak,
      best,
      crowd,
      accuracy: meta.accuracy,
      rankTopPct: meta.rankTopPct,
      recent: meta.recent,
    });
  } catch (error) {
    console.error('result failed', error);
    return c.json<ApiError>({ status: 'error', message: 'result failed' }, 500);
  }
});

api.get('/leaderboard', async (c) => {
  try {
    const { top, you } = await getLeaderboardTop(context.userId ?? null);
    return c.json<LeaderboardResponse>({ type: 'leaderboard', top, you });
  } catch (error) {
    console.error('leaderboard failed', error);
    return c.json<ApiError>({ status: 'error', message: 'leaderboard failed' }, 500);
  }
});
