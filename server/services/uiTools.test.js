// node --test services/  (built-in runner, no deps)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { websiteUrl } from './uiTools.js';

test('domains and https links become openable links', () => {
  assert.deepEqual(websiteUrl('youtube.com'), { ok: true, url: 'https://youtube.com/', site: 'youtube.com' });
  assert.deepEqual(websiteUrl('  https://www.atlassian.com/company/careers '), {
    ok: true,
    url: 'https://www.atlassian.com/company/careers',
    site: 'atlassian.com'
  });
  assert.equal(websiteUrl('http://example.org/a?b=1').ok, true);
});

test('script, file and data links are refused', () => {
  for (const raw of [
    'javascript:alert(1)',
    'javascript://%0aalert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///C:/Windows/win.ini',
    'vbscript:msgbox(1)',
    'mailto:someone@example.com'
  ]) {
    assert.equal(websiteUrl(raw).ok, false, raw);
  }
});

test('local and home-network addresses are refused', () => {
  for (const raw of [
    'localhost:5173',
    'http://127.0.0.1',
    'http://192.168.1.1',
    'http://10.0.0.5/admin',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'printer.local',
    'http://intranet',
    'https://user:pass@example.com',
    'https://example.com:8443'
  ]) {
    assert.equal(websiteUrl(raw).ok, false, raw);
  }
});

test('an empty request asks which website', () => {
  assert.deepEqual(websiteUrl(''), { ok: false, reason: 'Which website?' });
  assert.equal(websiteUrl(undefined).ok, false);
});
