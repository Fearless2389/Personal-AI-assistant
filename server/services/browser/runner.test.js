// runner.js with an in-memory task store and a fake loop: queue order (D5), the slot held while a
// task waits on Ruthvik, the answer timeout, stop / stop-all, answer → resume, crash recovery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunner } from './runner.js';
import { ACTIVE_STATUSES, OPEN_STATUSES, FINAL_STATUSES } from './taskStore.js';

const U = 'user-1';
const tick = () => new Promise((r) => setTimeout(r, 15));

function memoryStore() {
  const tasks = [];
  const steps = [];
  let seq = 0;
  const find = (id) => tasks.find((t) => t.id === id) ?? null;
  return {
    tasks,
    steps,
    async createTask(userId, { goal, kind, startUrl, source }) {
      const t = { id: `t${++seq}`, user_id: userId, goal, kind, start_url: startUrl, source, status: 'queued', created: seq };
      tasks.push(t);
      return { ...t };
    },
    async setStatus(userId, id, from, to, patch = {}) {
      const t = find(id);
      const ok = t && t.user_id === userId && (Array.isArray(from) ? from.includes(t.status) : t.status === from);
      if (!ok) return null;
      Object.assign(t, patch, { status: to });
      return { ...t };
    },
    async patchTask(userId, id, patch) {
      const t = find(id);
      if (t && OPEN_STATUSES.includes(t.status)) Object.assign(t, patch);
    },
    async addStep(userId, taskId, step) {
      steps.push({ taskId, ...step });
      return step;
    },
    async getTask(userId, id) {
      const t = find(id);
      return t ? { ...t } : null;
    },
    async activeTask(userId) {
      return tasks.find((t) => t.user_id === userId && ACTIVE_STATUSES.includes(t.status)) ?? null;
    },
    async queuedTasks(userId) {
      return tasks.filter((t) => t.user_id === userId && t.status === 'queued').sort((a, b) => a.created - b.created);
    },
    async nextQueued(userId) {
      return (await this.queuedTasks(userId))[0] ?? null;
    },
    async stopOrphans() {
      const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
      for (const t of open) t.status = 'stopped';
      return open.length;
    }
  };
}

// A fake loop: each run waits until the test settles it (or the task is aborted).
function fakeLoop() {
  const runs = [];
  const run = (opts) =>
    new Promise((resolve) => {
      const r = { opts, resolve, page: { closed: false, close: async () => (r.page.closed = true) } };
      runs.push(r);
      const result = (status, extra = {}) => ({ status, summary: '', steps: [], collected: [], page: opts.page, ...extra });
      r.finish = (status = 'done', extra = {}) => resolve(result(status, { success: true, summary: 'ok', ...extra }));
      r.ask = (question) => resolve(result('waiting_user', { question, state: { n: 1 } }));
      opts.signal.addEventListener('abort', () => resolve(result('stopped')));
    });
  return { runs, run };
}

function setup(extra = {}) {
  const store = memoryStore();
  const loop = fakeLoop();
  const events = [];
  const pages = [];
  const runner = createRunner({
    store,
    run: loop.run,
    openPage: async () => {
      const p = { closed: false, close: async () => (p.closed = true) };
      pages.push(p);
      return p;
    },
    hub: { emit: (userId, e) => events.push(e) },
    log: { warn() {}, error() {} },
    ...extra
  });
  const statusOf = (id) => store.tasks.find((t) => t.id === id).status;
  return { store, loop, events, pages, runner, statusOf };
}

test('tasks run one at a time, in order; the next starts when one ends', async () => {
  const { runner, loop, statusOf } = setup();
  const a = await runner.startTask(U, { goal: 'A', source: 'chat' });
  const b = await runner.startTask(U, { goal: 'B', source: 'chat' });
  const c = await runner.startTask(U, { goal: 'C', source: 'chat' });
  assert.deepEqual([a.position, b.position, c.position], [0, 1, 2]);
  assert.deepEqual([statusOf(a.task.id), statusOf(b.task.id), statusOf(c.task.id)], ['running', 'queued', 'queued']);
  assert.equal(loop.runs.length, 1);

  loop.runs[0].finish();
  await tick();
  assert.equal(statusOf(a.task.id), 'done');
  assert.equal(statusOf(b.task.id), 'running');
  assert.equal(loop.runs[1].opts.goal, 'B');
});

test('a task waiting for an answer keeps the slot; answering resumes it with the saved state', async () => {
  const { runner, loop, statusOf } = setup();
  const a = await runner.startTask(U, { goal: 'A', source: 'chat' });
  const b = await runner.startTask(U, { goal: 'B', source: 'chat' });
  loop.runs[0].ask('Which size?');
  await tick();
  assert.equal(statusOf(a.task.id), 'waiting_user');
  assert.equal(statusOf(b.task.id), 'queued');

  await runner.answerTask(U, a.task.id, 'M');
  assert.equal(statusOf(a.task.id), 'running');
  assert.deepEqual([loop.runs[1].opts.answer, loop.runs[1].opts.resume], ['M', { n: 1 }]);
  assert.equal(loop.runs[1].opts.startUrl, null); // a resume doesn't reload the start page
  loop.runs[1].finish();
  await tick();
  assert.equal(statusOf(b.task.id), 'running');
});

