import { redis } from '@devvit/web/server';
import {
  BIN_COUNT,
  type LeaderboardRow,
  type PlayerStats,
  type PromptData,
  type RevealData,
} from '../../shared/api';
import { keys } from './keys';
import { BUNDLED_PROMPTS, type PromptSeed } from './prompts';

/** A prompt as stored in the pending/approved queues (JSON-encoded). */
export type QueuedPrompt = PromptSeed & {
  author: string | null;
};

export type PendingEntry = QueuedPrompt & { id: string };

const FALLBACK_SEED: PromptSeed = {
  question: 'Pineapple on pizza',
  left: 'A crime against Italy',
  right: 'A tropical masterpiece',
};

/** Current UTC date key, yyyy-mm-dd. */
export const todayUtc = (): string => new Date().toISOString().slice(0, 10);

/** The UTC date key one day before `date`. */
export const previousDayUtc = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const parseQueuedPrompt = (raw: string): QueuedPrompt | null => {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(v)) return null;
  const { question, left, right, author } = v;
  if (
    typeof question !== 'string' ||
    typeof left !== 'string' ||
    typeof right !== 'string'
  ) {
    return null;
  }
  return {
    question,
    left,
    right,
    author: typeof author === 'string' ? author : null,
  };
};

/** Reads the prompt for a date, or null if none has been assigned yet. */
export const getPrompt = async (date: string): Promise<PromptData | null> => {
  const h = await redis.hGetAll(keys.prompt(date));
  const question = h['question'];
  if (!question) return null;
  const author = h['author'];
  return {
    id: h['id'] ?? date,
    question,
    left: h['left'] ?? '',
    right: h['right'] ?? '',
    author: author ? author : null,
    day: Number(h['day'] ?? '1'),
    date,
  };
};

/**
 * Returns the prompt for a date, creating it if needed: first from the
 * mod-approved community queue, then falling back to the bundled list.
 */
export const ensurePrompt = async (date: string): Promise<PromptData> => {
  const existing = await getPrompt(date);
  if (existing) return existing;

  let seed: QueuedPrompt | null = null;
  const head = Number((await redis.get(keys.approvedHead)) ?? '0');
  const tail = Number((await redis.get(keys.approvedTail)) ?? '0');
  if (head < tail) {
    const raw = await redis.hGet(keys.approvedQueue, String(head));
    await redis.incrBy(keys.approvedHead, 1);
    if (raw) {
      seed = parseQueuedPrompt(raw);
      await redis.hDel(keys.approvedQueue, [String(head)]);
    }
  }
  if (!seed) {
    const cursor = await redis.incrBy(keys.bundledCursor, 1);
    const bundled =
      BUNDLED_PROMPTS[(cursor - 1) % BUNDLED_PROMPTS.length] ?? FALLBACK_SEED;
    seed = { ...bundled, author: null };
  }

  const day = await redis.incrBy(keys.dayCounter, 1);
  await redis.hSet(keys.prompt(date), {
    id: `${date}-${day}`,
    question: seed.question,
    left: seed.left,
    right: seed.right,
    author: seed.author ?? '',
    day: String(day),
  });
  return {
    id: `${date}-${day}`,
    question: seed.question,
    left: seed.left,
    right: seed.right,
    author: seed.author,
    day,
    date,
  };
};

/** Builds the live reveal payload for a player with a known guess + score. */
export const buildReveal = async (
  date: string,
  guess: number,
  score: number
): Promise<RevealData> => {
  const [binsHash, sumRaw, countRaw] = await Promise.all([
    redis.hGetAll(keys.bins(date)),
    redis.get(keys.guessSum(date)),
    redis.get(keys.guessCount(date)),
  ]);
  const bins = Array.from({ length: BIN_COUNT }, (_, i) =>
    Number(binsHash[String(i)] ?? '0')
  );
  const total = Number(countRaw ?? '0');
  const sum = Number(sumRaw ?? '0');
  const mean = total > 0 ? Math.round((sum / total) * 10) / 10 : 50;
  return { bins, mean, total, guess, score };
};

/** Reveal for a player who has already guessed today, or null. */
export const revealForPlayer = async (
  date: string,
  userId: string
): Promise<RevealData | null> => {
  const raw = await redis.hGet(keys.guesses(date), userId);
  if (raw === undefined) return null;
  const guess = Number(raw);
  const score = (await redis.zScore(keys.leaderboard(date), userId)) ?? 0;
  return buildReveal(date, guess, score);
};

