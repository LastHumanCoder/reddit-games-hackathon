export const keys = {
  puzzle: (postId: string) => `puzzle:${postId}`,
  guess: (postId: string, userId: string) => `guess:${postId}:${userId}`,
  tally: (postId: string) => `tally:${postId}`,
  streak: (userId: string) => `streak:${userId}`,
  best: (userId: string) => `best:${userId}`,
};
