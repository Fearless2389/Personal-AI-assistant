// node --test services/  (built-in runner, no deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskOf, isAffirmative, isNegative, isFresh, describeAction, CONFIRM_TTL_MS } from './actionPolicy.js';

test('outward actions need confirmation, in-app writes do not', () => {
  assert.equal(riskOf('create_calendar_event'), 'confirm');
  assert.equal(riskOf('schedule_reminder'), 'confirm');
  assert.equal(riskOf('create_task'), 'safe');
  assert.equal(riskOf('track_application'), 'safe');
});

test('an unknown tool is gated, never silently safe', () => {
  assert.equal(riskOf('send_email'), 'confirm');
});

test('affirmatives: short, whole-utterance yes', () => {
  for (const s of [
    'Yes',
    'yes.',
    ' Yeah! ',
    'go ahead',
    'Do it.',
    'okay',
    'yes please',
    "that's right",
    'Yes, go ahead.',
    'Okay, do it.'
  ]) {
    assert.ok(isAffirmative(s), s);
  }
});

test('a qualified or mixed answer is not a yes', () => {
  for (const s of [
    'yes but move it to 6',
    'no',
    'yesterday',
    'not yet',
    '',
    null,
    'what is it?',
    'Ja.',
    'please cancel',
    'yes no',
    'Add an event to my calendar'
  ]) {
    assert.ok(!isAffirmative(s), String(s));
  }
});

test('negatives cancel', () => {
  for (const s of ['No.', 'cancel', 'cancel that', 'stop', 'never mind', 'nevermind', "don't"]) {
    assert.ok(isNegative(s), s);
  }
  assert.ok(!isNegative('no wait, make it 6'));
  assert.ok(!isNegative('yes'));
});

test('freshness window', () => {
  const now = Date.parse('2026-11-14T10:00:00Z');
  assert.ok(isFresh('2026-11-14T09:59:00Z', now));
  assert.ok(!isFresh(new Date(now - CONFIRM_TTL_MS - 1).toISOString(), now));
  assert.ok(!isFresh('garbage', now));
});

test('describeAction reads back the action', () => {
  const fmt = () => 'Fri, 6 PM';
  assert.equal(
    describeAction('create_calendar_event', { title: 'Uber OA', start_time: 'x' }, fmt),
    'Add "Uber OA" to your Google Calendar on Fri, 6 PM'
  );
  assert.equal(describeAction('schedule_reminder', { message: 'Leave' }), 'Text you "Leave"');
});
