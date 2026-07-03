import { Hono } from 'hono';
import type { TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { ensurePrompt, todayUtc } from '../core/game';
import { createGamePost } from '../core/post';

export const triggers = new Hono();

/** On install: set up day 1's prompt and drop the first game post. */
triggers.post('/on-app-install', async (c) => {
  try {
    const prompt = await ensurePrompt(todayUtc());
    const post = await createGamePost(prompt);
    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Read the Room installed in r/${context.subredditName}; first post ${post.id} created for day ${prompt.day}.`,
      },
      200
    );
  } catch (error) {
    console.error('on-app-install failed', error);
    return c.json<TriggerResponse>(
      { status: 'error', message: 'Failed to create the first game post' },
      400
    );
  }
});
