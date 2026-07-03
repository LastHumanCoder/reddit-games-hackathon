import { reddit } from '@devvit/web/server';
import { seedNpcs } from './citizens';

export const createPost = async () => {
  await seedNpcs();
  return await reddit.submitCustomPost({
    title: 'Littlewick — a tiny town that lives while you’re away',
    textFallback: {
      text: 'Littlewick is a living town on Reddit. Visit on the app or web to claim your citizen.',
    },
  });
};