/** Per-player lifetime stats, or null if they've never played. */
export const getPlayerStats = async (
  userId: string
): Promise<PlayerStats | null> => {
  const h = await redis.hGetAll(keys.player(userId));
  const played = Number(h['played'] ?? '0');
  if (played === 0) return null;
  const scoreSum = Number(h['scoreSum'] ?? '0');
  return {
    streak: Number(h['streak'] ?? '0'),
    bestStreak: Number(h['best'] ?? '0'),
    gamesPlayed: played,
    avgScore: Math.round(scoreSum / played),
  };
};

const bumpPlayerStats = async (
  userId: string,
  date: string,
  score: number
): Promise<PlayerStats> => {
  const pKey = keys.player(userId);
  const h = await redis.hGetAll(pKey);
  const continuing = h['lastDate'] === previousDayUtc(date);
  const streak = continuing ? Number(h['streak'] ?? '0') + 1 : 1;
  const best = Math.max(streak, Number(h['best'] ?? '0'));
  const played = Number(h['played'] ?? '0') + 1;
  const scoreSum = Number(h['scoreSum'] ?? '0') + score;
  await redis.hSet(pKey, {
    streak: String(streak),
    best: String(best),
    played: String(played),
    scoreSum: String(scoreSum),
    lastDate: date,
  });
  return {
    streak,
    bestStreak: best,
    gamesPlayed: played,
    avgScore: Math.round(scoreSum / played),
  };
};

export type GuessResult = {
  reveal: RevealData;
  stats: PlayerStats;
};

/**
 * Records a player's one guess for the day and returns their reveal. If they
 * already guessed, the stored guess wins and no counters change.
 */
export const recordGuess = async (
  date: string,
  userId: string,
  username: string,
  value: number
): Promise<GuessResult> => {
  const existing = await revealForPlayer(date, userId);
  if (existing) {
    const stats = await getPlayerStats(userId);
    return {
      reveal: existing,
      stats: stats ?? {
        streak: 1,
        bestStreak: 1,
        gamesPlayed: 1,
        avgScore: existing.score,
      },
    };
  }

  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  await redis.hSet(keys.guesses(date), { [userId]: String(clamped) });
  const [sum, count] = await Promise.all([
    redis.incrBy(keys.guessSum(date), clamped),
    redis.incrBy(keys.guessCount(date), 1),
  ]);
  const bin = Math.min(BIN_COUNT - 1, Math.floor(clamped / (100 / BIN_COUNT)));
  await redis.hIncrBy(keys.bins(date), String(bin), 1);

  const mean = sum / count;
  const score = Math.round(Math.max(0, 100 - Math.abs(clamped - mean)));

  await Promise.all([
    redis.zAdd(keys.leaderboard(date), { member: userId, score }),
    redis.hSet(keys.usernames, { [userId]: username }),
  ]);
  const stats = await bumpPlayerStats(userId, date, score);
  const reveal = await buildReveal(date, clamped, score);
  return { reveal, stats };
};

/** Today's top-10, highest score first. */
export const getLeaderboard = async (
  date: string,
  meUserId: string | null
): Promise<LeaderboardRow[]> => {
  const top = await redis.zRange(keys.leaderboard(date), 0, 9, {
    by: 'rank',
    reverse: true,
  });
  if (top.length === 0) return [];
  const names = await redis.hMGet(
    keys.usernames,
    top.map((t) => t.member)
  );
  return top.map((t, i) => ({
    username: names[i] ?? 'someone',
    score: t.score,
    isYou: meUserId !== null && t.member === meUserId,
  }));
};

/** Queues a community-submitted prompt for mod review. */
export const submitPendingPrompt = async (
  prompt: QueuedPrompt
): Promise<void> => {
  const id = await redis.incrBy(keys.pendingCounter, 1);
  await redis.hSet(keys.pendingQueue, {
    [String(id)]: JSON.stringify(prompt),
  });
};

/** All pending submissions, oldest first. */
export const listPending = async (): Promise<PendingEntry[]> => {
  const all = await redis.hGetAll(keys.pendingQueue);
  return Object.entries(all)
    .flatMap(([id, raw]) => {
      const parsed = parseQueuedPrompt(raw);
      return parsed ? [{ ...parsed, id }] : [];
    })
    .sort((a, b) => Number(a.id) - Number(b.id));
};

/** Moves a pending submission into the approved queue. */
export const approvePending = async (id: string): Promise<boolean> => {
  const raw = await redis.hGet(keys.pendingQueue, id);
  if (!raw) return false;
  const tail = await redis.incrBy(keys.approvedTail, 1);
  await redis.hSet(keys.approvedQueue, { [String(tail - 1)]: raw });
  await redis.hDel(keys.pendingQueue, [id]);
  return true;
};

/** Drops a pending submission. */
export const rejectPending = async (id: string): Promise<boolean> => {
  const removed = await redis.hDel(keys.pendingQueue, [id]);
  return removed > 0;
};
