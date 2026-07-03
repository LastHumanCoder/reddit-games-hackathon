import { showLoginPrompt } from '@devvit/web/client';
import type {
  ApiError,
  ClaimResponse,
  TaskCollectResponse,
  TaskStartResponse,
  TownSnapshotResponse,
} from '../shared/api';
import type { Citizen } from '../shared/types';
import { MAX_ACTIVE_TASKS, TRADES, TRADE_INFO, taskDefById, tasksForTrade } from '../shared/types';

type UiHooks = {
  onClaimed: (citizen: Citizen) => void;
};

let hooks: UiHooks | null = null;
let snapshot: TownSnapshotResponse | null = null;
let ticker: number | null = null;

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
};

export const initUi = (h: UiHooks): void => {
  hooks = h;

  el('claim-button').addEventListener('click', () => {
    if (!snapshot) return;
    if (!snapshot.loggedIn) {
      showLoginPrompt();
      return;
    }
    openClaimModal();
  });

  el('claim-close').addEventListener('click', () => {
    el('claim-modal').hidden = true;
  });
  el('claim-modal').addEventListener('click', (e) => {
    if (e.target === el('claim-modal')) el('claim-modal').hidden = true;
  });

  el('task-close').addEventListener('click', () => {
    el('task-sheet-modal').hidden = true;
  });
  el('task-sheet-modal').addEventListener('click', (e) => {
    if (e.target === el('task-sheet-modal')) el('task-sheet-modal').hidden = true;
  });
};

export const setSnapshot = (s: TownSnapshotResponse): void => {
  snapshot = s;
  el('population').textContent = `${s.citizens.length} townsfolk`;
  el('claim-bar').hidden = s.me !== null;
  el('work-bar').hidden = s.me === null;
  if (s.me) renderMe(s.me);
};

const applyCitizen = (citizen: Citizen): void => {
  if (!snapshot) return;
  snapshot.me = citizen;
  const idx = snapshot.citizens.findIndex((c) => c.id === citizen.id);
  if (idx >= 0) snapshot.citizens[idx] = citizen;
  else snapshot.citizens.push(citizen);
  setSnapshot(snapshot);
};

const renderMe = (me: Citizen): void => {
  el('me-chip').hidden = false;
  el('me-name').textContent = me.username;
  el('me-trade').textContent = TRADE_INFO[me.trade].label;
  el('me-coins').textContent = `🪙 ${me.coins}`;
  el('me-streak').textContent = `🔥 ${me.streak}`;
  renderTaskSlots(me);
  if (ticker === null) {
    ticker = window.setInterval(() => {
      if (snapshot?.me) renderTaskSlots(snapshot.me);
    }, 1000);
  }
};

const fmtRemaining = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}:${sec.toString().padStart(2, '0')}`;
  return `${sec}s`;
};

const fmtDuration = (ms: number): string => {
  if (ms >= 3_600_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 60_000)}m`;
};

let slotsSignature = '';

/**
 * Rebuild the slot DOM only when structure changes (task set / readiness);
 * otherwise just refresh countdown text in place. A per-second innerHTML
 * rebuild would destroy buttons mid-click and eat tap events.
 */
const renderTaskSlots = (me: Citizen): void => {
  const slots = el('task-slots');
  const now = Date.now();
  const signature =
    me.tasks.map((t) => `${t.defId}:${now >= t.readyAt ? 'r' : 'p'}`).join(',') +
    (me.tasks.length < MAX_ACTIVE_TASKS ? '|add' : '');

  if (signature !== slotsSignature) {
    slotsSignature = signature;
    slots.innerHTML = '';

    for (const task of me.tasks) {
      const def = taskDefById(task.defId);
      if (!def) continue;
      const ready = now >= task.readyAt;
      const card = document.createElement('button');
      card.className = ready ? 'task-slot ready' : 'task-slot';
      card.dataset.defId = task.defId;
      card.innerHTML = `<span class="slot-label">${def.label}</span><span class="slot-sub">${
        ready ? `Collect 🪙 ${def.reward}!` : `⏳ ${fmtRemaining(task.readyAt - now)}`
      }</span>`;
      if (ready) {
        card.addEventListener('click', () => void collect(task.defId));
      }
      slots.appendChild(card);
    }

    if (me.tasks.length < MAX_ACTIVE_TASKS) {
      const add = document.createElement('button');
      add.className = 'task-slot empty';
      add.innerHTML = `<span class="slot-label">+ Start a job</span>`;
      add.addEventListener('click', () => {
        if (snapshot?.me) openTaskSheet(snapshot.me);
      });
      slots.appendChild(add);
    }
    return;
  }

  // In-place countdown refresh for pending tasks.
  for (const task of me.tasks) {
    if (now >= task.readyAt) continue;
    const card = slots.querySelector(`[data-def-id="${task.defId}"] .slot-sub`);
    if (card) card.textContent = `⏳ ${fmtRemaining(task.readyAt - now)}`;
  }
};