test('no answer within the timeout stops the task and frees the slot', async () => {
  const { runner, loop, statusOf, pages, store } = setup({ answerTimeoutMs: 30 });
  const a = await runner.startTask(U, { goal: 'A', source: 'chat' });
  const b = await runner.startTask(U, { goal: 'B', source: 'chat' });
  loop.runs[0].ask('Which size?');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(statusOf(a.task.id), 'stopped');
  assert.match(store.tasks.find((t) => t.id === a.task.id).summary, /^No answer for/);
  assert.equal(pages[0].closed, true);
  assert.equal(statusOf(b.task.id), 'running');
});

test('stop: the running task aborts and the next starts; a queued task is just marked stopped', async () => {
  const { runner, loop, statusOf, store } = setup();
  const a = await runner.startTask(U, { goal: 'A', source: 'chat' });
  const b = await runner.startTask(U, { goal: 'B', source: 'chat' });
  const c = await runner.startTask(U, { goal: 'C', source: 'chat' });
  await runner.stopTask(U, b.task.id);
  assert.equal(statusOf(b.task.id), 'stopped');

  await runner.stopTask(U, a.task.id, 'Stopped by Ruthvik.');
  await tick();
  assert.equal(statusOf(a.task.id), 'stopped');
  assert.equal(store.tasks.find((t) => t.id === a.task.id).summary, 'Stopped by Ruthvik.');
  assert.equal(statusOf(c.task.id), 'running');
  assert.equal(loop.runs.length, 2);
});

test('stop-all stops the active task and the whole queue; nothing new starts', async () => {
  const { runner, loop, statusOf } = setup();
  const ids = [];
  for (const g of ['A', 'B', 'C']) ids.push((await runner.startTask(U, { goal: g, source: 'voice' })).task.id);
  const r = await runner.stopAll(U);
  await tick();
  assert.equal(r.stopped, 3);
  assert.deepEqual(ids.map(statusOf), ['stopped', 'stopped', 'stopped']);
  assert.equal(loop.runs.length, 1);
});

test('stopping a task that waits for an answer finishes it at once', async () => {
  const { runner, loop, statusOf } = setup();
  const a = await runner.startTask(U, { goal: 'A', source: 'chat' });
  loop.runs[0].ask('Which size?');
  await tick();
  await runner.stopTask(U, a.task.id);
  assert.equal(statusOf(a.task.id), 'stopped');
  await assert.rejects(runner.answerTask(U, a.task.id, 'M'), { code: 'not_waiting' });
});

test('the queue is capped; the refusal names what is waiting', async () => {
  const { runner } = setup({ maxQueue: 2 });
  await runner.startTask(U, { goal: 'running one', source: 'chat' });
  await runner.startTask(U, { goal: 'first wait', source: 'chat' });
  await runner.startTask(U, { goal: 'second wait', source: 'chat' });
  await assert.rejects(runner.startTask(U, { goal: 'too many', source: 'chat' }), (err) => {
    assert.equal(err.code, 'queue_full');
    assert.match(err.message, /"first wait", "second wait"/);
    return true;
  });
});

test('two starts at the same moment never run two tasks', async () => {
  const { runner, loop, store } = setup();
  await Promise.all([runner.startTask(U, { goal: 'A', source: 'chat' }), runner.startTask(U, { goal: 'B', source: 'chat' })]);
  assert.equal(loop.runs.length, 1);
  assert.equal(store.tasks.filter((t) => t.status === 'running').length, 1);
});

test('steps are saved and fanned out; a crash in the loop fails the task and the queue moves on', async () => {
  let calls = 0;
  const store = memoryStore();
  const events = [];
  const runner = createRunner({
    store,
    hub: { emit: (u, e) => events.push(e) },
    log: { warn() {}, error() {} },
    openPage: async () => ({ close: async () => {} }),
    run: async (opts) => {
      calls++;
      if (calls === 1) {
        opts.onEvent({ type: 'step', step: { n: 1, action: 'click', label: 'click "View"', risk: 'safe', status: 'done' } });
        throw new Error('boom');
      }
      return { status: 'done', success: true, summary: 'B ok', steps: [], collected: [], page: opts.page };
    }
  });
  const a = await runner.startTask(U, { goal: 'A', source: 'chat' });
  await runner.startTask(U, { goal: 'B', source: 'chat' });
  await tick();
  assert.equal(store.tasks[0].status, 'failed');
  assert.match(store.tasks[0].summary, /boom/);
  assert.equal(store.steps.length, 1);
  assert.equal(store.tasks[1].status, 'done');
  assert.ok(events.some((e) => e.type === 'step' && e.taskId === a.task.id));
  assert.ok(FINAL_STATUSES.includes(store.tasks[1].status));
});

test('recover stops tasks a restart left open', async () => {
  const { runner, store } = setup();
  await runner.startTask(U, { goal: 'A', source: 'chat' });
  await runner.startTask(U, { goal: 'B', source: 'chat' });
  assert.equal(await runner.recover(), 2);
  assert.ok(store.tasks.every((t) => t.status === 'stopped'));
});
