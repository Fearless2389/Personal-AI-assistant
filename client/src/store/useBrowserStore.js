// Browser-agent tasks as the UI knows them (PLAN.md Week 3). Filled by lib/browserBridge.js from the
// server's event stream (GET /api/browser/events) plus a catch-up read whenever the stream (re)connects.
//   tasks:  id → the browser_tasks row, plus seenAt (when an event last touched it, so a catch-up
//           read never overwrites newer news). A step waiting for a yes is a ConfirmCard
//           (useConfirmStore, origin 'browser'), found with confirmations.js#browserCardFor.
//   steps:  task id → steps in order (live events, or fetched once when a card opens an older task)
//   notice: the task that just ended, shown once ("Added … to cart · View"), or null
import { create } from 'zustand';

export const LIVE = new Set(['running', 'waiting_user', 'waiting_confirmation']);
export const FINAL = new Set(['done', 'failed', 'stopped']);

export const useBrowserStore = create(() => ({ tasks: {}, steps: {}, notice: null }));

/** The task holding the slot (running or waiting on Ruthvik), if any: there is at most one. */
export const selectLive = (s) => Object.values(s.tasks).find((t) => LIVE.has(t.status)) ?? null;

/** How many tasks wait in the queue behind it. */
export const selectQueued = (s) => Object.values(s.tasks).filter((t) => t.status === 'queued').length;
