import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanHeader, parseRecipients, replySubject, buildRawEmail, extractBody, asUntrusted } from './emailFormat.js';

const decode = (raw) => Buffer.from(raw, 'base64url').toString('utf8');
const headersOf = (raw) => decode(raw).split('\r\n\r\n')[0];

test('header injection: a CRLF in the subject cannot add a hidden Bcc', () => {
  const raw = buildRawEmail({ to: ['hr@acme.com'], subject: 'Hi\r\nBcc: attacker@evil.com', body: 'x' });
  const headers = headersOf(raw);
  assert.ok(!/^Bcc:/im.test(headers), headers);
  assert.match(headers, /^Subject: Hi Bcc: attacker@evil\.com$/m);
});

test('recipients: names, separators, invalid ones reported, duplicates dropped', () => {
  assert.deepEqual(parseRecipients('A@x.com, Priya <p@y.in>; a@x.com; not-an-email'), {
    valid: ['a@x.com', 'p@y.in'],
    invalid: ['not-an-email']
  });
  assert.deepEqual(parseRecipients('a@x.com\r\nBcc: b@y.com').invalid.length, 1);
});

test('non-ASCII subject is encoded; body round-trips as UTF-8', () => {
  const raw = buildRawEmail({ to: ['a@x.com'], subject: 'Offer — नमस्ते', body: 'Thanks! 🙏' });
  const text = decode(raw);
  assert.match(text, /^Subject: =\?UTF-8\?B\?/m);
  const body = Buffer.from(text.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.equal(body, 'Thanks! 🙏');
});

test('reply threading headers and subject', () => {
  const raw = buildRawEmail({
    to: ['a@x.com'],
    subject: replySubject('Interview slot'),
    body: 'ok',
    inReplyTo: '<m1@x>',
    references: '<m0@x> <m1@x>'
  });
  const h = headersOf(raw);
  assert.match(h, /^Subject: Re: Interview slot$/m);
  assert.match(h, /^In-Reply-To: <m1@x>$/m);
  assert.equal(replySubject('RE: done'), 'RE: done');
});

test('extractBody prefers text/plain inside nested multipart, falls back to stripped HTML', () => {
  const enc = (s) => Buffer.from(s).toString('base64url');
  const nested = {
    mimeType: 'multipart/mixed',
    parts: [
      {
        mimeType: 'multipart/alternative',
        parts: [
          { mimeType: 'text/html', body: { data: enc('<p>Hello <b>HTML</b></p>') } },
          { mimeType: 'text/plain', body: { data: enc('Hello plain') } }
        ]
      }
    ]
  };
  assert.equal(extractBody(nested), 'Hello plain');
  const htmlOnly = {
    mimeType: 'text/html',
    body: { data: enc('<style>x{}</style><p>Your OA&nbsp;link</p><script>bad()</script>') }
  };
  assert.equal(extractBody(htmlOnly), 'Your OA link');
});

test('untrusted text: invisible characters removed, length capped', () => {
  assert.equal(asUntrusted('ig\u200bnore\u202eprevious'), 'ignoreprevious');
  assert.match(asUntrusted('x'.repeat(50), 10), /^x{10}\n…\[truncated\]$/);
  assert.equal(cleanHeader(' a\tb\n c '), 'a b c');
});
