import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { ensurePrompt, listPending, todayUtc } from '../core/game';
import { createGamePost } from '../core/post';

export const menu = new Hono();

/** Mod menu: create a fresh game post for today's prompt. */
menu.post('/post-create', async (c) => {
  try {
    const prompt = await ensurePrompt(todayUtc());
    const post = await createGamePost(prompt);
    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error('post-create failed', error);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});

/** Mod menu: review the community prompt queue via a simple form. */
menu.post('/review-queue', async (c) => {
  try {
    const pending = await listPending();
    if (pending.length === 0) {
      return c.json<UiResponse>(
        { showToast: 'The prompt queue is empty. Nothing to review.' },
        200
      );
    }
    const options = pending.slice(0, 20).map((p) => ({
      label: `#${p.id} "${p.question}" (${p.left} ↔ ${p.right})${
        p.author ? ` by u/${p.author}` : ''
      }`,
      value: p.id,
    }));
    return c.json<UiResponse>(
      {
        showForm: {
          name: 'reviewPromptForm',
          form: {
            title: 'Review prompt queue',
            description: `${pending.length} prompt(s) waiting. Approved prompts run on future days, oldest first.`,
            acceptLabel: 'Submit decision',
            fields: [
              {
                type: 'select',
                name: 'promptId',
                label: 'Prompt',
                required: true,
                options,
              },
              {
                type: 'select',
                name: 'decision',
                label: 'Decision',
                required: true,
                options: [
                  {
                    label: 'Approve — queue it as a daily prompt',
                    value: 'approve',
                  },
                  { label: 'Reject — remove it', value: 'reject' },
                ],
              },
            ],
          },
        },
      },
      200
    );
  } catch (error) {
    console.error('review-queue failed', error);
    return c.json<UiResponse>({ showToast: 'Failed to load the queue' }, 400);
  }
});
