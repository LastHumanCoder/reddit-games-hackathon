import type { BuildingId, Trade } from '../../shared/types';

/** Fixed world size — portrait, mobile-first. Camera covers and pans. */
export const WORLD_W = 1080;
export const WORLD_H = 1620;

export const PALETTE = {
  outline: 0x3e3428,
  sky: 0xcfe3d8,
  hillFar: 0xa3c9a8,
  hillNear: 0x8db38b,
  ground: 0xb8d18f,
  grassPatch: 0xaac57f,
  path: 0xdfc39a,
  pathEdge: 0xc9a97e,
  wall: 0xf7efdf,
  wallAlt: 0xf0e3cc,
  roofBakery: 0xcd6f47,
  roofFarm: 0xb5533c,
  roofSawmill: 0x7d8ca3,
  roofTavern: 0x8e5f90,
  roofCottage: 0x8aa367,
  window: 0xf2c14e,
  treeTrunk: 0x8b6b4a,
  treeCanopy: 0x7fb069,
  treeCanopyDark: 0x6a9b5e,
  stone: 0x9aa0a8,
  water: 0x86b6c2,
  shadow: 0x3e3428,
} as const;

export type BuildingSpec = {
  id: BuildingId;
  label: string;
  x: number;
  y: number;
  /** Texture key generated in Preloader. */
  texture: string;
  /** Where citizens stand when visiting (world coords). */
  door: { x: number; y: number };
};

export const BUILDINGS: Record<BuildingId, BuildingSpec> = {
  plaza: {
    id: 'plaza',
    label: 'Town Plaza',
    x: 540,
    y: 920,
    texture: 'plaza',
    door: { x: 540, y: 950 },
  },
  well: {
    id: 'well',
    label: 'Old Well',
    x: 540,
    y: 850,
    texture: 'well',
    door: { x: 540, y: 900 },
  },
  bakery: {
    id: 'bakery',
    label: 'Bakery',
    x: 260,
    y: 620,
    texture: 'bakery',
    door: { x: 260, y: 700 },
  },
  farm: {
    id: 'farm',
    label: 'Farm',
    x: 810,
    y: 1290,
    texture: 'farm',
    door: { x: 810, y: 1380 },
  },
  sawmill: {
    id: 'sawmill',
    label: 'Sawmill',
    x: 830,
    y: 600,
    texture: 'sawmill',
    door: { x: 830, y: 690 },
  },
  tavern: {
    id: 'tavern',
    label: 'Tavern',
    x: 250,
    y: 1230,
    texture: 'tavern',
    door: { x: 250, y: 1320 },
  },
};

export const TRADE_WORKPLACE_DOOR: Record<Trade, { x: number; y: number }> = {
  baker: BUILDINGS.bakery.door,
  farmer: BUILDINGS.farm.door,
  carpenter: BUILDINGS.sawmill.door,
  brewer: BUILDINGS.tavern.door,
};

/** Spots citizens wander between (plaza-ish social points + building doors). */
export const WANDER_POINTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 540, y: 950 },
  { x: 470, y: 1010 },
  { x: 620, y: 1000 },
  { x: 540, y: 900 },
  BUILDINGS.bakery.door,
  BUILDINGS.farm.door,
  BUILDINGS.sawmill.door,
  BUILDINGS.tavern.door,
  { x: 400, y: 780 },
  { x: 700, y: 800 },
  { x: 360, y: 1120 },
  { x: 690, y: 1150 },
];

export const TREES: ReadonlyArray<{ x: number; y: number; s: number }> = [
  { x: 90, y: 500, s: 1.0 },
  { x: 170, y: 430, s: 0.8 },
  { x: 960, y: 460, s: 1.1 },
  { x: 1010, y: 780, s: 0.85 },
  { x: 80, y: 950, s: 0.9 },
  { x: 120, y: 1450, s: 1.05 },
  { x: 560, y: 1480, s: 0.9 },
  { x: 980, y: 1050, s: 0.95 },
  { x: 460, y: 540, s: 0.75 },
];

/** Deterministic PRNG so the hand-drawn wobble is stable across sessions. */
export const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Stable small hash for strings (citizen ids → variant selection). */
export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
