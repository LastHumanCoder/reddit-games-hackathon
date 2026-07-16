export const keys = {
  puzzle: (postId: string, date: string) => `puzzle:${postId}:${date}`,
  guess: (postId: string, date: string, userId: string) => `guess:${postId}:${date}:${userId}`,
  tally: (postId: string, date: string) => `tally:${postId}:${date}`,
  streak: (userId: string) => `streak:${userId}`,
  best: (userId: string) => `best:${userId}`,
};
