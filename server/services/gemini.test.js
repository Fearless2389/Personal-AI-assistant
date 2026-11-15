import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isModelUnavailable, CHAT_MODELS } from './gemini.js';

test('timeouts, overloads and quota errors fall back to the next model', () => {
  for (const err of [
    Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }),
    new Error('Request aborted when fetching https://…: This operation was aborted'),
    new Error('[503 Service Unavailable] The model is overloaded'),
    new Error('[429 Too Many Requests] Resource has been exhausted'),
    new Error('fetch failed')
  ]) {
    assert.ok(isModelUnavailable(err), err.message);
  }
});

test('a bad request or a missing signature is not hidden by a fallback', () => {
  assert.ok(!isModelUnavailable(new Error('[400 Bad Request] Function call is missing a thought_signature')));
  assert.ok(!isModelUnavailable(new Error('[403 Forbidden] API key not valid')));
});

test('there is a backup chat model, and no duplicates', () => {
  assert.ok(CHAT_MODELS.length >= 2);
  assert.equal(new Set(CHAT_MODELS).size, CHAT_MODELS.length);
});
