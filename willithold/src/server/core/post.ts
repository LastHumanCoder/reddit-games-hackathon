import { redis, reddit } from '@devvit/web/server';

/** Creates a numbered game post. Each post is its own permanent bridge. */
export const createPost = async () => {
  const n = await redis.incrBy('bridge_counter', 1);
  return await reddit.submitCustomPost({
    title: `Will It Hold? #${n} - call it.`,
    textFallback: {
      text: 'A truck is about to cross a very questionable bridge. Open on the app or web to call it: hold or collapse?',
    },
  });
};
