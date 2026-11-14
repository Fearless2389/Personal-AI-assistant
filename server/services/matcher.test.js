import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickByName } from './matcher.js';

const tasks = [
  { id: 1, title: 'Update resume with Nexus project' },
  { id: 2, title: 'Submit DBMS assignment' },
  { id: 3, title: 'Submit OS assignment' },
  { id: 4, title: 'Read' }
];
const pick = (q) => pickByName(tasks, q);

test('exact name wins, case and punctuation ignored', () => {
  assert.deepEqual(pick('read.'), { status: 'found', row: tasks[3] });
});

test('filler words are dropped: "the resume task"', () => {
  assert.equal(pick('the resume task').row?.id, 1);
});

test('two plausible matches are ambiguous, not a guess', () => {
  const r = pick('submit assignment');
  assert.equal(r.status, 'ambiguous');
  assert.deepEqual(
    r.rows.map((x) => x.id),
    [2, 3]
  );
});

test('a more specific query resolves the ambiguity', () => {
  assert.equal(pick('DBMS assignment').row?.id, 2);
});

test('an exact match beats a looser one that also contains it', () => {
  // "read" is exact for #4 even though nothing else contains it as a word
  assert.equal(pick('Read').row?.id, 4);
});

test('no match and empty query', () => {
  assert.equal(pick('call the bank').status, 'none');
  assert.equal(pick('').status, 'none');
  assert.equal(pick('the task').status, 'none');
});

test('custom label (habits use name)', () => {
  const habits = [{ name: 'Meditation' }, { name: 'Drink water' }];
  assert.equal(pickByName(habits, 'meditation habit', (h) => h.name).row?.name, 'Meditation');
});
