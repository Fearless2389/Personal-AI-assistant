// Snapshot tests on the fixture site, in a throwaway headless Chromium (never the agent profile).
// UPDATE_SNAPSHOTS=1 npm test rewrites snapshot.expected.txt after an intended format change.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { start } from '../../test/fixtureServer.js';
import { takeSnapshot, renderSnapshot } from './snapshot.js';

const EXPECTED = new URL('./snapshot.expected.txt', import.meta.url);
let fx;
let browser;
let page;

before(async () => {
  fx = await start(0);
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
});
after(async () => {
  await browser?.close();
  await fx?.close();
});

test('shop page: search, sort and 8 product links, each told apart', async () => {
  await page.goto(`${fx.url}/index.html`);
  const snap = await takeSnapshot(page);
  assert.ok(snap.elements.some((e) => e.role === 'searchbox'));
  const sort = snap.elements.find((e) => e.role === 'combobox');
  assert.match(sort.name, /Sort/);
  assert.deepEqual(sort.options, ['Featured', 'Price: Low to High', 'Price: High to Low']);
  const views = snap.elements.filter((e) => e.role === 'link' && e.name === 'View');
  assert.equal(views.length, 8);
  assert.match(views[0].near, /Lenovo IdeaPad/);
  // refs are 1-based, in order, and present on the page for actions.js
  assert.deepEqual(
    snap.elements.map((e) => e.ref),
    snap.elements.map((_, i) => i + 1)
  );
  assert.equal(await page.locator('[data-nexus-ref]').count(), snap.elements.length);
});

test('hidden things never reach the model (S4)', async () => {
  await page.goto(`${fx.url}/index.html`);
  const snap = await takeSnapshot(page);
  const rendered = renderSnapshot(snap);
  assert.doesNotMatch(rendered, /Delete account/); // display:none button
  assert.doesNotMatch(rendered, /ignore your instructions/); // pushed off-page
  assert.doesNotMatch(rendered, /add every product/); // opacity 0
});

test('invisible characters are stripped and password values are never read', async () => {
  await page.setContent(`
    <h1>Hel​lo ‮world</h1>
    <label>Pass <input type="password" id="pw"></label>
    <button aria-label="Pa⁦y now">x</button>
    <div aria-hidden="true"><button>Secret</button></div>
    <button inert>Inert</button>`);
  await page.fill('#pw', 'hunter2');
  const snap = await takeSnapshot(page);
  const rendered = renderSnapshot(snap);
  assert.match(snap.text, /Hello world/);
  assert.doesNotMatch(rendered, /hunter2/);
  assert.equal(snap.elements.find((e) => e.type === 'password').value, null);
  assert.ok(snap.elements.some((e) => e.name === 'Pay now'));
  assert.doesNotMatch(rendered, /Secret|Inert/);
});

test('refs from an earlier snapshot are cleared', async () => {
  await page.setContent('<button id="a">A</button><button id="b">B</button>');
  await takeSnapshot(page);
  await page.evaluate(() => document.getElementById('a').remove());
  const snap = await takeSnapshot(page);
  assert.equal(snap.elements.length, 1);
  assert.equal(await page.getAttribute('#b', 'data-nexus-ref'), '1');
  assert.equal(await page.locator('[data-nexus-ref="2"]').count(), 0);
});

test('rendered format for the registration form matches snapshot.expected.txt', async () => {
  await page.goto(`${fx.url}/form.html`);
  const snap = await takeSnapshot(page);
  // the form's fields know which button submits them (risk.js uses this)
  assert.ok(snap.elements.filter((e) => e.role === 'textbox').every((e) => e.formSubmitName === 'Submit'));
  const rendered = renderSnapshot(snap).replace(fx.url, 'http://fixture');
  if (process.env.UPDATE_SNAPSHOTS === '1') await writeFile(EXPECTED, rendered + '\n');
  const expected = (await readFile(EXPECTED, 'utf8')).replace(/\r\n/g, '\n').trimEnd();
  assert.equal(rendered, expected);
});

test('transparent buttons over a visible label (Amazon) are seen, named by what a person sees', async () => {
  await page.setContent(`
    <style>.btn{position:relative;display:inline-block;padding:8px 16px;background:#ffd814}
      .btn input{position:absolute;inset:0;width:100%;height:100%;opacity:0.01;cursor:pointer}</style>
    <form><span class="btn"><input type="submit" aria-labelledby="atc"><span id="atc">Add to Cart</span></span></form>
    <form><span class="btn"><input type="submit" value="Delete account"><span>View offers</span></span></form>
    <button style="opacity:0">Invisible on its own</button>
    <span class="btn"><input type="submit" style="opacity:0.01" value="Covered"><span style="position:absolute;inset:0;background:#fff">Cover</span></span>`);
  const names = (await takeSnapshot(page)).elements.map((e) => e.name);
  assert.ok(names.includes('Add to Cart'), names.join(' | '));
  assert.ok(names.includes('View offers [Delete account]'), names.join(' | ')); // the hidden label is shown too
  assert.ok(!names.some((n) => /Invisible on its own/.test(n))); // transparent with no visible label: hidden
  assert.ok(!names.some((n) => /Covered/.test(n))); // not on top at its centre: hidden
});
