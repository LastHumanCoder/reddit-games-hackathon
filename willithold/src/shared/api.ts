/** Shared types between client and server. */

export type Guess = 'hold' | 'collapse';
export type Outcome = 'hold' | 'collapse';

export type Crowd = {
  hold: number;
  collapse: number;
};

export type InitResponse = {
  type: 'init';
  /** Deterministic seed for today's bridge. */
  seed: number;
  /** UTC date key yyyy-mm-dd. */
  date: string;
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
};

export type ApiError = {
  status: 'error';
  message: string;
};
