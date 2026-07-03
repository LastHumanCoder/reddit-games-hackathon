import { redis } from '@devvit/web/server';
import type { TownState } from '../../shared/types';

const TOWN_KEY = 'town';

const DEFAULT_TOWN: TownState = {
  buildings: ['plaza', 'well', 'bakery', 'farm', 'sawmill', 'tavern'],
  population: 0,
  foundedAt: 0,
};

export const getTown = async (): Promise<TownState> => {
  const raw = await redis.get(TOWN_KEY);
  if (!raw) {
    const town: TownState = { ...DEFAULT_TOWN, foundedAt: Date.now() };
    await redis.set(TOWN_KEY, JSON.stringify(town));
    return town;
  }
  return JSON.parse(raw) as TownState;
};

export const saveTown = async (town: TownState): Promise<void> => {
  await redis.set(TOWN_KEY, JSON.stringify(town));
};
