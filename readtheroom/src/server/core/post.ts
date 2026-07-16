import { reddit } from '@devvit/web/server';
import type { PromptData } from '../../shared/api';

/** Creates a Read the Room game post for the given day's prompt. */
export const createGamePost = async (prompt: PromptData) => {
  return await reddit.submitCustomPost({
    title: `Read the Room #${prompt.day} - ${prompt.question}`,
    textFallback: {
      text: 'Read the Room is a daily crowd-guessing game. Open this post on the Reddit app or new Reddit to play.',
    },
  });
};
