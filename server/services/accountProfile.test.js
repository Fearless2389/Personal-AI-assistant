import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountBlock } from './accountProfile.js';

test("the assistant is told the user's own address and to never ask for it", () => {
  const block = accountBlock({
    googleEmail: 'me@gmail.com',
    loginEmail: 'me@gmail.com',
    googleStatus: 'connected',
    smsReady: false
  });
  assert.match(block, /Rama's own email: me@gmail\.com\. "Email myself"/);
  assert.match(block, /never ask for it/);
  assert.match(block, /connected as me@gmail\.com/);
  assert.ok(!/signs in to Nexus as/.test(block), 'same account: no second line');
});

test('different login and Google accounts are both stated', () => {
  const block = accountBlock({
    googleEmail: 'g@gmail.com',
    loginEmail: 'login@college.edu',
    googleStatus: 'connected'
  });
  assert.match(block, /signs in to Nexus as login@college\.edu; Gmail and Calendar use g@gmail\.com/);
  assert.match(block, /own email: g@gmail\.com/, 'the Google address is the one that sends');
});

test('not connected: falls back to the login email and says how to fix', () => {
  const block = accountBlock({ googleEmail: null, loginEmail: 'login@x.com', googleStatus: 'broken', smsReady: true });
  assert.match(block, /own email: login@x\.com/);
  assert.match(block, /disconnected \(expired\).*Calendar page/);
  assert.match(block, /SMS reminders are set up/);
});
