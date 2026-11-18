// The browser agent's safety core (PLAN.md T1.5a, rules S2–S4). Every step the model proposes is
// classified BEFORE it runs:
//   never   → not executed at all (passwords, card/UPI/OTP fields, payment and banking sites,
//             private-network URLs). Ruthvik does those by hand.
//   confirm → parked until Ruthvik says yes through the gate (buy, pay, submit, send, book, delete,
//             sign up, log out, … and typing personal data the goal didn't contain).
//   safe    → runs (search, sort, open, add to cart, scroll, read).
// Pure: no page access. The loop passes what it knows (the snapshot element, the page URL, the
// goal Ruthvik approved). First matching rule wins; risk.test.js holds the table.
import { checkNavigation, PAYMENT_HOST } from './urlPolicy.js';

export { PAYMENT_HOST };

export const SECRET_FIELD =
  /passw(or)?d|passcode|\bpass\b|\bpin\b|card|cc-?(num|number|csc|exp)|cvv|cvc|expir|\botp\b|one.?time|\bupi\b|ifsc|account.?(no|number)|aadhaa?r|\bpan\b|\bssn\b|security code/i;
export const RISKY_NAME =
  /\b(buy|pay|place (your )?order|check ?out|proceed to (checkout|pay(ment)?|buy)|submit|send|post|publish|tweet|reply|delete|remove account|cancel (order|booking|subscription)|confirm|book( now| slot)?|reserve|transfer|donate|subscribe|sign ?up|register|apply( now)?|unsubscribe|log ?out|sign ?out|save changes|update (password|email|phone)|accept( offer)?|agree|add payment|upgrade)\b/i;
// Buttons that only look things up. "Apply filters" matches RISKY_NAME's "apply" but is harmless.
export const SEARCHY = /^(go|find|filter|filters|sort|apply filters?|show results|search\b.*|.*\bsearch)$/i;
// Submit buttons that only put something in a cart/list (Amazon's "Add to cart" is a form submit).
// Adding to the cart is allowed (PLAN.md): nothing is bought until checkout, which still asks.
export const CART_ADD = /^(add to (cart|bag|basket|trolley|wish ?list|list)|add)$/i;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
const URL_IN_TEXT = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+/gi;
const LONG_DIGITS = /(?:\d[\s-]?){12,19}/; // card / Aadhaar-like numbers

const PAGE_ACTIONS = new Set(['click', 'type', 'select', 'press']);
const FORM_TOGGLES = new Set(['checkbox', 'radio']); // not 'switch': settings switches apply at once

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

const isPaymentHost = (url) => {
  const host = hostOf(url);
  return Boolean(host) && PAYMENT_HOST.test(host);
};

// A password input, or a field named like a secret. Search boxes are exempt from the name test
// ("Search credit cards"); a card number typed anywhere is still caught by LONG_DIGITS.
const isSecretField = (el) =>
  Boolean(el) &&
  (el.type === 'password' ||
    (el.role !== 'searchbox' && [el.name, el.inputName, el.autocomplete].some((v) => v && SECRET_FIELD.test(v))));

// 12–19 digits that aren't a phone number (a "+91 98765 43210" is 12 digits too).
const hasLongNumber = (text) => LONG_DIGITS.test(text.replace(PHONE, ' '));

const isRiskyName = (name) => Boolean(name) && RISKY_NAME.test(name) && !SEARCHY.test(name.trim());

// Does submitting this element's form commit something (vs. run a search)?
function riskyForm(el) {
  const submit = el?.formSubmitName;
  if (!submit) return false;
  return RISKY_NAME.test(submit) || !SEARCHY.test(submit.trim());
}

