import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type {
  ApiError,
  ClaimRequest,
  ClaimResponse,
  TaskCollectResponse,
  TaskRequest,
  TaskStartResponse,
  TownSnapshotResponse,
} from '../../shared/api';
import { TRADES, type Trade } from '../../shared/types';
import {
  claimCitizen,
  collectTask,
  getAllCitizens,
  getCitizen,
  seedNpcs,
  startTask,
  type TaskError,
} from '../core/citizens';
import { getTown } from '../core/town';

const TASK_ERROR_MESSAGES: Record<TaskError, string> = {
  'not-claimed': 'Claim a citizen first',
  'unknown-task': 'Unknown task',
  'wrong-trade': 'That’s not your trade',
  'slots-full': 'Your hands are full — finish something first',
  'already-running': 'That’s already in progress',
  'not-ready': 'Not ready yet — patience!',
  'not-found': 'That task isn’t running',
};

export const api = new Hono();

api.get('/town', async (c) => {
  try {
    await seedNpcs();
    const { userId } = context;
    const [town, citizens, me] = await Promise.all([
      getTown(),
      getAllCitizens(),
      userId ? getCitizen(userId) : Promise.resolve(null),
    ]);

    return c.json<TownSnapshotResponse>({
      type: 'town',
      town,
      citizens,
      me,
      loggedIn: Boolean(userId),
    });
  } catch (error) {
    console.error('GET /api/town failed:', error);
    return c.json<ApiError>({ status: 'error', message: 'Could not load the town' }, 500);
  }
});

api.post('/claim', async (c) => {
  const { userId } = context;
  if (!userId) {
    return c.json<ApiError>({ status: 'error', message: 'Log in to claim a citizen' }, 401);
  }

  let body: ClaimRequest;
  try {
    body = await c.req.json<ClaimRequest>();
  } catch {
    return c.json<ApiError>({ status: 'error', message: 'Invalid request body' }, 400);
  }

  if (!TRADES.includes(body.trade as Trade)) {
    return c.json<ApiError>({ status: 'error', message: 'Unknown trade' }, 400);
  }

  try {
    const username = await reddit.getCurrentUsername();
    if (!username) {
      return c.json<ApiError>({ status: 'error', message: 'Could not resolve your username' }, 401);
    }
    const citizen = await claimCitizen(userId, username, body.trade);
    return c.json<ClaimResponse>({ type: 'claim', citizen });
  } catch (error) {
    console.error('POST /api/claim failed:', error);
    return c.json<ApiError>({ status: 'error', message: 'Claim failed — try again' }, 500);
  }
});

api.post('/task/start', async (c) => {
  const { userId } = context;
  if (!userId) {
    return c.json<ApiError>({ status: 'error', message: 'Log in first' }, 401);
  }
  let body: TaskRequest;
  try {
    body = await c.req.json<TaskRequest>();
  } catch {
    return c.json<ApiError>({ status: 'error', message: 'Invalid request body' }, 400);
  }
  try {
    const result = await startTask(userId, body.defId);
    if ('error' in result) {
      return c.json<ApiError>({ status: 'error', message: TASK_ERROR_MESSAGES[result.error] }, 400);
    }
    return c.json<TaskStartResponse>({ type: 'task-start', citizen: result.citizen });
  } catch (error) {
    console.error('POST /api/task/start failed:', error);
    return c.json<ApiError>({ status: 'error', message: 'Could not start the task' }, 500);
  }
});

api.post('/task/collect', async (c) => {
  const { userId } = context;
  if (!userId) {
    return c.json<ApiError>({ status: 'error', message: 'Log in first' }, 401);
  }
  let body: TaskRequest;
  try {
    body = await c.req.json<TaskRequest>();
  } catch {
    return c.json<ApiError>({ status: 'error', message: 'Invalid request body' }, 400);
  }
  try {
    const result = await collectTask(userId, body.defId);
    if ('error' in result) {
      return c.json<ApiError>({ status: 'error', message: TASK_ERROR_MESSAGES[result.error] }, 400);
    }
    return c.json<TaskCollectResponse>({
      type: 'task-collect',
      citizen: result.citizen,
      reward: result.reward,
    });
  } catch (error) {
    console.error('POST /api/task/collect failed:', error);
    return c.json<ApiError>({ status: 'error', message: 'Could not collect the task' }, 500);
  }
});
