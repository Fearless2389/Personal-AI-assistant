// The browser agent's loop (PLAN.md T1.7, D8–D10, S5): look at the page → ask the model for ONE
// action → classify it (risk.js) → run it, park it for a yes, or refuse it → record → repeat,
// until the model calls done / ask_user or a budget runs out.
//
// No database here (Week 2 adds it): callers get events through onEvent and decide confirm steps
// through decide(). The CLI asks on stdin; evals use a policy; the server will park the step in
// action_log and wait for Ruthvik's yes through the gate.
import { createHash } from 'node:crypto';
import { firstTurnWithFallback, streamTurn, CHAT_MODELS, isModelUnavailable } from '../gemini.js';
import { webSearch } from '../webSearch.js';
import { asUntrusted } from '../emailFormat.js';
import { OWNER_NAME } from '../owner.js';
import { takeSnapshot, renderSnapshot } from './snapshot.js';
import { runAction, checkNavigation } from './actions.js';
import { classifyStep } from './risk.js';
import { buildAgentSystem, buildStepTurn, findInjection } from './prompt.js';
import { stepDeclarationsFor, toAction } from './declarations.js';

export const BUDGET = { steps: 30, ms: 10 * 60_000, failures: 3 };
export const HISTORY_WINDOW = 6; // D9: raw step exchanges kept; older ones become PROGRESS lines
const STUCK_REPEATS = 4;
const RETRY_WAIT_MS = 10_000;

const intervalMs = () => Number(process.env.BROWSER_STEP_INTERVAL_MS ?? 5000);
const agentModels = () =>
  process.env.BROWSER_AGENT_MODEL
    ? [...new Set([process.env.BROWSER_AGENT_MODEL, ...CHAT_MODELS])]
    : CHAT_MODELS;
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const hash = (s) => createHash('sha1').update(s).digest('hex');
const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return 'a page';
  }
};
const quote = (s) => `"${String(s ?? '').slice(0, 50)}"`;

/**
 * One model turn for the loop: the first on the healthiest model (fallback), later ones on the
 * same model (thought signatures are per model). Injectable so tests can script the model.
 * → { turn: { calls, content }, model, name }
 */
export async function geminiTurn({ system, contents, declarations, model }) {
  if (model) return { turn: await streamTurn(model, contents), model, name: null };
  const first = await firstTurnWithFallback(system, contents, () => {}, { declarations, models: agentModels() });
  return { turn: first.turn, model: first.model, name: first.name };
}

/** One line for the step log and the PROGRESS block. */
export function describeStep(action, element) {
  const target = element
    ? `${quote(element.name || `#${action.ref}`)}${element.near ? ` (${String(element.near).slice(0, 40)})` : ''}`
    : '';
  switch (action.type) {
    case 'click':
      return `click ${target}`;
    case 'type':
      return `type ${quote(action.text)} into ${target}${action.submit ? ' + Enter' : ''}`;
    case 'select':
      return `select ${quote(action.option)} in ${target}`;
    case 'press':
      return `press ${action.key}`;
    case 'scroll':
      return `scroll ${action.direction}`;
    case 'navigate':
      return `go to ${action.url}`;
    case 'search_web':
      return `search the web for ${quote(action.query)}`;
    case 'extract':
      return `record ${action.rows?.length ?? 0} row(s)`;
    case 'wait':
      return `wait ${action.seconds}s`;
    default:
      return action.type;
  }
}

