// The agent loop with a SCRIPTED model (no network, no quota): each test's script reads the page
// the loop sent and answers with one function call, like Gemini would.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { start } from '../../test/fixtureServer.js';
import { runTask } from './agentLoop.js';

process.env.BROWSER_STEP_INTERVAL_MS = '0';
let fx;
let browser;

before(async () => {
  fx = await start(0);
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await fx?.close();
});

// The newest page text the loop sent, and a ref finder over it.
const lastText = (contents) =>
  contents
    .at(-1)
    .parts.filter((p) => p.text)
    .map((p) => p.text)
    .join('\n');
function refIn(contents, pattern) {
  const line = lastText(contents)
    .split('\n')
    .find((l) => /^\[\d+\]/.test(l) && pattern.test(l));
  assert.ok(line, `no element matching ${pattern}`);
  return Number(line.match(/^\[(\d+)\]/)[1]);
}

// script: array of (contents) → { name, args }. Records every request it saw.
function scripted(script) {
  const seen = [];
  let i = 0;
  const modelTurn = async ({ contents }) => {
    seen.push(contents);
    const step = script[i++];
    if (!step) throw new Error('script ran out');
    const call = step(contents);
    return { turn: { calls: [call], content: { role: 'model', parts: [{ functionCall: call }] } }, model: 'fake', name: 'fake' };
  };
  return { modelTurn, seen };
}

async function run(opts) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const result = await runTask({ allowOrigins: [fx.url], page, ...opts, startUrl: fx.url + opts.start });
  const cart = await result.page.evaluate(() => JSON.parse(localStorage.getItem('cart') || '[]')).catch(() => null);
  const orders = await result.page.evaluate(() => Number(localStorage.getItem('orders') || 0)).catch(() => null);
  await context.close();
  return { result, cart, orders };
}

test('a safe errand runs to done', async () => {
  const { modelTurn } = scripted([
    (c) => ({ name: 'click', args: { ref: refIn(c, /button "Add to cart"/) } }),
    () => ({ name: 'done', args: { success: true, summary: 'Added the mouse.' } })
  ]);
  const { result, cart } = await run({ goal: 'add the mouse', start: '/product.html?id=8', modelTurn });
  assert.equal(result.status, 'done');
  assert.deepEqual(cart, [{ id: 8, qty: 1 }]);
  assert.deepEqual(result.steps.map((s) => [s.action, s.risk, s.status]), [['click', 'safe', 'done']]);
});

test('a confirm step is asked for; declined, it never runs and the model is told', async () => {
  const asked = [];
  const { modelTurn, seen } = scripted([
    (c) => ({ name: 'click', args: { ref: refIn(c, /button "Place order"/) } }),
    () => ({ name: 'done', args: { success: false, summary: 'Waiting for approval.' } })
  ]);
  const { result, orders } = await run({
    goal: 'buy it',
    start: '/checkout.html',
    modelTurn,
    decide: async (step, c) => {
      asked.push(c.reason);
      return 'decline';
    }
  });
  assert.deepEqual(asked, ['Click "Place order"']);
  assert.equal(orders, 0);
  assert.equal(result.steps[0].status, 'declined');
  const reply = seen[1].at(-1).parts.find((p) => p.functionResponse).functionResponse.response;
  assert.match(reply.error, /declined/);
});

test('approved, the confirm step runs', async () => {
  const { modelTurn } = scripted([
    (c) => ({ name: 'click', args: { ref: refIn(c, /button "Place order"/) } }),
    () => ({ name: 'done', args: { success: true, summary: 'Ordered.' } })
  ]);
  const { orders } = await run({ goal: 'buy it', start: '/checkout.html', modelTurn, decide: async () => 'execute' });
  assert.equal(orders, 1);
});

test('typing into a card field is refused without asking', async () => {
  let asked = 0;
  const { modelTurn } = scripted([
    (c) => ({ name: 'type', args: { ref: refIn(c, /textbox "Card number"/), text: '4111111111111111' } }),
    () => ({ name: 'done', args: { success: false, summary: 'Card is yours to enter.' } })
  ]);
  const { result } = await run({ goal: 'pay', start: '/checkout.html', modelTurn, decide: async () => (asked++, 'execute') });
  assert.equal(asked, 0);
  assert.equal(result.steps[0].status, 'blocked');
});

test('ask_user pauses; resuming hands the answer to the same call', async () => {
  const script = scripted([
    () => ({ name: 'ask_user', args: { question: 'Which colour?' } }),
    () => ({ name: 'done', args: { success: true, summary: 'Black it is.' } })
  ]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const first = await runTask({ goal: 'buy headphones', page, startUrl: `${fx.url}/product.html?id=6`, allowOrigins: [fx.url], modelTurn: script.modelTurn });
  assert.equal(first.status, 'waiting_user');
  assert.equal(first.question, 'Which colour?');
  assert.ok(first.state);

  const second = await runTask({ goal: 'buy headphones', page: first.page, allowOrigins: [fx.url], modelTurn: script.modelTurn, resume: first.state, answer: 'black' });
  assert.equal(second.status, 'done');
  const turnAfter = script.seen[1];
  const lastUser = turnAfter.at(-1);
  assert.deepEqual(lastUser.parts[0].functionResponse, { name: 'ask_user', response: { ok: true, answer: 'black' } });
  assert.match(lastText(turnAfter), /ANSWER FROM RUTHVIK: black/i);
  assert.equal(turnAfter.at(-2).role, 'model'); // the ask_user call sits right before its answer
  await context.close();
});

test('three failed steps in a row stop the task', async () => {
  const bad = () => ({ name: 'click', args: { ref: 999 } });
  const { modelTurn } = scripted([bad, bad, bad, bad]);
  const { result } = await run({ goal: 'x', start: '/index.html', modelTurn });
  assert.equal(result.status, 'failed');
  assert.match(result.summary, /3 failed or declined steps/);
  assert.equal(result.steps.length, 3);
});

test('the same page four times in a row asks for help', async () => {
  const wait = () => ({ name: 'wait', args: { seconds: 1 } });
  const { modelTurn } = scripted([wait, wait, wait, wait, wait]);
  const { result } = await run({ goal: 'x', start: '/login.html', modelTurn });
  assert.equal(result.status, 'waiting_user');
  assert.match(result.question, /stuck/);
});

test('the kill switch stops before the next model call', async () => {
  const abort = new AbortController();
  const { modelTurn } = scripted([
    () => {
      abort.abort();
      return { name: 'scroll', args: { direction: 'down' } };
    },
    () => ({ name: 'done', args: { success: true, summary: 'should not get here' } })
  ]);
  const { result } = await run({ goal: 'x', start: '/index.html', modelTurn, signal: abort.signal });
  assert.equal(result.status, 'stopped');
});
