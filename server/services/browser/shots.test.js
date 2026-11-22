// shots.js: ids that could escape the folder never reach the disk; the sweep removes only old
// task folders. Runs in a temp directory, never the real server/.agent-shots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { shotFile, takeShot, sweepShots, SHOT_MAX_AGE_MS } from './shots.js';

const ID = '11111111-1111-4111-8111-111111111111';
const OLD = '22222222-2222-4222-8222-222222222222';

test('shotFile accepts a task uuid + step number or "final", nothing else', () => {
  const dir = path.join(os.tmpdir(), 'shots');
  assert.equal(shotFile(ID, 3, dir), path.join(dir, ID, '3.jpg'));
  assert.equal(shotFile(ID, 'final', dir), path.join(dir, ID, 'final.jpg'));
  for (const [id, name] of [
    ['../../etc', 3],
    [ID, '../x'],
    [ID, 'final.jpg'],
    [ID, ''],
    [`${ID}/..`, 1],
    [ID, 1234]
  ]) {
    assert.equal(shotFile(id, name, dir), null, `${id} / ${name}`);
  }
});

test('takeShot writes <dir>/<task>/<name>.jpg and never throws', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-shots-'));
  try {
    const page = { screenshot: async ({ path: file }) => fs.writeFile(file, 'jpg') };
    assert.equal(await takeShot(page, ID, 4, dir), '4');
    assert.equal(await fs.readFile(path.join(dir, ID, '4.jpg'), 'utf8'), 'jpg');
    assert.equal(await takeShot({ screenshot: async () => { throw new Error('closed'); } }, ID, 5, dir), null);
    assert.equal(await takeShot(page, 'nope', 6, dir), null);
    assert.equal(await takeShot(null, ID, 7, dir), null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('sweepShots removes task folders older than 7 days and keeps newer ones', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-shots-'));
  try {
    for (const id of [ID, OLD]) {
      await fs.mkdir(path.join(dir, id));
      await fs.writeFile(path.join(dir, id, 'final.jpg'), 'x');
    }
    await fs.mkdir(path.join(dir, 'not-a-task'));
    const eightDaysAgo = new Date(Date.now() - SHOT_MAX_AGE_MS - 24 * 60 * 60_000);
    await fs.utimes(path.join(dir, OLD), eightDaysAgo, eightDaysAgo);
    assert.equal(await sweepShots({ dir }), 1);
    const left = (await fs.readdir(dir)).sort();
    assert.deepEqual(left, [ID, 'not-a-task'].sort());
    assert.equal(await sweepShots({ dir: path.join(dir, 'missing') }), 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
