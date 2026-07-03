/**
 * Central registry of every Redis key the app uses. Keys are stable and
 * date-scoped — no scanning, no sets/lists, only strings, hashes and zsets.
 */
export const keys = {
  /** Hash: { id, question, left, right, author, day } for a given UTC date. */
  prompt: (date: string): string => `rtr:prompt:${date}`,
  /** Hash: userId -> guess value (0–100) for a given day. */
  guesses: (date: string): string => `rtr:guesses:${date}`,
  /** String counter: sum of all guess values for a day (for the mean). */
  guessSum: (date: string): string => `rtr:sum:${date}`,
  /** String counter: number of guesses for a day. */
  guessCount: (date: string): string => `rtr:count:${date}`,
  /** Hash: bin index ("0".."19") -> count, the reveal histogram. */
  bins: (date: string): string => `rtr:bins:${date}`,
  /** Sorted set: userId -> locked-in score, the daily leaderboard. */
  leaderboard: (date: string): string => `rtr:lb:${date}`,
  /** Hash: userId -> username, so leaderboards can show names. */
  usernames: 'rtr:unames',
  /** Hash: per-player stats { streak, best, played, scoreSum, lastDate }. */
  player: (userId: string): string => `rtr:player:${userId}`,
  /** Hash: pending community submissions, id -> JSON. */
  pendingQueue: 'rtr:pending',
  /** String counter: next pending submission id. */
  pendingCounter: 'rtr:pending:counter',
  /** Hash: approved prompt queue, index -> JSON. */
  approvedQueue: 'rtr:approved',
  /** String counter: next approved index to consume. */
  approvedHead: 'rtr:approved:head',
  /** String counter: next approved index to write. */
  approvedTail: 'rtr:approved:tail',
  /** String counter: cursor into the bundled prompt list. */
  bundledCursor: 'rtr:bundled:cursor',
  /** String counter: global day number ("Issue No."). */
  dayCounter: 'rtr:day:counter',
} as const;
