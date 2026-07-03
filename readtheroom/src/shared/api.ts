/** Number of histogram buckets used for the reveal (0–100 split into 5-point bins). */
export const BIN_COUNT = 20;

/** A daily slider prompt: a question with two labeled poles on a 0–100 spectrum. */
export type PromptData = {
  id: string;
  question: string;
  /** Label for the 0 end of the spectrum. */
  left: string;
  /** Label for the 100 end of the spectrum. */
  right: string;
  /** Reddit username of the community member who submitted it, if any. */
  author: string | null;
  /** 1-based day number ("Issue No."). */
  day: number;
  /** UTC date key, yyyy-mm-dd. */
  date: string;
};

/** Everything needed to render the post-guess reveal. */
export type RevealData = {
  /** Guess counts bucketed into BIN_COUNT bins. */
  bins: number[];
  /** Live crowd mean, 0–100 (one decimal). */
  mean: number;
  /** Total number of players who guessed today. */
  total: number;
  /** This player's guess, 0–100. */
  guess: number;
  /** This player's locked-in score, 0–100. */
  score: number;
};

export type PlayerStats = {
  streak: number;
  bestStreak: number;
  gamesPlayed: number;
  avgScore: number;
};

export type LeaderboardRow = {
  username: string;
  score: number;
  isYou: boolean;
};

export type InitResponse = {
  type: 'init';
  prompt: PromptData;
  loggedIn: boolean;
  username: string | null;
  /** Non-null when the player already guessed today. */
  reveal: RevealData | null;
  stats: PlayerStats | null;
  leaderboard: LeaderboardRow[];
};

export type SplashResponse = {
  type: 'splash';
  question: string;
  left: string;
  right: string;
  day: number;
  players: number;
};

export type GuessRequest = {
  /** Slider value, integer 0–100. */
  value: number;
};

export type GuessResponse = {
  type: 'guess';
  reveal: RevealData;
  stats: PlayerStats;
  leaderboard: LeaderboardRow[];
};

export type SubmitPromptRequest = {
  question: string;
  left: string;
  right: string;
};

export type SubmitPromptResponse = {
  type: 'submitPrompt';
  message: string;
};

export type ApiError = {
  status: 'error';
  message: string;
};
