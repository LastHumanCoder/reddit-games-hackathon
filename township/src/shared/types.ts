/** Core domain types shared between client and server. */

export type Trade = 'baker' | 'farmer' | 'carpenter' | 'brewer';

export const TRADES: readonly Trade[] = ['baker', 'farmer', 'carpenter', 'brewer'];

export type TradeInfo = {
  id: Trade;
  label: string;
  workplace: BuildingId;
  /** Tunic color for drawn citizens + UI accents. */
  color: string;
  blurb: string;
};

export const TRADE_INFO: Record<Trade, TradeInfo> = {
  baker: {
    id: 'baker',
    label: 'Baker',
    workplace: 'bakery',
    color: '#e8a15c',
    blurb: 'Keeps the town fed. Bread waits for no one.',
  },
  farmer: {
    id: 'farmer',
    label: 'Farmer',
    workplace: 'farm',
    color: '#7fb069',
    blurb: 'Grows the wheat. Fights the goats.',
  },
  carpenter: {
    id: 'carpenter',
    label: 'Carpenter',
    workplace: 'sawmill',
    color: '#b08968',
    blurb: 'Builds what the town votes for.',
  },
  brewer: {
    id: 'brewer',
    label: 'Brewer',
    workplace: 'tavern',
    color: '#9d6b9e',
    blurb: 'Runs the tavern. Hears all the gossip.',
  },
};

export type BuildingId =
  | 'plaza'
  | 'well'
  | 'bakery'
  | 'farm'
  | 'sawmill'
  | 'tavern';

export type Citizen = {
  /** Reddit user id (t2_...) or `npc:<slug>`. */
  id: string;
  username: string;
  trade: Trade;
  isNpc: boolean;
  /** Reddit-hosted snoovatar PNG url, if the player has one. */
  snoovatarUrl: string | null;
  /** Unix ms of claim. */
  claimedAt: number;
  /** Consecutive-day check-in streak. */
  streak: number;
  /** 0-100; drives visible flourish/neglect. */
  prosperity: number;
  coins: number;
  /** Running work with real-world timers. */
  tasks: ActiveTask[];
  /** UTC day number (unix ms / 86400000, floored) of last check-in. */
  lastCheckInDay: number;
};

export type ActiveTask = {
  defId: string;
  startedAt: number;
  readyAt: number;
};

export const MAX_ACTIVE_TASKS = 2;

export type TaskDef = {
  id: string;
  trade: Trade;
  label: string;
  durationMs: number;
  reward: number;
};

const MIN = 60_000;
const HOUR = 3_600_000;

/** Three tiers per trade: quick taste (5m), standard (1h), overnight (8h). */
export const TASK_DEFS: readonly TaskDef[] = [
  { id: 'bake-rolls', trade: 'baker', label: 'Bake morning rolls', durationMs: 5 * MIN, reward: 5 },
  { id: 'market-order', trade: 'baker', label: 'Fill the market order', durationMs: 1 * HOUR, reward: 15 },
  { id: 'sourdough', trade: 'baker', label: 'Slow-prove the sourdough', durationMs: 8 * HOUR, reward: 40 },
  { id: 'water-beds', trade: 'farmer', label: 'Water the beds', durationMs: 5 * MIN, reward: 5 },
  { id: 'harvest-east', trade: 'farmer', label: 'Harvest the east field', durationMs: 1 * HOUR, reward: 15 },
  { id: 'compost', trade: 'farmer', label: 'Turn the compost', durationMs: 8 * HOUR, reward: 40 },
  { id: 'sand-benches', trade: 'carpenter', label: 'Sand the plaza benches', durationMs: 5 * MIN, reward: 5 },
  { id: 'fix-fence', trade: 'carpenter', label: 'Mend the plaza fence', durationMs: 1 * HOUR, reward: 15 },
  { id: 'mill-timber', trade: 'carpenter', label: 'Mill timber for the next build', durationMs: 8 * HOUR, reward: 40 },
  { id: 'tap-keg', trade: 'brewer', label: 'Tap a fresh keg', durationMs: 5 * MIN, reward: 5 },
  { id: 'amber-batch', trade: 'brewer', label: 'Brew the amber batch', durationMs: 1 * HOUR, reward: 15 },
  { id: 'cellar-stout', trade: 'brewer', label: 'Cellar the winter stout', durationMs: 8 * HOUR, reward: 40 },
];

export const taskDefById = (id: string): TaskDef | undefined => TASK_DEFS.find((d) => d.id === id);

export const tasksForTrade = (trade: Trade): TaskDef[] => TASK_DEFS.filter((d) => d.trade === trade);

export type TownState = {
  /** Buildings that exist right now (grows via daily votes). */
  buildings: BuildingId[];
  /** Total real citizens ever claimed. */
  population: number;
  foundedAt: number;
};
