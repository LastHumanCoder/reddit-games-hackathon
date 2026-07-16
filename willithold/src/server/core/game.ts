import { redis } from '@devvit/web/server';
import type { Crowd, Guess, Outcome } from '../../shared/api';
import { keys } from './keys';

/** Current UTC date key, yyyy-mm-dd. */
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

/** Deterministic 32-bit seed from date + post id (FNV-1a). */
export const seedFor = (date: string, postId: string): number => {
  const s = `${date}|${postId}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const ensurePuzzle = async (postId: string, date: string): Promise<number> => {
  const key = keys.puzzle(postId, date);
  const existing = await redis.hGet(key, 'seed');
  if (existing) return Number(existing);
  const seed = seedFor(date, postId);
  await redis.hSet(key, { seed: String(seed) });
  return seed;
};

export const getOutcome = async (postId: string, date: string): Promise<Outcome | null> => {
  const raw = await redis.hGet(keys.puzzle(postId, date), 'outcome');
  return raw === 'hold' || raw === 'collapse' ? raw : null;
};

export const getCrowd = async (postId: string, date: string): Promise<Crowd> => {
  const h = await redis.hGetAll(keys.tally(postId, date));
  return {
    hold: Number(h['hold'] ?? '0'),
    collapse: Number(h['collapse'] ?? '0'),
  };
};

export const getGuess = async (
  postId: string,
  date: string,
  userId: string
): Promise<Guess | null> => {
  const raw = await redis.get(keys.guess(postId, date, userId));
  return raw === 'hold' || raw === 'collapse' ? raw : null;
};

/** Records the player's one guess for today. Returns false if already guessed. */
export const recordGuess = async (
  postId: string,
  date: string,
  userId: string,
  guess: Guess
): Promise<boolean> => {
  const key = keys.guess(postId, date, userId);
  const existing = await redis.get(key);
  if (existing) return false;
  await redis.set(key, guess);
  await redis.expire(key, 60 * 60 * 24 * 3);
  await redis.hIncrBy(keys.tally(postId, date), guess, 1);
  return true;
};

/** Stores the sim outcome first-write-wins; returns the canonical outcome. */
export const recordOutcome = async (
  postId: string,
  date: string,
  outcome: Outcome
): Promise<Outcome> => {
  const existing = await getOutcome(postId, date);
  if (existing) return existing;
  await redis.hSet(keys.puzzle(postId, date), { outcome });
  return outcome;
};

export const getStreaks = async (userId: string): Promise<{ streak: number; best: number }> => {
  const [s, b] = await Promise.all([
    redis.get(keys.streak(userId)),
    redis.get(keys.best(userId)),
  ]);
  return { streak: Number(s ?? '0'), best: Number(b ?? '0') };
};

/**
 * Updates the streak after a resolved round. Guarded per user+date so a
 * replayed verdict screen can't double-count.
 */
export const settleStreak = async (
  postId: string,
  date: string,
  userId: string,
  correct: boolean
): Promise<{ streak: number; best: number }> => {
  const settledKey = `settled:${postId}:${date}:${userId}`;
  const already = await redis.get(settledKey);
  if (already) return getStreaks(userId);
  await redis.set(settledKey, '1');
  await redis.expire(settledKey, 60 * 60 * 24 * 3);

  let streak: number;
  if (correct) {
    streak = await redis.incrBy(keys.streak(userId), 1);
  } else {
    await redis.set(keys.streak(userId), '0');
    streak = 0;
  }
  const best = Number((await redis.get(keys.best(userId))) ?? '0');
  if (streak > best) {
    await redis.set(keys.best(userId), String(streak));
    return { streak, best: streak };
  }
  return { streak, best };
};
