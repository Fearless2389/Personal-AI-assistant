// node --test services/  (built-in runner, no deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  riskOf,
  isReadOnly,
  isAffirmative,
  isNegative,
  isFresh,
  describeAction,
  CONFIRM_TTL_MS
} from './actionPolicy.js';

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

test('per-action risk: deleting your data waits, other actions run', () => {
  assert.equal(riskOf('manage_task', { action: 'delete' }), 'confirm');
  assert.equal(riskOf('manage_task', { action: 'complete' }), 'safe');
  assert.equal(riskOf('manage_habit', { action: 'create' }), 'safe');
  assert.equal(riskOf('manage_goal', { action: 'delete' }), 'confirm');
  assert.equal(riskOf('manage_task', {}), 'safe');
});

test('list/read actions are lookups (not logged); writes are', () => {
  assert.ok(isReadOnly('manage_note', { action: 'read' }));
  assert.ok(isReadOnly('manage_habit', { action: 'list' }));
  assert.ok(!isReadOnly('manage_habit', { action: 'create' }));
  assert.ok(isReadOnly('list_upcoming'));
});

test('a delete is read back with the resolved name', () => {
  assert.equal(
    describeAction('manage_task', {
      action: 'delete',
      task: 'resume',
      target_label: 'Update resume with Nexus project'
    }),
    'Delete the task "Update resume with Nexus project"'
  );
});

test('email: reading and drafting run, sending always waits', () => {
  assert.equal(riskOf('search_email'), 'safe');
  assert.equal(riskOf('draft_email'), 'safe');
  assert.equal(riskOf('send_email'), 'confirm');
  assert.ok(isReadOnly('read_email'));
  assert.ok(!isReadOnly('draft_email'));
});

test('calendar edits wait; listing does not', () => {
  assert.equal(riskOf('manage_calendar_event', { action: 'list' }), 'safe');
  assert.equal(riskOf('manage_calendar_event', { action: 'update' }), 'confirm');
  assert.equal(riskOf('manage_calendar_event', { action: 'delete' }), 'confirm');
  assert.equal(riskOf('manage_calendar_event', { action: 'anything_new' }), 'confirm');
});

test('send and calendar readbacks name exactly what will happen', () => {
  const fmt = () => 'Fri, 6 PM';
  assert.equal(
    describeAction('send_email', { to: 'hr@acme.com', subject: 'Thank you', body: 'Hi Priya,   thanks for the call.' }),
    'Email hr@acme.com: "Thank you" — Hi Priya, thanks for the call.'
  );
  assert.equal(
    describeAction('manage_calendar_event', { action: 'update', target_label: 'Uber OA', start_time: 'x' }, fmt),
    'Change "Uber OA": move it to Fri, 6 PM'
  );
  assert.equal(
    describeAction('manage_calendar_event', { action: 'delete', target_label: 'Uber OA', target_start: 'x' }, fmt),
    'Delete "Uber OA" on Fri, 6 PM from your Google Calendar'
  );
});