// Gemini contents for this step (D9). Only the newest page is sent in full; earlier pages are one
// line each, and steps older than the window are summarised in PROGRESS.
function buildContents(entries, pageText, lastResult, warning = null) {
  const windowStart = Math.max(0, entries.length - HISTORY_WINDOW);
  const progress = entries.slice(0, windowStart).map((e) => `${describeStep(e.action, e.element)} → ${e.outcome}`);
  const recent = entries.slice(windowStart);
  if (!recent.length) return [{ role: 'user', parts: [{ text: buildStepTurn(pageText, progress, lastResult, warning) }] }];

  const contents = [{ role: 'user', parts: [{ text: `(earlier page: ${recent[0].pageLine})` }] }];
  recent.forEach((e, i) => {
    contents.push(e.modelContent);
    const isLast = i === recent.length - 1;
    contents.push({
      role: 'user',
      parts: [
        ...e.responses,
        { text: isLast ? buildStepTurn(pageText, progress, lastResult, warning) : `(earlier page: ${recent[i + 1].pageLine})` }
      ]
    });
  });
  return contents;
}

/**
 * @param opts.goal         what Ruthvik asked for (approved; S4 checks typed data against it)
 * @param opts.kind         'errand' | 'research'
 * @param opts.page         a Playwright page (driver.newPage() for the agent window)
 * @param opts.startUrl     optional first address
 * @param opts.allowOrigins origins allowed despite the SSRF guard (fixture site only)
 * @param opts.decide       async (step, classification) → 'execute' | 'decline'  (confirm steps)
 * @param opts.onEvent      (event) → void   { type: 'step' | 'thinking' | 'finished', … }
 * @param opts.signal       AbortSignal: the kill switch (S5)
 * @param opts.search       web search for research (default: services/webSearch.js)
 * @param opts.resume       the `state` a `waiting_user` result returned: continue that task …
 * @param opts.answer       … with Ruthvik's answer to its question
 * @param opts.modelTurn    the model call (default geminiTurn; tests pass a scripted one)
 * @returns { status: 'done'|'failed'|'stopped'|'waiting_user', success, summary, question, steps, collected, page,
 *            modelName, state (only when waiting_user: pass it back as `resume`) }
 */
