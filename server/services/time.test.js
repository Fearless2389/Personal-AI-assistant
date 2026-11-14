import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallTimeToUtcIso, modelTimeToUtcIso } from './time.js';

const IST = 'Asia/Kolkata';

test("offset-less model time is the user's wall time", () => {
  assert.equal(modelTimeToUtcIso('2026-11-15T17:00:00', IST), '2026-11-15T11:30:00.000Z');
});

test('a model "Z" is a habit, not UTC: 5 PM stays 5 PM (seen live: became 10:30 PM)', () => {
  assert.equal(modelTimeToUtcIso('2026-11-15T17:00:00Z', IST), '2026-11-15T11:30:00.000Z');
  assert.equal(modelTimeToUtcIso('2026-11-15T17:00:00.000Z', IST), '2026-11-15T11:30:00.000Z');
});

test('an explicit offset is kept as written', () => {
  assert.equal(modelTimeToUtcIso('2026-11-15T17:00:00+05:30', IST), '2026-11-15T17:00:00+05:30');
});

test('date-only and junk pass through', () => {
  assert.equal(modelTimeToUtcIso('2026-11-15', IST), '2026-11-15');
  assert.equal(modelTimeToUtcIso('soon', IST), 'soon');
  assert.equal(modelTimeToUtcIso(null, IST), null);
});

test('wallTimeToUtcIso alone still leaves real UTC untouched (stored values)', () => {
  assert.equal(wallTimeToUtcIso('2026-11-15T11:30:00.000Z', IST), '2026-11-15T11:30:00.000Z');
});
