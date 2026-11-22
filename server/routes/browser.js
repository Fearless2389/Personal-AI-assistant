import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getRunner, httpError } from '../services/browser/agent.js';
import * as taskStore from '../services/browser/taskStore.js';
import * as taskHub from '../services/browser/taskHub.js';
import { openForLogin } from '../services/browser/driver.js';
import { checkNavigation, testOrigins } from '../services/browser/urlPolicy.js';
import { KINDS } from '../services/browser/prompt.js';
import { OWNER_NAME } from '../services/owner.js';
import { shotFile } from '../services/browser/shots.js';

// The browser agent's API (PLAN.md T2.3, chunk 2F). Mounted only when BROWSER_AGENT_ENABLED=1.
// Thin: validation here, everything else in services/browser/runner.js.
const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_GOAL = 1000;

const fail = (res, next) => (err) => {
  const mapped = httpError(err);
  if (mapped) return res.status(mapped.status).json({ error: mapped.error });
  next(err);
};
const validId = (req, res) => {
  if (UUID.test(req.params.id)) return true;
  res.status(400).json({ error: 'Invalid task id' });
  return false;
};

/** POST /api/browser/tasks { goal, kind?, startUrl? } → { task, position } (position 0 = started now). */
router.post('/tasks', requireAuth, async (req, res, next) => {
  const { goal, kind = 'errand', startUrl = null } = req.body ?? {};
  if (typeof goal !== 'string' || !goal.trim()) return res.status(400).json({ error: 'goal is required' });
  if (goal.length > MAX_GOAL) return res.status(400).json({ error: `goal is longer than ${MAX_GOAL} characters` });
  if (!KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${KINDS.join(', ')}` });
  if (startUrl !== null) {
    const checked = checkNavigation(startUrl, testOrigins());
    if (!checked.ok) return res.status(400).json({ error: checked.reason });
  }
  getRunner()
    .startTask(req.user.id, { goal: goal.trim(), kind, startUrl, source: 'page' })
    .then((r) => res.status(201).json(r), fail(res, next));
});

/** GET /api/browser/tasks?limit=20 → { tasks } newest first. */
router.get('/tasks', requireAuth, (req, res, next) => {
  taskStore.listTasks(req.user.id, req.query.limit).then((tasks) => res.json({ tasks }), fail(res, next));
});

/** GET /api/browser/status → { active, queue }. */
router.get('/status', requireAuth, (req, res, next) => {
  getRunner().status(req.user.id).then((s) => res.json(s), fail(res, next));
});

/** GET /api/browser/tasks/:id → { task } with its steps. */
router.get('/tasks/:id', requireAuth, (req, res, next) => {
  if (!validId(req, res)) return;
  taskStore.getTask(req.user.id, req.params.id, { withSteps: true }).then((task) => {
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ task });
  }, fail(res, next));
});

/**
 * GET /api/browser/tasks/:id/shots/:name → image/jpeg (name = a step number or "final"). Only the
 * task's owner gets it; anything else, or a screenshot that doesn't exist, is a 404.
 */
router.get('/tasks/:id/shots/:name', requireAuth, async (req, res, next) => {
  if (!validId(req, res)) return;
  const file = shotFile(req.params.id, req.params.name);
  if (!file) return res.status(404).json({ error: 'Screenshot not found' });
  try {
    const task = await taskStore.getTask(req.user.id, req.params.id);
    if (!task) return res.status(404).json({ error: 'Screenshot not found' });
    res.set('cache-control', 'private, max-age=3600');
    // dotfiles: the folder is server/.agent-shots; `file` is already pinned to a uuid + name (shotFile)
    res.sendFile(file, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Screenshot not found' });
    });
  } catch (err) {
    fail(res, next)(err);
  }
});

/** POST /api/browser/tasks/:id/stop → { task }. */
router.post('/tasks/:id/stop', requireAuth, (req, res, next) => {
  if (!validId(req, res)) return;
  getRunner()
    .stopTask(req.user.id, req.params.id, `Stopped by ${OWNER_NAME}.`)
    .then((task) => (task ? res.json({ task }) : res.status(404).json({ error: 'Task not found' })), fail(res, next));
});

/** POST /api/browser/stop-all → { stopped } — the kill switch (Esc / Stop). */
router.post('/stop-all', requireAuth, (req, res, next) => {
  getRunner().stopAll(req.user.id, `Stopped by ${OWNER_NAME}.`).then((r) => res.json(r), fail(res, next));
});

/** POST /api/browser/tasks/:id/answer { text } → { task } — resumes a task that asked a question. */
router.post('/tasks/:id/answer', requireAuth, (req, res, next) => {
  if (!validId(req, res)) return;
  const text = req.body?.text;
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text is required' });
  getRunner()
    .answerTask(req.user.id, req.params.id, text.trim().slice(0, 1000))
    .then((task) => res.json({ task }), fail(res, next));
});

/** POST /api/browser/open { url } — "Open agent browser": a tab where Ruthvik signs in by hand (S2). */
router.post('/open', requireAuth, async (req, res, next) => {
  const checked = checkNavigation(req.body?.url ?? '');
  if (!checked.ok) return res.status(400).json({ error: checked.reason });
  try {
    await openForLogin(checked.url.href);
    res.json({ ok: true, url: checked.url.href });
  } catch (err) {
    next(err);
  }
});

/** GET /api/browser/events — SSE stream of this user's task events (Authorization header, like hotkey). */
router.get('/events', requireAuth, (req, res) => {
  taskHub.subscribe(req.user.id, res);
});

export default router;
