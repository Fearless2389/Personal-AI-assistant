import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, checkUrl } from './webFetch.js';
import { htmlToText } from './htmlText.js';

test('private, loopback, link-local and metadata addresses are refused', () => {
  for (const ip of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:192.168.0.1'
  ]) {
    assert.ok(!isPublicAddress(ip), ip);
  }
});

test('public addresses pass, including edges next to private ranges', () => {
  for (const ip of ['8.8.8.8', '172.15.255.255', '172.32.0.1', '1.1.1.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.ok(isPublicAddress(ip), ip);
  }
});

test('URL checks: scheme, credentials, ports, local names, literal private IPs', () => {
  assert.ok(checkUrl('https://www.amazon.jobs/en/teams/sde').ok);
  for (const bad of [
    'file:///etc/passwd',
    'ftp://x.com',
    'http://user:pw@x.com',
    'http://x.com:8080/',
    'http://localhost/',
    'http://printer.local/',
    'http://10.0.0.5/admin',
    'http://[::1]/',
    'http://169.254.169.254/latest/meta-data',
    'not a url'
  ]) {
    assert.ok(!checkUrl(bad).ok, bad);
  }
});

test('html to text: drops scripts and navigation, keeps the content', () => {
  const html =
    '<html><head><title>T</title><script>x()</script></head><body><nav>Home | Jobs</nav><h1>SDE Intern</h1><p>Apply by Nov 30&nbsp;&amp; bring CV.</p><footer>© Co</footer></body></html>';
  assert.equal(htmlToText(html), 'T SDE Intern\nApply by Nov 30 & bring CV.');
});
