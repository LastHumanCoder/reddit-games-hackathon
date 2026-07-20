/** Shared types between client and server. */

export type Guess = 'hold' | 'collapse';
export type Outcome = 'hold' | 'collapse';

export type Crowd = {
  hold: number;
  collapse: number;
};

export type InitResponse = {
  type: 'init';
  /** Deterministic per-post seed. Each post is its own permanent bridge. */
  seed: number;
  loggedIn: boolean;
  alreadyPlayed: boolean;
  yourGuess: Guess | null;
  /** Recorded outcome (first-write-wins), if anyone finished the sim today. */
  outcome: Outcome | null;
  crowd: Crowd;
  streak: number;
  best: number;
};

export type GuessResponse = {
  type: 'guess';
  crowd: Crowd;
};

export type ResultResponse = {
  type: 'result';
  outcome: Outcome;
  correct: boolean;
  streak: number;
  best: number;
  crowd: Crowd;
  /** Lifetime accuracy 0-100. */
  accuracy: number;
  /** "Top X%" among players with 3+ games, or null when hidden. */
  rankTopPct: number | null;
  /** Last 9 results: 'h'/'c' outcome letters, uppercase = correct call. */
  recent: string;
};

export type LeaderboardEntry = {
  username: string;
  streak: number;
  best: number;
};

export type LeaderboardResponse = {
  type: 'leaderboard';
  top: LeaderboardEntry[];
  you: LeaderboardEntry | null;
};

export type ApiError = {
  status: 'error';
  message: string;
};
