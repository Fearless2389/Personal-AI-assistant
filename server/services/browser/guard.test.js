// Navigation guard: the verdict table, then real clicks on red-team page 6 (links, a new tab, a
// redirect and a form post to private / payment addresses). Offline: blocked loads never leave.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { start } from '../../test/fixtureServer.js';
import { takeSnapshot } from './snapshot.js';
import { runAction } from './actions.js';
import { documentVerdict, installNavigationGuard } from './guard.js';

test('documentVerdict', () => {
  const allow = { allowOrigins: ['http://127.0.0.1:3999'] };
  const cases = [
    ['https://www.amazon.in/', {}, true],
    ['http://127.0.0.1:3999/cart.html', allow, true],
    ['http://127.0.0.1:3001/api/health', allow, false], // allowed origin is exact (port matters)
    ['http://localhost:3001/', {}, false],
    ['http://192.168.1.1/admin', {}, false],
    ['http://10.0.0.1/', { mainFrame: false }, false], // private never, not even in an iframe
    ['https://razorpay.com/payment-link/x', {}, false],
    ['https://api.razorpay.com/checkout/embedded', { mainFrame: false }, true], // a shop's payment widget
    ['https://netbanking.hdfcbank.com/', {}, false],
    ['about:blank', {}, true],
    ['data:text/html,<h1>x</h1>', {}, false],
    ['file:///C:/Windows/win.ini', {}, false]
  ];
  const wrong = cases
    .filter(([url, opts, ok]) => documentVerdict(url, opts).ok !== ok)
    .map(([url]) => url);
  assert.deepEqual(wrong, []);
});

let fx;
let browser;
let context;
const blocks = [];

before(async () => {
  fx = await start(0);
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await installNavigationGuard(context, { allowOrigins: new Set([fx.url]), onBlock: (b) => blocks.push(b) });
});
after(async () => {
  await browser?.close();
  await fx?.close();
});

async function clickOn(page, name) {
  const snap = await takeSnapshot(page);
  const el = snap.elements.find((e) => e.name.startsWith(name));
  assert.ok(el, `${name} not in snapshot`);
  return runAction(page, { type: 'click', ref: el.ref }, { allowOrigins: [fx.url] });
}

for (const [name, why] of [
  ['Router order tracking', /Private network/],
  ['Nexus order details', /Local addresses|standard web ports/],
  ['Pay the delivery fee', /Payment and banking/],
  ['Order history', /standard web ports|Private network/], // redirect to 127.0.0.1:3001
  ['Search order', /Private network/] // form post; risk.js calls this "safe" (a search button)
]) {
  test(`click "${name}" is blocked and the agent stays on the page`, async () => {
    const page = await context.newPage();
    await page.goto(`${fx.url}/inject-6.html`);
    const r = await clickOn(page, name);
    assert.equal(r.ok, false);
    assert.match(r.error, /^blocked: /);
    assert.match(r.error, why);
    assert.match(r.page.url(), /inject-6\.html$/);
    await r.page.close();
  });
}

test('a new tab to a private address is closed; the task stays on its tab', async () => {
  const page = await context.newPage();
  await page.goto(`${fx.url}/inject-6.html`);
  const before = context.pages().length;
  const r = await clickOn(page, 'Delivery partner');
  assert.equal(r.ok, false);
  assert.match(r.error, /blocked: Private network/);
  assert.equal(r.page, page);
  assert.equal(page.isClosed(), false);
  assert.equal(context.pages().length, before);
  await page.close();
});

test('the allowed fixture origin still loads, and blocks were reported', async () => {
  const page = await context.newPage();
  await page.goto(`${fx.url}/index.html`);
  const r = await clickOn(page, 'Cart');
  assert.equal(r.ok, true, r.error);
  assert.match(r.newUrl, /cart\.html$/);
  assert.ok(blocks.length >= 6);
  await page.close();
});
