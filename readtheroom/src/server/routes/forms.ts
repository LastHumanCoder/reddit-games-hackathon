import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { approvePending, rejectPending } from '../core/game';

export const forms = new Hono();

/**
 * Select fields may arrive as a string or an array of strings depending on
 * the client; accept both without casting.
 */
const pickString = (v: unknown): string | null => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
  return null;
};

type ReviewFormBody = {
  promptId?: unknown;
  decision?: unknown;
  values?: unknown;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** Handles the mod decision from the review-queue form. */
forms.post('/review-prompt', async (c) => {
  const fallback: ReviewFormBody = {};
  const body = await c.req.json<ReviewFormBody>().catch(() => fallback);
  const nested = isRecord(body.values) ? body.values : {};
  const promptId = pickString(body.promptId) ?? pickString(nested['promptId']);
  const decision = pickString(body.decision) ?? pickString(nested['decision']);

  if (!promptId || (decision !== 'approve' && decision !== 'reject')) {
    return c.json<UiResponse>(
      { showToast: 'Pick a prompt and a decision.' },
      200
    );
  }

  try {
    if (decision === 'approve') {
      const ok = await approvePending(promptId);
      return c.json<UiResponse>(
        {
          showToast: ok
            ? `Prompt #${promptId} approved — it will run on an upcoming day.`
            : `Prompt #${promptId} was not found (already handled?).`,
        },
        200
      );
    }
    const ok = await rejectPending(promptId);
    return c.json<UiResponse>(
      {
        showToast: ok
          ? `Prompt #${promptId} rejected and removed.`
          : `Prompt #${promptId} was not found (already handled?).`,
      },
      200
    );
  } catch (error) {
    console.error('review-prompt failed', error);
    return c.json<UiResponse>(
      { showToast: 'Failed to save the decision' },
      400
    );
  }
});
