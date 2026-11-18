// Action executor tests: drive the fixture shop end to end in a throwaway headless Chromium.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { start } from '../../test/fixtureServer.js';
import { takeSnapshot } from './snapshot.js';
import { runAction, checkNavigation } from './actions.js';

let fx;
let browser;
let context;

before(async () => {
  fx = await start(0);
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
});
after(async () => {
  await browser?.close();
  await fx?.close();
});

// Find an element in a fresh snapshot, the way the model would.
async function refOf(page, predicate) {
  const snap = await takeSnapshot(page);
  const el = snap.elements.find(predicate);
  assert.ok(el, 'element not in snapshot');
  return el.ref;
}

test('search, sort, open the cheapest laptop, add it to the cart', async () => {
  let page = await context.newPage();
  await page.goto(`${fx.url}/index.html`);
  const allow = { allowOrigins: [fx.url] };

  let r = await runAction(page, { type: 'type', ref: await refOf(page, (e) => e.role === 'searchbox'), text: 'laptop', submit: true }, allow);
  assert.equal(r.ok, true, r.error);
  assert.match(r.newUrl, /q=laptop/);

  r = await runAction(page, { type: 'select', ref: await refOf(page, (e) => e.role === 'combobox'), option: 'Price: Low to High' }, allow);
  assert.equal(r.ok, true, r.error);
  assert.match(r.newUrl, /sort=price-asc/);

  r = await runAction(page, { type: 'click', ref: await refOf(page, (e) => e.name === 'View') }, allow);
  assert.equal(r.ok, true, r.error);
  assert.match(await page.title(), /Acer Aspire Lite/); // ₹38,990, the cheapest laptop

  r = await runAction(page, { type: 'click', ref: await refOf(page, (e) => e.name === 'Add to cart') }, allow);
  assert.equal(r.ok, true, r.error);
  assert.equal(await page.textContent('#cart-link'), 'Cart (1)');
  page = r.page;
  await page.close();
});

test('a link that opens a new tab moves the task there and closes the old tab', async () => {
  const page = await context.newPage();
  await page.goto(`${fx.url}/index.html`);
  const r = await runAction(page, { type: 'click', ref: await refOf(page, (e) => e.name === "Today's offers") });
  assert.equal(r.ok, true, r.error);
  assert.match(r.newUrl, /offers\.html$/);
  assert.notEqual(r.page, page);
  assert.equal(page.isClosed(), true);
  await r.page.close();
});

test('bad steps fail with a short reason instead of throwing', async () => {
  const page = await context.newPage();
  await page.goto(`${fx.url}/booking.html`);
  let r = await runAction(page, { type: 'click', ref: 999 });
  assert.equal(r.ok, false);
  assert.match(r.error, /ref 999 is not on the page/);

  r = await runAction(page, { type: 'type', ref: await refOf(page, (e) => e.name === 'Date'), text: 'next friday' });
  assert.equal(r.ok, false);
  assert.match(r.error, /YYYY-MM-DD/);
  assert.doesNotMatch(r.error, /\n/);

  r = await runAction(page, { type: 'navigate', url: 'http://192.168.1.1/' });
  assert.deepEqual([r.ok, r.error], [false, 'Private network addresses are not allowed.']);

  r = await runAction(page, { type: 'press', key: 'F12' });
  assert.equal(r.ok, false);
  await page.close();
});

test('checkNavigation: public http(s) only, unless the origin is allowed for the run', () => {
  assert.equal(checkNavigation('https://www.amazon.in/s?k=charger').ok, true);
  assert.equal(checkNavigation('http://127.0.0.1:3999/').ok, false);
  assert.equal(checkNavigation('http://127.0.0.1:3999/cart.html', ['http://127.0.0.1:3999']).ok, true);
  assert.equal(checkNavigation('file:///C:/Windows').ok, false);
  assert.equal(checkNavigation('javascript:alert(1)').ok, false);
  assert.match(checkNavigation('ftp://x.com').reason, /can be opened/);
  assert.equal(checkNavigation('not a url').ok, false);
});