export async function runTask({
  goal,
  kind = 'errand',
  page,
  startUrl = null,
  allowOrigins = [],
  decide = async () => 'decline',
  onEvent = () => {},
  signal = null,
  search = webSearch,
  resume = null,
  answer = null,
  modelTurn = geminiTurn
}) {
  // Waiting for an answer doesn't count against the 10-minute budget.
  const started = Date.now() - (resume?.elapsedMs ?? 0);
  const steps = resume?.steps ?? [];
  const entries = resume?.entries ?? [];
  const collected = resume?.collected ?? [];
  const recentHashes = [];
  const warnings = resume?.warnings ?? []; // [{ url, text }] planted instructions seen on pages
  let failures = resume?.failures ?? 0;
  let lastResult = null;
  let lastElement = resume?.lastElement ?? null;
  let model = resume?.model ?? null;
  let modelName = resume?.modelName ?? null;
  let lastCallAt = 0;

  const finish = (status, extra = {}) => {
    const result = { status, success: status === 'done', summary: '', question: null, ...extra, steps, collected, page, modelName, warnings };
    // Ruthvik always hears about planted instructions, whatever the model wrote.
    if (warnings.length && result.summary && !/instruct|injection|suspicious|ignored/i.test(result.summary)) {
      const w = warnings[0];
      result.summary += ` Heads-up: ${hostOf(w.url)} had text trying to instruct the assistant ("${w.text.slice(0, 80)}"); I ignored it.`;
    }
    onEvent({ type: 'finished', status: result.status, summary: result.summary, question: result.question });
    return result;
  };
  // Everything needed to continue after Ruthvik answers (runner.js keeps it in memory).
  const pause = (question, n, pending = null) =>
    finish('waiting_user', {
      question,
      state: { entries, steps, collected, warnings, failures, lastElement, model, modelName, n, elapsedMs: Date.now() - started, ...pending }
    });
  const record = (step) => {
    steps.push(step);
    onEvent({ type: 'step', step });
  };

  if (resume) {
    // The question's call gets the answer as its result, so the model continues where it stopped.
    const reply = { ok: true, answer: String(answer ?? '').slice(0, 1000) };
    if (resume.pendingCall) {
      entries.push({
        action: { type: 'ask_user', question: resume.pendingCall.args?.question },
        element: null,
        outcome: `answered: ${reply.answer.slice(0, 80)}`,
        modelContent: resume.pendingContent,
        responses: [{ functionResponse: { name: 'ask_user', response: reply } }],
        pageLine: resume.pageLine
      });
    }
    lastResult = reply;
  } else if (startUrl) {
    const checked = checkNavigation(startUrl, allowOrigins);
    if (!checked.ok) return finish('failed', { summary: `Can't start there: ${checked.reason}` });
    try {
      await page.goto(checked.url.href, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      return finish('failed', { summary: `Couldn't open ${startUrl}: ${String(err.message).split('\n')[0]}` });
    }
  }

  const system = buildAgentSystem(goal, kind);
  const declarations = stepDeclarationsFor(kind);

  for (let n = resume ? resume.n + 1 : 1; ; n++) {
    if (signal?.aborted) return finish('stopped', { summary: 'Stopped.' });
    if (n > BUDGET.steps) return finish('failed', { summary: `Stopped after ${BUDGET.steps} steps without finishing.` });
    if (Date.now() - started > BUDGET.ms) return finish('failed', { summary: 'Stopped: the 10-minute limit ran out.' });
    if (failures >= BUDGET.failures) {
      return finish('failed', { summary: `Stopped after ${BUDGET.failures} failed or declined steps in a row. Last: ${lastResult?.error ?? ''}` });
    }

    // 1. Look at the page.
    let snap;
    try {
      snap = await takeSnapshot(page);
    } catch (err) {
      return finish('failed', { summary: `Couldn't read the page: ${String(err.message).split('\n')[0]}` });
    }
    const pageText = renderSnapshot(snap);
    const planted = findInjection(snap.text);
    if (planted && !warnings.some((w) => w.url === snap.url)) {
      warnings.push({ url: snap.url, text: planted });
      onEvent({ type: 'warning', url: snap.url, text: planted });
    }
    recentHashes.push(hash(pageText));
    if (recentHashes.length > STUCK_REPEATS) recentHashes.shift();
    if (recentHashes.length === STUCK_REPEATS && new Set(recentHashes).size === 1) {
      return pause(`I seem stuck on "${snap.title}". What should I do?`, n - 1);
    }

    // 2. Ask the model for one action (D8), paced for the free tier (D10).
    await sleep(lastCallAt + intervalMs() - Date.now());
    if (signal?.aborted) return finish('stopped', { summary: 'Stopped.' });
    onEvent({ type: 'thinking', n });
    const contents = buildContents(entries, pageText, lastResult, planted);
    let turn;
    for (let attempt = 1; ; attempt++) {
      lastCallAt = Date.now();
      try {
        const r = await modelTurn({ system, contents, declarations, model });
        turn = r.turn;
        if (!model) modelName = r.name;
        model = r.model;
        break;
      } catch (err) {
        if (attempt < 2 && isModelUnavailable(err) && !signal?.aborted) {
          await sleep(RETRY_WAIT_MS);
          continue;
        }
        return finish('failed', { summary: `The model didn't answer: ${String(err.message).slice(0, 160)}` });
      }
    }

    const call = turn.calls[0];
    const action = toAction(call, kind);
    const ignored = turn.calls.slice(1).map((c) => ({
      functionResponse: { name: c.name, response: { ok: false, error: 'Ignored: one action per turn.' } }
    }));
    const respond = (response) => [
      ...(call ? [{ functionResponse: { name: call.name, response } }] : []),
      ...ignored
    ];

    if (!action) {
      failures++;
      lastResult = { ok: false, error: call ? `"${call.name}" is not available here.` : 'Reply with one function call.' };
      entries.push({ action: { type: call?.name ?? 'nothing' }, element: null, outcome: 'invalid', modelContent: turn.content, responses: respond(lastResult), pageLine: `${snap.title} ${snap.url}` });
      continue;
    }

    // 3. Finish / ask.
    if (action.type === 'done') {
      return finish('done', { success: action.success !== false, summary: String(action.summary ?? '') });
    }
    if (action.type === 'ask_user') {
      if (ignored.length) {
        // extra calls in the same turn: answer them as ignored next to the reply (one response per call)
        turn.content = { ...turn.content, parts: turn.content.parts.filter((p) => !p.functionCall || p.functionCall === call) };
      }
      return pause(String(action.question ?? 'What should I do next?'), n, {
        pendingCall: call,
        pendingContent: turn.content,
        pageLine: `${snap.title} ${snap.url}`
      });
    }

    // 4. Classify, then run / park / refuse.
    const element = action.ref !== undefined ? snap.elements.find((e) => e.ref === Number(action.ref)) ?? null : null;
    const step = {
      n,
      action: action.type,
      args: action,
      target: element?.name ?? null,
      url: snap.url,
      label: describeStep(action, element),
      why: action.why ?? null
    };

    let result;
    if (['click', 'type', 'select'].includes(action.type) && !element) {
      result = { ok: false, error: `ref ${action.ref} is not on the page. Use a number from the latest page.` };
      record({ ...step, risk: 'safe', status: 'failed', note: result.error });
    } else if (action.type === 'search_web') {
      try {
        const r = await search(String(action.query ?? ''), { max: 6 });
        result = {
          ok: true,
          results: r.results.map((x) => ({ title: asUntrusted(x.title, 200), url: x.url, snippet: asUntrusted(x.snippet, 300) }))
        };
        record({ ...step, risk: 'safe', status: 'done', note: `${result.results.length} results` });
      } catch (err) {
        result = { ok: false, error: `Search failed: ${err.message}` };
        record({ ...step, risk: 'safe', status: 'failed', note: result.error });
      }
    } else if (action.type === 'extract') {
      const columns = (action.columns ?? []).map(String);
      const rows = (action.rows ?? []).map((r) => (r.cells ?? []).map(String));
      collected.push({ title: String(action.title ?? ''), columns, rows, url: snap.url });
      const total = collected.reduce((sum, c) => sum + c.rows.length, 0);
      result = { ok: true, rows_so_far: total };
      record({ ...step, risk: 'safe', status: 'done', note: `${rows.length} row(s), ${total} so far` });
    } else {
      const c = classifyStep(action, { element, focused: lastElement, pageUrl: snap.url, goal, allowOrigins });
      if (c.risk === 'never') {
        result = { ok: false, error: `blocked: ${c.reason}` };
        record({ ...step, risk: 'never', status: 'blocked', note: c.reason });
      } else {
        let go = c.risk === 'safe';
        if (!go) {
          onEvent({ type: 'needs_confirmation', step: { ...step, risk: 'confirm' }, reason: c.reason });
          go = (await decide({ ...step, risk: 'confirm' }, c)) === 'execute';
          if (signal?.aborted) return finish('stopped', { summary: 'Stopped.' });
        }
        if (!go) {
          result = { ok: false, error: `${OWNER_NAME} declined this step (${c.reason}). Don't try another way to do it.` };
          record({ ...step, risk: c.risk, status: 'declined', note: c.reason });
        } else {
          const r = await runAction(page, action, { allowOrigins });
          page = r.page;
          result = r.ok ? { ok: true, url: r.newUrl } : { ok: false, error: r.error };
          record({ ...step, risk: c.risk, status: r.ok ? 'done' : 'failed', note: r.error ?? null, url: r.newUrl ?? snap.url });
          if (r.ok && (action.type === 'type' || action.type === 'click')) lastElement = element;
        }
      }
    }

    failures = result.ok ? 0 : failures + 1;
    lastResult = result;
    entries.push({
      action,
      element,
      outcome: result.ok ? 'ok' : result.error,
      modelContent: turn.content,
      responses: respond(result),
      pageLine: `${snap.title} ${snap.url}`
    });
  }
}
