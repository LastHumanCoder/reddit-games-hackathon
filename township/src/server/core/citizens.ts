import { redis, reddit } from '@devvit/web/server';
import type { ActiveTask, Citizen, Trade } from '../../shared/types';
import { MAX_ACTIVE_TASKS, taskDefById } from '../../shared/types';
import { getTown, saveTown } from './town';

/**
 * Citizens are stored in a single hash: `citizens` → { [id]: JSON }.
 * (Devvit Redis has no key scan, so a stable collection key is required.)
 */
const CITIZENS_KEY = 'citizens';

/** Founding NPC townsfolk so the town is alive with zero players. */
const NPC_SEED: ReadonlyArray<{ slug: string; name: string; trade: Trade }> = [
  { slug: 'marla', name: 'Old Marla', trade: 'baker' },
  { slug: 'pip', name: 'Pip', trade: 'farmer' },
  { slug: 'hobbes', name: 'Hobbes', trade: 'carpenter' },
  { slug: 'greta', name: 'Greta', trade: 'brewer' },
  { slug: 'ned', name: 'Nervous Ned', trade: 'farmer' },
  { slug: 'juniper', name: 'Juniper', trade: 'baker' },
];

export const seedNpcs = async (): Promise<void> => {
  const existing = await redis.hGetAll(CITIZENS_KEY);
  if (existing && Object.keys(existing).length > 0) return;

  const now = Date.now();
  const fields: Record<string, string> = {};
  for (const npc of NPC_SEED) {
    const citizen: Citizen = {
      id: `npc:${npc.slug}`,
      username: npc.name,
      trade: npc.trade,
      isNpc: true,
      snoovatarUrl: null,
      claimedAt: now,
      streak: 1,
      prosperity: 70,
      coins: 0,
      tasks: [],
      lastCheckInDay: 0,
    };
    fields[citizen.id] = JSON.stringify(citizen);
  }
  await redis.hSet(CITIZENS_KEY, fields);
};

/** Backfill fields added after early citizens were stored. */
const normalize = (c: Citizen): Citizen => ({
  ...c,
  tasks: c.tasks ?? [],
  lastCheckInDay: c.lastCheckInDay ?? 0,
});

export const getAllCitizens = async (): Promise<Citizen[]> => {
  const raw = await redis.hGetAll(CITIZENS_KEY);
  if (!raw) return [];
  return Object.values(raw).map((v) => normalize(JSON.parse(v) as Citizen));
};

export const getCitizen = async (userId: string): Promise<Citizen | null> => {
  const raw = await redis.hGet(CITIZENS_KEY, userId);
  return raw ? normalize(JSON.parse(raw) as Citizen) : null;
};

const dayNumber = (ms: number): number => Math.floor(ms / 86_400_000);

/** Daily check-in: any meaningful action advances streak + prosperity once per UTC day. */
const applyCheckIn = (citizen: Citizen, now: number): void => {
  const today = dayNumber(now);
  if (citizen.lastCheckInDay === today) return;
  citizen.streak = citizen.lastCheckInDay === today - 1 ? citizen.streak + 1 : 1;
  citizen.prosperity = Math.min(100, citizen.prosperity + 8);
  citizen.lastCheckInDay = today;
};

export type TaskError = 'not-claimed' | 'unknown-task' | 'wrong-trade' | 'slots-full' | 'already-running' | 'not-ready' | 'not-found';

export const startTask = async (
  userId: string,
  defId: string
): Promise<{ citizen: Citizen } | { error: TaskError }> => {
  const citizen = await getCitizen(userId);
  if (!citizen) return { error: 'not-claimed' };
  const def = taskDefById(defId);
  if (!def) return { error: 'unknown-task' };
  if (def.trade !== citizen.trade) return { error: 'wrong-trade' };
  if (citizen.tasks.length >= MAX_ACTIVE_TASKS) return { error: 'slots-full' };
  if (citizen.tasks.some((t) => t.defId === defId)) return { error: 'already-running' };

  const now = Date.now();
  const task: ActiveTask = { defId, startedAt: now, readyAt: now + def.durationMs };
  citizen.tasks.push(task);
  applyCheckIn(citizen, now);
  await saveCitizen(citizen);
  return { citizen };
};

export const collectTask = async (
  userId: string,
  defId: string
): Promise<{ citizen: Citizen; reward: number } | { error: TaskError }> => {
  const citizen = await getCitizen(userId);
  if (!citizen) return { error: 'not-claimed' };
  const task = citizen.tasks.find((t) => t.defId === defId);
  if (!task) return { error: 'not-found' };
  const def = taskDefById(defId);
  if (!def) return { error: 'unknown-task' };

  const now = Date.now();
  if (now < task.readyAt) return { error: 'not-ready' };

  citizen.tasks = citizen.tasks.filter((t) => t.defId !== defId);
  citizen.coins += def.reward;
  applyCheckIn(citizen, now);
  await saveCitizen(citizen);
  await redis.zIncrBy('lb:contrib:weekly', citizen.id, def.reward);
  return { citizen, reward: def.reward };
};

export const saveCitizen = async (citizen: Citizen): Promise<void> => {
  await redis.hSet(CITIZENS_KEY, { [citizen.id]: JSON.stringify(citizen) });
};

export const claimCitizen = async (
  userId: string,
  username: string,
  trade: Trade
): Promise<Citizen> => {
  const existing = await getCitizen(userId);
  if (existing) return existing;

  let snoovatarUrl: string | null = null;
  try {
    const user = await reddit.getUserByUsername(username);
    snoovatarUrl = (await user?.getSnoovatarUrl()) ?? null;
  } catch (error) {
    console.error(`Could not fetch snoovatar for ${username}:`, error);
  }

  const now = Date.now();
  const citizen: Citizen = {
    id: userId,
    username,
    trade,
    isNpc: false,
    snoovatarUrl,
    claimedAt: now,
    streak: 1,
    prosperity: 60,
    coins: 10,
    tasks: [],
    lastCheckInDay: Math.floor(now / 86_400_000),
  };
  await saveCitizen(citizen);

  const town = await getTown();
  town.population += 1;
  await saveTown(town);

  return citizen;
};
