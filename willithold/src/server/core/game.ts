import { redis } from '@devvit/web/server';
import type { Crowd, Guess, Outcome } from '../../shared/api';
import { keys } from './keys';

/** Deterministic 32-bit seed from the post id (FNV-1a). Never changes. */
export const seedFor = (postId: string): number => {
  const s = `bridge|${postId}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

export const ensurePuzzle = async (postId: string): Promise<number> => {
  const key = keys.puzzle(postId);
  const existing = await redis.hGet(key, 'seed');
  if (existing) return Number(existing);
  const seed = seedFor(postId);
  await redis.hSet(key, { seed: String(seed) });
  return seed;
};

export const getOutcome = async (postId: string): Promise<Outcome | null> => {
  const raw = await redis.hGet(keys.puzzle(postId), 'outcome');
  return raw === 'hold' || raw === 'collapse' ? raw : null;
};

export const getCrowd = async (postId: string): Promise<Crowd> => {
  const h = await redis.hGetAll(keys.tally(postId));
  return {
    hold: Number(h['hold'] ?? '0'),
    collapse: Number(h['collapse'] ?? '0'),
  };
};

export const getGuess = async (postId: string, userId: string): Promise<Guess | null> => {
  const raw = await redis.get(keys.guess(postId, userId));
  return raw === 'hold' || raw === 'collapse' ? raw : null;
};

/** Records the player's one guess for this post. Returns false if already guessed. */
export const recordGuess = async (
  postId: string,
  userId: string,
  guess: Guess
): Promise<boolean> => {
  const key = keys.guess(postId, userId);
  const existing = await redis.get(key);
  if (existing) return false;
  await redis.set(key, guess);
  await redis.hIncrBy(keys.tally(postId), guess, 1);
  return true;
};

/** Stores the sim outcome first-write-wins; returns the canonical outcome. */
export const recordOutcome = async (postId: string, outcome: Outcome): Promise<Outcome> => {
  const existing = await getOutcome(postId);
  if (existing) return existing;
  await redis.hSet(keys.puzzle(postId), { outcome });
  return outcome;
};

export const getStreaks = async (userId: string): Promise<{ streak: number; best: number }> => {
  const [s, b] = await Promise.all([
    redis.get(keys.streak(userId)),
    redis.get(keys.best(userId)),
  ]);
  return { streak: Number(s ?? '0'), best: Number(b ?? '0') };
};

const ACC_ZSET = 'acc_z';
const LB_ZSET = 'lb_z';
const NAMES_HASH = 'names';

const statsKey = (userId: string) => `stats:${userId}`;

export type MetaStats = {
  games: number;
  correctCount: number;
  accuracy: number;
  /** "Top X%" among players with 3+ games, or null. */
  rankTopPct: number | null;
  /** Last 9 results: 'H'/'C' outcome, uppercase = correct call. */
  recent: string;
};

/**
 * Updates streak + lifetime stats after a resolved round. Guarded per
 * user+date so a replayed verdict screen can't double-count.
 */
export const settleStreak = async (
  postId: string,
  userId: string,
  username: string,
  correct: boolean,
  outcome: Outcome
): Promise<{ streak: number; best: number }> => {
  const settledKey = `settled:${postId}:${userId}`;
  const already = await redis.get(settledKey);
  if (already) return getStreaks(userId);
  await redis.set(settledKey, '1');

  let streak: number;
  if (correct) {
    streak = await redis.incrBy(keys.streak(userId), 1);
  } else {
    await redis.set(keys.streak(userId), '0');
    streak = 0;
  }
  let best = Number((await redis.get(keys.best(userId))) ?? '0');
  if (streak > best) {
    await redis.set(keys.best(userId), String(streak));
    best = streak;
  }

  // Lifetime stats (best effort - never let them break the verdict).
  try {
    const games = await redis.hIncrBy(statsKey(userId), 'games', 1);
    const correctCount = correct
      ? await redis.hIncrBy(statsKey(userId), 'correct', 1)
      : Number((await redis.hGet(statsKey(userId), 'correct')) ?? '0');
    const letter = outcome === 'hold' ? 'h' : 'c';
    const prev = (await redis.hGet(statsKey(userId), 'recent')) ?? '';
    const recent = (prev + (correct ? letter.toUpperCase() : letter)).slice(-9);
    await redis.hSet(statsKey(userId), { recent });
    await redis.hSet(NAMES_HASH, { [userId]: username });
    if (games >= 3) {
      await redis.zAdd(ACC_ZSET, { member: userId, score: correctCount / games });
    }
    await redis.zAdd(LB_ZSET, { member: userId, score: streak * 1000 + Math.min(best, 999) });
  } catch (e) {
    console.error('stats update failed', e);
  }

  return { streak, best };
};

export const getMetaStats = async (userId: string): Promise<MetaStats> => {
  const h = await redis.hGetAll(statsKey(userId));
  const games = Number(h['games'] ?? '0');
  const correctCount = Number(h['correct'] ?? '0');
  const recent = h['recent'] ?? '';
  const accuracy = games > 0 ? Math.round((correctCount / games) * 100) : 0;
  let rankTopPct: number | null = null;
  if (games >= 3) {
    try {
      const [rank, total] = await Promise.all([
        redis.zRank(ACC_ZSET, userId),
        redis.zCard(ACC_ZSET),
      ]);
      if (rank !== undefined && total > 0) {
        // zRank is ascending; convert to "top X%".
        const better = total - 1 - rank;
        rankTopPct = Math.max(1, Math.round(((better + 1) / total) * 100));
      }
    } catch (e) {
      console.error('rank lookup failed', e);
    }
  }
  return { games, correctCount, accuracy, rankTopPct, recent };
};

export type LeaderboardRow = { username: string; streak: number; best: number };

export const getLeaderboardTop = async (
  userId: string | null
): Promise<{ top: LeaderboardRow[]; you: LeaderboardRow | null }> => {
  const rows = await redis.zRange(LB_ZSET, 0, 4, { by: 'rank', reverse: true });
  const top: LeaderboardRow[] = [];
  for (const r of rows) {
    const name = (await redis.hGet(NAMES_HASH, r.member)) ?? 'anonymous';
    top.push({
      username: name,
      streak: Math.floor(r.score / 1000),
      best: Math.round(r.score % 1000),
    });
  }
  let you: LeaderboardRow | null = null;
  if (userId) {
    const name = await redis.hGet(NAMES_HASH, userId);
    if (name) {
      const { streak, best } = await getStreaks(userId);
      you = { username: name, streak, best };
    }
  }
  return { top, you };
};
