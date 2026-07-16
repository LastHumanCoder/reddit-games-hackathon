import { reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'Will It Hold? - one sketchy bridge a day. Call it.',
    textFallback: {
      text: 'A truck is about to cross a very questionable bridge. Open on the app or web to call it: hold or collapse?',
    },
  });
};
