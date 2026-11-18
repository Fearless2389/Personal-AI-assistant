// The safety table (PLAN.md T1.5a). Each row: a step, what the agent knows, the expected risk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyStep } from './risk.js';

const SHOP = 'https://shop.example.com/p/1';
const FIXTURE = 'http://127.0.0.1:3999';
const btn = (name, extra = {}) => ({ role: 'button', name, type: 'button', formSubmitName: null, ...extra });
const link = (name) => ({ role: 'link', name, type: null, formSubmitName: null });
const field = (name, extra = {}) => ({ role: 'textbox', name, type: 'text', formSubmitName: null, ...extra });

const CASES = [
  // [label, action, ctx, expected risk]
  ['Add to cart', { type: 'click', ref: 1 }, { element: btn('Add to cart') }, 'safe'],
  ['View link', { type: 'click', ref: 1 }, { element: link('View') }, 'safe'],
  ['Add to cart as a form submit (Amazon)', { type: 'click', ref: 1 }, { element: btn('Add to cart', { type: 'submit', formSubmitName: 'Add to cart' }) }, 'safe'],
  ['Buy Now as a form submit (Amazon)', { type: 'click', ref: 1 }, { element: btn('Buy Now', { type: 'submit', formSubmitName: 'Add to cart' }) }, 'confirm'],
  ['transparent "View offers" over a hidden Delete', { type: 'click', ref: 1 }, { element: btn('View offers [Delete account]', { type: 'submit', formSubmitName: 'View offers' }) }, 'confirm'],
  ['Remove from cart', { type: 'click', ref: 1 }, { element: btn('Remove') }, 'safe'],
  ['Apply filters', { type: 'click', ref: 1 }, { element: btn('Apply filters') }, 'safe'],
  ['Search submit', { type: 'click', ref: 1 }, { element: btn('Search', { type: 'submit', formSubmitName: 'Search' }) }, 'safe'],
  ['Google Search submit', { type: 'click', ref: 1 }, { element: btn('Google Search', { type: 'submit', formSubmitName: 'Google Search' }) }, 'safe'],
  ['Place order', { type: 'click', ref: 1 }, { element: btn('Place order', { type: 'submit', formSubmitName: 'Place order' }) }, 'confirm'],
  ['Proceed to checkout', { type: 'click', ref: 1 }, { element: btn('Proceed to checkout') }, 'confirm'],
  ['Buy now', { type: 'click', ref: 1 }, { element: btn('Buy Now') }, 'confirm'],
  ['Book slot', { type: 'click', ref: 1 }, { element: btn('Book slot') }, 'confirm'],
  ['Delete', { type: 'click', ref: 1 }, { element: btn('Delete') }, 'confirm'],
  ['Log out link', { type: 'click', ref: 1 }, { element: link('Log out') }, 'confirm'],
  ['Sign up', { type: 'click', ref: 1 }, { element: btn('Sign up') }, 'confirm'],
  ['Send', { type: 'click', ref: 1 }, { element: btn('Send message') }, 'confirm'],
  ['Subscribe', { type: 'click', ref: 1 }, { element: btn('Subscribe & Save') }, 'confirm'],
  ['Submit (form)', { type: 'click', ref: 1 }, { element: btn('Submit', { type: 'submit', formSubmitName: 'Submit' }) }, 'confirm'],
  ['Continue submit button', { type: 'click', ref: 1 }, { element: btn('Continue', { type: 'submit', formSubmitName: 'Continue' }) }, 'confirm'],
  ['Continue plain button', { type: 'click', ref: 1 }, { element: btn('Continue') }, 'safe'],
  ['consent checkbox', { type: 'click', ref: 1 }, { element: { role: 'checkbox', name: 'I agree to be contacted', type: 'checkbox', formSubmitName: 'Submit' } }, 'safe'],
  ['terms radio', { type: 'click', ref: 1 }, { element: { role: 'radio', name: 'I accept the terms', type: 'radio' } }, 'safe'],
  ['auto-renew switch', { type: 'click', ref: 1 }, { element: { role: 'switch', name: 'Subscribe to auto-renew' } }, 'confirm'],
  ['time slot button', { type: 'click', ref: 1 }, { element: btn('4:00 PM') }, 'safe'],
  ['type into password', { type: 'type', ref: 1, text: 'x' }, { element: field('Password', { type: 'password' }) }, 'never'],
  ['type into cardnumber', { type: 'type', ref: 1, text: '4111' }, { element: field('Card number', { inputName: 'cardnumber' }) }, 'never'],
  ['type into CVV', { type: 'type', ref: 1, text: '123' }, { element: field('CVV') }, 'never'],
  ['type into OTP', { type: 'type', ref: 1, text: '123456' }, { element: field('Enter OTP') }, 'never'],
  ['type into UPI id', { type: 'type', ref: 1, text: 'me@okicici' }, { element: field('UPI ID') }, 'never'],
  ['select card expiry', { type: 'select', ref: 1, option: '12' }, { element: { role: 'combobox', name: 'Expiry month', autocomplete: 'cc-exp-month' } }, 'never'],
  ['card number typed into a plain field', { type: 'type', ref: 1, text: '4111 1111 1111 1111' }, { element: field('Notes') }, 'never'],
  ['passenger name is not a password', { type: 'type', ref: 1, text: 'Ruthvik' }, { element: field('Passenger name') }, 'safe'],
  ['search box mentioning cards', { type: 'type', ref: 1, text: 'credit card holder' }, { element: { role: 'searchbox', name: 'Search credit cards', type: 'search' } }, 'safe'],
  ['type search + Enter', { type: 'type', ref: 1, text: 'usb-c charger', submit: true }, { element: { role: 'searchbox', name: 'Search', type: 'search', formSubmitName: 'Go' } }, 'safe'],
  ['type + Enter into sign-up form', { type: 'type', ref: 1, text: 'Ruthvik', submit: true }, { element: field('Name', { formSubmitName: 'Create account' }) }, 'confirm'],
  ['press Enter in checkout form', { type: 'press', key: 'Enter' }, { focused: field('Address', { formSubmitName: 'Place order' }) }, 'confirm'],
  ['press Enter, nothing focused', { type: 'press', key: 'Enter' }, {}, 'safe'],
  ['press Escape', { type: 'press', key: 'Escape' }, { focused: field('Address', { formSubmitName: 'Place order' }) }, 'safe'],
  ['email not in goal', { type: 'type', ref: 1, text: 'me@x.com' }, { element: field('Email'), goal: 'register me for the workshop' }, 'confirm'],
  ['email in goal', { type: 'type', ref: 1, text: 'me@x.com' }, { element: field('Email'), goal: 'register me with me@x.com' }, 'safe'],
  ['phone not in goal', { type: 'type', ref: 1, text: '+91 98765 43210' }, { element: field('Phone'), goal: 'fill the form' }, 'confirm'],
  ['phone in goal (other format)', { type: 'type', ref: 1, text: '+91 98765 43210' }, { element: field('Phone'), goal: 'my number is 9876543210' }, 'safe'],
  ['url not in goal', { type: 'type', ref: 1, text: 'see https://evil.example/x' }, { element: field('Comment'), goal: 'leave a review' }, 'confirm'],
  ['navigate to a shop', { type: 'navigate', url: 'https://www.amazon.in/' }, {}, 'safe'],
  ['navigate to razorpay', { type: 'navigate', url: 'https://razorpay.com/x' }, {}, 'never'],
  ['navigate to netbanking', { type: 'navigate', url: 'https://netbanking.hdfcbank.com/' }, {}, 'never'],
  ['navigate to LAN router', { type: 'navigate', url: 'http://192.168.1.1' }, {}, 'never'],
  ['navigate to localhost', { type: 'navigate', url: 'http://localhost:3001/api' }, {}, 'never'],
  ['navigate to the allowed fixture', { type: 'navigate', url: `${FIXTURE}/cart.html` }, { allowOrigins: [FIXTURE] }, 'safe'],
  ['click on a payment page', { type: 'click', ref: 1 }, { element: btn('Continue'), pageUrl: 'https://checkout.razorpay.com/v1' }, 'never'],
  ['click on a LAN page (after a redirect)', { type: 'click', ref: 1 }, { element: btn('Save'), pageUrl: 'http://192.168.1.1/admin' }, 'never'],
  ['type on the Nexus server page', { type: 'type', ref: 1, text: 'x' }, { element: field('Search'), pageUrl: 'http://localhost:3001/' }, 'never'],
  ['click on the allowed fixture', { type: 'click', ref: 1 }, { element: btn('Add to cart'), pageUrl: `${FIXTURE}/product.html`, allowOrigins: [FIXTURE] }, 'safe'],
  ['scroll on a payment page', { type: 'scroll', direction: 'down' }, { pageUrl: 'https://checkout.razorpay.com/v1' }, 'safe'],
  ['scroll', { type: 'scroll', direction: 'down' }, { pageUrl: SHOP }, 'safe'],
  ['done', { type: 'done', success: true, summary: 'ok' }, {}, 'safe'],
  ['ask_user', { type: 'ask_user', question: 'which colour?' }, {}, 'safe']
];

test(`risk table (${CASES.length} cases)`, () => {
  const wrong = [];
  for (const [label, action, ctx, expected] of CASES) {
    const got = classifyStep(action, { pageUrl: SHOP, ...ctx });
    if (got.risk !== expected) wrong.push(`${label}: expected ${expected}, got ${got.risk} (${got.reason})`);
  }
  assert.deepEqual(wrong, []);
});

test('reasons are readable for the confirm card', () => {
  assert.deepEqual(classifyStep({ type: 'click', ref: 1 }, { element: btn('Place order', { type: 'submit', formSubmitName: 'Place order' }) }), {
    risk: 'confirm',
    reason: 'Click "Place order"'
  });
  assert.equal(
    classifyStep({ type: 'type', ref: 1, text: 'x' }, { element: field('Password', { type: 'password' }) }).reason,
    'Nexus never types passwords or payment details'
  );
  assert.match(classifyStep({ type: 'type', ref: 1, text: 'me@x.com' }, { element: field('Email') }).reason, /me@x\.com/);
});
