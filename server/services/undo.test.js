// node --test services/  (built-in runner, no deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUndo, restoreStep, deleteStep, insertStep } from './undo.js';
import { undoBlockedReason, UNDO_WINDOW_MS } from './actionPolicy.js';

test('well-formed plans pass', () => {
  assert.equal(validateUndo([deleteStep('tasks', 't1')]), null);
  assert.equal(validateUndo([{ op: 'habit_uncheck', habit_id: 'h1', date: '2026-11-15' }]), null);
  assert.equal(
    validateUndo([{ op: 'update', table: 'sms_jobs', id: 's1', set: { status: 'cancelled' }, match: { status: 'pending' } }]),
    null
  );
  assert.equal(validateUndo([deleteStep('goal_milestones', 'm1'), { op: 'recompute_goal', goal_id: 'g1' }]), null);
});

test('plans can only touch Nexus data, never ids or owners, never other tables', () => {
  assert.match(validateUndo([deleteStep('auth.users', 'u1')]), /can't be undone/);
  assert.match(validateUndo([deleteStep('action_log', 'a1')]), /can't be undone/);
  assert.match(validateUndo([{ op: 'update', table: 'tasks', id: 't1', set: { user_id: 'someone-else' } }]), /ordinary columns/);
  assert.match(validateUndo([{ op: 'update', table: 'tasks', id: 't1', set: { id: 'x' } }]), /ordinary columns/);
  assert.match(validateUndo([{ op: 'update', table: 'tasks', id: 't1', set: {}, match: { user_id: 'x' } }]), /ordinary columns/);
  assert.match(validateUndo([{ op: 'drop_table', table: 'tasks' }]), /Unknown undo step/);
  assert.match(validateUndo([{ op: 'delete', table: 'tasks' }]), /needs an id/);
  assert.match(validateUndo([{ op: 'habit_check', habit_id: 'h1', date: 'today' }]), /YYYY-MM-DD/);
  assert.match(validateUndo([]), /1-10 steps/);
  assert.match(validateUndo('delete everything'), /1-10 steps/);
});

test('restoring an edit puts back only the changed columns, never id or owner', () => {
  const before = { id: 't1', user_id: 'u1', title: 'Resume', status: 'todo', due_date: null, embedding: '[0.1]' };
  assert.deepEqual(restoreStep('tasks', before, ['status', 'updated_at', 'user_id', 'embedding']), {
    op: 'update',
    table: 'tasks',
    id: 't1',
    set: { status: 'todo' }
  });
  assert.deepEqual(insertStep('notes', [{ id: 'n1', content: 'x', embedding: '[0.1]' }]).rows, [{ id: 'n1', content: 'x' }]);
});

test('only executed actions with a plan, within a day, can be undone', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const row = (fields) => ({
    status: 'executed',
    tool: 'create_task',
    summary: 'Task created.',
    undo: [deleteStep('tasks', 't1')],
    created_at: new Date(now - 60_000).toISOString(),
    ...fields
  });
  assert.equal(undoBlockedReason(row({}), now), null);
  assert.match(undoBlockedReason(null, now), /nothing/);
  assert.match(undoBlockedReason(row({ status: 'undone' }), now), /already undone/);
  assert.match(undoBlockedReason(row({ status: 'cancelled' }), now), /cancelled/);
  assert.match(undoBlockedReason(row({ status: 'awaiting_confirmation' }), now), /awaiting confirmation/);
  assert.match(undoBlockedReason(row({ tool: 'send_email', undo: null }), now), /Sent emails can't be undone/);
  assert.match(undoBlockedReason(row({ undo: null, undo_unavailable: true }), now), /migration 007/);
  assert.match(undoBlockedReason(row({ tool: 'create_calendar_event', undo: null }), now), /Calendar changes/);
  assert.match(
    undoBlockedReason(row({ created_at: new Date(now - UNDO_WINDOW_MS - 1).toISOString() }), now),
    /more than a day/
  );
});
