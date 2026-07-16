import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { ApiError, Guess, InitResponse, GuessResponse, Outcome, ResultResponse } from '../../shared/api';
import {
  ensurePuzzle,
  getCrowd,
  getGuess,
  getOutcome,
  getStreaks,
  recordGuess,
  recordOutcome,
  settleStreak,
  todayUtc,
} from '../core/game';

export const api = new Hono();

const isGuess = (v: unknown): v is Guess => v === 'hold' || v === 'collapse';

api.get('/init', async (c) => {
  try {
    const date = todayUtc();
    const postId = context.postId ?? 'global';
    const userId = context.userId ?? null;
    const seed = await ensurePuzzle(postId, date);
    const [outcome, crowd] = await Promise.all([getOutcome(postId, date), getCrowd(postId, date)]);

    if (!userId) {
      return c.json<InitResponse>({
        type: 'init',
        seed,
        date,
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
      getGuess(postId, date, userId),
      getStreaks(userId),
    ]);
    return c.json<InitResponse>({
      type: 'init',
      seed,
      date,
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
    const date = todayUtc();
    const postId = context.postId ?? 'global';
    await ensurePuzzle(postId, date);
    await recordGuess(postId, date, userId, body.guess);
    const crowd = await getCrowd(postId, date);
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
    const date = todayUtc();
    const postId = context.postId ?? 'global';
    const outcome: Outcome = await recordOutcome(postId, date, claimed);
    const yourGuess = await getGuess(postId, date, userId);
    const correct = yourGuess !== null && yourGuess === outcome;
    const { streak, best } = await settleStreak(postId, date, userId, correct);
    const crowd = await getCrowd(postId, date);
    return c.json<ResultResponse>({ type: 'result', outcome, correct, streak, best, crowd });
  } catch (error) {
    console.error('result failed', error);
    return c.json<ApiError>({ status: 'error', message: 'result failed' }, 500);
  }
});
