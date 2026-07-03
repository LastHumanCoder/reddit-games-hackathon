import type { Citizen, TownState, Trade } from './types';

export type TownSnapshotResponse = {
  type: 'town';
  town: TownState;
  citizens: Citizen[];
  /** The requesting user's citizen, if claimed. */
  me: Citizen | null;
  /** False when the viewer is logged out (claim must prompt login). */
  loggedIn: boolean;
};

export type ClaimRequest = {
  trade: Trade;
};

export type ClaimResponse = {
  type: 'claim';
  citizen: Citizen;
};

export type TaskRequest = {
  defId: string;
};

export type TaskStartResponse = {
  type: 'task-start';
  citizen: Citizen;
};

export type TaskCollectResponse = {
  type: 'task-collect';
  citizen: Citizen;
  reward: number;
};

export type ApiError = {
  status: 'error';
  message: string;
};
