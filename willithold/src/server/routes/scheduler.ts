import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';

export const scheduler = new Hono();

// Scheduler task: posts a fresh bridge every 6 hours (00/06/12/18 UTC).
scheduler.post('/new-bridge', async (c) => {
  try {
    const post = await createPost();
    console.log(`Scheduled bridge post created: ${post.id} in r/${context.subredditName}`);
    return c.json({ status: 'success', postId: post.id }, 200);
  } catch (error) {
    console.error(`Scheduled post failed: ${error}`);
    return c.json({ status: 'error', message: 'Failed to create scheduled post' }, 500);
  }
});
