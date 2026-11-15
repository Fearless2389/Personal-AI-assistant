import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLoopback, secretMatches } from './hotkeyHub.js';

test('only this machine may press the hotkey', () => {
  for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '127.0.1.1']) assert.ok(isLoopback(a), a);
  for (const a of ['192.168.1.20', '10.0.0.2', '::ffff:192.168.1.20', '', undefined, '8.8.8.8'])
    assert.ok(!isLoopback(a), String(a));
});

test('the shared secret must match exactly; missing secrets never match', () => {
  assert.ok(secretMatches('abc123', 'abc123'));
  assert.ok(!secretMatches('abc124', 'abc123'));
  assert.ok(!secretMatches('', 'abc123'));
  assert.ok(!secretMatches('abc123', ''));
  assert.ok(!secretMatches(undefined, undefined));
});
