import { Hono } from 'hono';
import { ensurePrompt, todayUtc } from '../core/game';
import { createGamePost } from '../core/post';

export const scheduler = new Hono();

/**
 * Daily cron (00:00 UTC): assign the day's prompt — popping the next
 * mod-approved community submission, or falling back to the bundled list —
 * and publish a fresh game post so the subreddit gets a new round every day.
 */
scheduler.post('/daily-prompt', async (c) => {
  const date = todayUtc();
  const prompt = await ensurePrompt(date);
  try {
    await createGamePost(prompt);
  } catch (error) {
    // The prompt is already set for the day; a failed post submission should
    // not fail the task (players can still play from older posts).
    console.error('daily post creation failed', error);
  }
  return c.json({ status: 'ok', date, day: prompt.day }, 200);
});
