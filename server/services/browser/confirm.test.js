// browser_step confirmations (chunk 2E) against an in-memory action_log: yes runs the step and the
// gate gets the real outcome; no / Esc / expiry / stop decline it and the card can't be approved
// later; a browser_step nobody is waiting on does nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDecide, reportStep, executeParkedStep, describeStep, _waiting } from './confirm.js';

const U = 'u1';
const task = { id: 't1', source: 'chat' };
const step = { n: 4, action: 'click', target: 'Place order', url: 'https://shop.example.com/checkout', label: 'click "Place order"' };
const classification = { risk: 'confirm', reason: 'Click "Place order"' };

function fakes() {
  const rows = new Map();
  let seq = 0;
  const log = {
    rows,
    async insertAction(userId, row) {
      const r = { id: `a${++seq}`, ...row };
      rows.set(r.id, r);
      return r;
    },
    async getAction(userId, id) {
      return rows.get(id) ?? null;
    },
    async transition(userId, id, from, to) {
      const r = rows.get(id);
      if (!r || r.status !== from) return null;
      r.status = to;
      return r;
    }
  };
  const statuses = [];
  const store = { setStatus: async (u, id, from, to) => statuses.push(`${from}->${to}`) };
  const events = [];
  const hub = { emit: (u, e) => events.push(e) };
  return { log, store, hub, statuses, events };
}

const decideWith = (f, extra = {}) => makeDecide({ userId: U, task, store: f.store, hub: f.hub, log: f.log, pollMs: 10, ...extra });

test('the readback names the site and the exact step', () => {
  assert.equal(describeStep(step, classification.reason), 'On shop.example.com: Click "Place order"');
});

test('yes: the gate releases the step, the loop runs it, the gate gets the real outcome', async () => {
  const f = fakes();
  const decision = decideWith(f)(step, classification);
  await new Promise((r) => setTimeout(r, 20));
  const row = [...f.log.rows.values()][0];
  assert.equal(row.tool, 'browser_step');
  assert.equal(row.status, 'awaiting_confirmation');
  assert.equal(row.summary, 'On shop.example.com: Click "Place order"');
  assert.deepEqual(f.events.map((e) => e.type), ['needs_confirmation']);
  assert.equal(f.events[0].confirmation_id, row.id);

  row.status = 'confirmed'; // what resolvePending does before calling the handler
  const handled = executeParkedStep(U, row.args);
  assert.equal(await decision, 'execute');
  reportStep(U, task.id, { ...step, status: 'done' }); // the loop ran it
  assert.deepEqual(await handled, { ok: true, message: 'Done: click "Place order".', url: step.url });
  assert.deepEqual(f.statuses, ['running->waiting_confirmation', 'waiting_confirmation->running']);
  assert.equal(_waiting.size, 0);
});

test('a failed step reports failure to the gate', async () => {
  const f = fakes();
  const decision = decideWith(f)(step, classification);
  await new Promise((r) => setTimeout(r, 20));
  const row = [...f.log.rows.values()][0];
  const handled = executeParkedStep(U, row.args);
  await decision;
  reportStep(U, task.id, { ...step, status: 'failed', note: 'element covered' });
  assert.deepEqual(await handled, { ok: false, error: "The step didn't work: element covered" });
});

test('no (cancelled card) → declined', async () => {
  const f = fakes();
  const decision = decideWith(f)(step, classification);
  await new Promise((r) => setTimeout(r, 20));
  [...f.log.rows.values()][0].status = 'cancelled';
  assert.equal(await decision, 'decline');
  assert.equal(_waiting.size, 0);
});

test('task stopped while waiting → declined and the card is cancelled', async () => {
  const f = fakes();
  const abort = new AbortController();
  const decision = decideWith(f, { signal: abort.signal })(step, classification);
  await new Promise((r) => setTimeout(r, 20));
  abort.abort();
  assert.equal(await decision, 'decline');
  assert.equal([...f.log.rows.values()][0].status, 'cancelled');
});

test('no answer within the window → declined and the card expires', async () => {
  const f = fakes();
  const decision = decideWith(f, { ttlMs: -4950 })(step, classification); // deadline ≈ 50 ms
  assert.equal(await decision, 'decline');
  assert.equal([...f.log.rows.values()][0].status, 'expired');
});

test('a browser_step nobody is waiting on does nothing', async () => {
  const r = await executeParkedStep(U, { task_id: 'nope', n: 1 });
  assert.equal(r.ok, false);
  assert.match(r.error, /no longer waiting/);
});
