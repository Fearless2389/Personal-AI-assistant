// The browser agent as Nexus tools (PLAN.md T2.5, chunk 2G): chat, voice and ⌘K can start a web
// task, check on it, stop it, and answer its question. Declarations are offered to the model only
// when BROWSER_AGENT_ENABLED=1, and this file imports nothing heavy: the runner (and Playwright)
// load on the first call, so gemini.js can list these without an import cycle.
import { OWNER_NAME } from '../owner.js';
import { checkNavigation, testOrigins } from './urlPolicy.js';

export const browserAgentEnabled = () => process.env.BROWSER_AGENT_ENABLED === '1';
const runner = async () => (await import('./agent.js')).getRunner();

const KIND = { type: 'STRING', enum: ['errand', 'research'] };

export const BROWSE_DECLARATIONS = [
  {
    name: 'browse_web',
    description:
      `Do a task on the web in Nexus's own browser window: find, compare, add to cart, fill a form, pick a slot ` +
      `(errand), or visit several pages and collect facts into a table (research). It asks ${OWNER_NAME} before ` +
      'anything that buys, submits, sends or books, and never types passwords or payment details. Runs in the ' +
      'background; one task at a time, others wait in a queue.',
    parameters: {
      type: 'OBJECT',
      properties: {
        goal: {
          type: 'STRING',
          description:
            'The complete task, with every detail the site will need (product, size, budget, dates, names). ' +
            'The browser agent cannot see this conversation.'
        },
        kind: KIND,
        start_url: { type: 'STRING', description: 'Optional: the site to start on (https://…).' }
      },
      required: ['goal']
    }
  },
  {
    name: 'browser_status',
    description: `How the browser task is going: what is running, waiting for ${OWNER_NAME}, queued, or just finished.`,
    parameters: { type: 'OBJECT', properties: {} }
  },
  {
    name: 'stop_browser_task',
    description: 'Stop the running browser task (all=true also clears the queue).',
    parameters: { type: 'OBJECT', properties: { all: { type: 'BOOLEAN' } } }
  },
  {
    name: 'answer_browser_task',
    description: `Answer the question the browser task asked ${OWNER_NAME} (e.g. which size, "I've signed in"), so it continues.`,
    parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] }
  }
];

/** The chat prompt rule (memory.js) — empty when the agent is off. */
export const browseRule = () =>
  browserAgentEnabled()
    ? `- Doing something ON a website (find, compare, add to cart, fill a form, book, collect info from several pages) → browse_web with a complete goal: include every detail the site will need, because the browser agent cannot see this chat. Opening a site for ${OWNER_NAME} to look at is open_website. "How's it going" → browser_status; "stop" → stop_browser_task; when the task asked a question, ${OWNER_NAME}'s reply → answer_browser_task.\n`
    : '';

/** The spoken rule (voice.js) — empty when the agent is off. */
export const browseSpokenRule = () =>
  browserAgentEnabled()
    ? `- After browse_web, say in one sentence that you started (or queued) it and that you'll ask before anything risky. Never read out URLs.\n`
    : '';

const describeTask = (t) => {
  if (!t) return null;
  return {
    id: t.id,
    goal: t.goal,
    status: t.status,
    steps: t.steps_used,
    ...(t.question && { question: t.question }),
    ...(t.summary && { summary: t.summary })
  };
};

async function browseWeb(userId, args, { source = 'chat' } = {}) {
  const goal = String(args.goal ?? '').trim();
  if (!goal) return { ok: false, error: 'What should I do on the web?' };
  let startUrl = null;
  if (args.start_url) {
    const raw = String(args.start_url).trim();
    const checked = checkNavigation(raw.includes('://') ? raw : `https://${raw}`, testOrigins());
    if (!checked.ok) return { ok: false, error: checked.reason };
    startUrl = checked.url.href;
  }
  try {
    const { task, position } = await (await runner()).startTask(userId, {
      goal: goal.slice(0, 1000),
      kind: args.kind === 'research' ? 'research' : 'errand',
      startUrl,
      source: ['voice', 'chat', 'page'].includes(source) ? source : 'chat'
    });
    return {
      ok: true,
      task_id: task.id,
      goal: task.goal,
      position,
      message: position
        ? `Queued behind ${position} other task${position > 1 ? 's' : ''}: ${task.goal}`
        : `Started in the agent browser: ${task.goal}. I'll ask before anything risky.`
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function browserStatus(userId) {
  try {
    const r = await runner();
    const { active, queue } = await r.status(userId);
    const { listTasks } = await import('./taskStore.js');
    const last = active ? null : ((await listTasks(userId, 1))[0] ?? null);
    return {
      ok: true,
      active: describeTask(active),
      queued: queue.map((t) => t.goal),
      last_finished: describeTask(last),
      message: active
        ? `${active.status === 'running' ? 'Working on' : 'Waiting on you for'}: ${active.goal}`
        : last
          ? `Nothing running. Last: ${last.goal} (${last.status})`
          : 'No browser tasks yet.'
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function stopBrowserTask(userId, args) {
  try {
    const r = await runner();
    if (args.all) {
      const { stopped } = await r.stopAll(userId, `Stopped by ${OWNER_NAME}.`);
      return { ok: true, stopped, message: stopped ? `Stopped ${stopped} browser task${stopped > 1 ? 's' : ''}.` : 'Nothing was running.' };
    }
    const { active } = await r.status(userId);
    if (!active) return { ok: true, stopped: 0, message: 'No browser task is running.' };
    await r.stopTask(userId, active.id, `Stopped by ${OWNER_NAME}.`);
    return { ok: true, stopped: 1, message: `Stopped: ${active.goal}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function answerBrowserTask(userId, args) {
  const text = String(args.text ?? '').trim();
  if (!text) return { ok: false, error: 'What should I tell the browser task?' };
  try {
    const r = await runner();
    const { active } = await r.status(userId);
    if (!active || active.status !== 'waiting_user') return { ok: false, error: "The browser task isn't waiting for an answer." };
    await r.answerTask(userId, active.id, text.slice(0, 1000));
    return { ok: true, message: `Passed on your answer: ${active.goal}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export const NEXUS_BROWSE_HANDLERS = Object.freeze({
  browse_web: browseWeb,
  browser_status: browserStatus,
  stop_browser_task: stopBrowserTask,
  answer_browser_task: answerBrowserTask
});