// Personal data in typed text that the goal Ruthvik approved doesn't contain (S4).
function unapprovedData(text, goal) {
  const g = String(goal ?? '').toLowerCase();
  const gDigits = g.replace(/\D/g, '');
  for (const email of text.match(EMAIL) ?? []) {
    if (!g.includes(email.toLowerCase())) return `an email address (${email})`;
  }
  for (const phone of text.match(PHONE) ?? []) {
    if (!gDigits.includes(phone.replace(/\D/g, '').slice(-10))) return `a phone number (${phone})`;
  }
  for (const url of text.match(URL_IN_TEXT) ?? []) {
    if (!g.includes(url.toLowerCase())) return `a link (${url})`;
  }
  return null;
}

const quote = (s) => `"${String(s ?? '').slice(0, 60)}"`;

/**
 * @param action  the step: { type, ref?, text?, submit?, option?, key?, url? }
 * @param ctx     { element (snapshot element for action.ref), focused (element last typed into /
 *                clicked, for `press`), pageUrl, goal, allowOrigins }
 * @returns {{ risk: 'safe'|'confirm'|'never', reason: string }}
 */
export function classifyStep(action, { element = null, focused = null, pageUrl = '', goal = '', allowOrigins = [] } = {}) {
  const type = action?.type;

  // 1. Payment and banking sites: nothing gets clicked or typed there.
  if (type === 'navigate' && isPaymentHost(action.url)) {
    return { risk: 'never', reason: 'Payment and banking sites are off limits' };
  }
  if (PAGE_ACTIONS.has(type) && isPaymentHost(pageUrl)) {
    return { risk: 'never', reason: 'Payment and banking sites are off limits' };
  }

  // 1b. A page on a local / private address (reached by a redirect): nothing gets touched there.
  if (PAGE_ACTIONS.has(type) && /^https?:/i.test(pageUrl) && !checkNavigation(pageUrl, allowOrigins).ok) {
    return { risk: 'never', reason: 'This page is on a local or private address' };
  }

  // 2. Only public web addresses (or this run's allowed test origin).
  if (type === 'navigate') {
    const checked = checkNavigation(action.url, allowOrigins);
    if (!checked.ok) return { risk: 'never', reason: checked.reason };
  }

  // 3. Secrets are Ruthvik's to type.
  if ((type === 'type' || type === 'select') && isSecretField(element)) {
    return { risk: 'never', reason: 'Nexus never types passwords or payment details' };
  }
  if (type === 'type' && hasLongNumber(String(action.text ?? ''))) {
    return { risk: 'never', reason: 'Nexus never types card or ID numbers' };
  }

  // 4. Buttons and links that commit something. Ticking a checkbox or radio ("I agree to the
  // terms") only changes the form; the submit that sends it is what gets confirmed (rules 5-6).
  if (type === 'click' && !FORM_TOGGLES.has(element?.role) && isRiskyName(element?.name)) {
    return { risk: 'confirm', reason: `Click ${quote(element.name)}` };
  }

  // 5. Submitting a form with Enter.
  if (type === 'type' && action.submit && riskyForm(element)) {
    return { risk: 'confirm', reason: `Submit the form (${quote(element.formSubmitName)})` };
  }
  if (type === 'press' && action.key === 'Enter' && riskyForm(focused)) {
    return { risk: 'confirm', reason: `Submit the form (${quote(focused.formSubmitName)})` };
  }

  // 6. Any submit button that isn't a search.
  const submitName = String(element?.name ?? '').trim();
  if (type === 'click' && element?.type === 'submit' && element.formSubmitName && !SEARCHY.test(submitName) && !CART_ADD.test(submitName)) {
    return { risk: 'confirm', reason: `Submit the form (${quote(element.name || 'Submit')})` };
  }

  // 7. Personal data the goal didn't contain.
  if (type === 'type') {
    const found = unapprovedData(String(action.text ?? ''), goal);
    if (found) return { risk: 'confirm', reason: `Type ${found}, which wasn't in the request` };
  }

  // 8. Everything else: search, sort, open, add to cart, scroll, read, finish, ask.
  return { risk: 'safe', reason: '' };
}