const openTaskSheet = (me: Citizen): void => {
  const list = el('task-list');
  list.innerHTML = '';
  for (const def of tasksForTrade(me.trade)) {
    const running = me.tasks.some((t) => t.defId === def.id);
    const option = document.createElement('button');
    option.className = 'task-option';
    option.disabled = running;
    option.innerHTML = `<span class="opt-label">${def.label}</span><span class="opt-meta">${
      running ? 'In progress' : `${fmtDuration(def.durationMs)} · 🪙 ${def.reward}`
    }</span>`;
    option.addEventListener('click', () => void start(def.id));
    list.appendChild(option);
  }
  el('task-sheet-modal').hidden = false;
};

const start = async (defId: string): Promise<void> => {
  try {
    const res = await fetch('/api/task/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defId }),
    });
    const data = (await res.json()) as TaskStartResponse | ApiError;
    if (!res.ok || !('citizen' in data)) {
      toast('message' in data ? data.message : 'Could not start the job');
      return;
    }
    el('task-sheet-modal').hidden = true;
    applyCitizen(data.citizen);
    toast('Work started — come back when it’s done!');
  } catch (error) {
    console.error('start task failed:', error);
    toast('Could not start the job');
  }
};

const collect = async (defId: string): Promise<void> => {
  try {
    const res = await fetch('/api/task/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defId }),
    });
    const data = (await res.json()) as TaskCollectResponse | ApiError;
    if (!res.ok || !('citizen' in data)) {
      toast('message' in data ? data.message : 'Could not collect');
      return;
    }
    applyCitizen(data.citizen);
    coinFloat(data.reward);
  } catch (error) {
    console.error('collect task failed:', error);
    toast('Could not collect');
  }
};

const coinFloat = (amount: number): void => {
  const float = document.createElement('div');
  float.className = 'coin-float';
  float.textContent = `+${amount} 🪙`;
  el('app').appendChild(float);
  window.setTimeout(() => float.remove(), 1300);
};

export const showError = (message: string): void => {
  toast(message);
};

const toast = (message: string): void => {
  const node = el('toast');
  node.textContent = message;
  node.classList.add('show');
  window.setTimeout(() => node.classList.remove('show'), 2600);
};

const openClaimModal = (): void => {
  const grid = el('trade-grid');
  grid.innerHTML = '';
  for (const trade of TRADES) {
    const info = TRADE_INFO[trade];
    const card = document.createElement('button');
    card.className = 'trade-card';
    card.style.setProperty('--accent', info.color);
    card.innerHTML = `<span class="trade-name">${info.label}</span><span class="trade-blurb">${info.blurb}</span>`;
    card.addEventListener('click', () => void claim(trade));
    grid.appendChild(card);
  }
  el('claim-modal').hidden = false;
};

const claim = async (trade: (typeof TRADES)[number]): Promise<void> => {
  try {
    const res = await fetch('/api/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trade }),
    });
    const data = (await res.json()) as ClaimResponse | ApiError;
    if (!res.ok || !('citizen' in data)) {
      toast('message' in data ? data.message : 'Claim failed — try again');
      return;
    }
    el('claim-modal').hidden = true;
    applyCitizen(data.citizen);
    toast(`Welcome to Littlewick, ${TRADE_INFO[data.citizen.trade].label} ${data.citizen.username}!`);
    hooks?.onClaimed(data.citizen);
  } catch (error) {
    console.error('Claim failed:', error);
    toast('Claim failed — try again');
  }
};
