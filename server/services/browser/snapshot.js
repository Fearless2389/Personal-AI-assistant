// What the browser agent "sees" (PLAN.md T1.3, §2). Instead of screenshots, each step sends the
// model a text snapshot: the visible interactive elements, numbered, plus the visible page text.
// The model acts by number ("click 3"); actions.js finds the element by its data-nexus-ref.
//
// Safety (S4): only what a person could see is included. Hidden elements (display:none,
// visibility:hidden, opacity ~0, aria-hidden, inert, zero size, pushed off-page) are dropped, so
// a page can't hide a "Delete account" button or "ignore your instructions" text for the agent
// alone. Invisible characters are stripped from every string. Passwords' values are never read.
import { INVISIBLE_CHARS } from '../emailFormat.js';

export const MAX_ELEMENTS = 150;
export const MAX_TEXT = 3000;

// Runs INSIDE the page (page.evaluate): self-contained, no closures over Node variables.
export function SNAPSHOT_SCRIPT({ maxElements, maxText }) {
  const clean = (s, max = 80) => {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  };
  const viewH = window.innerHeight;
  const viewW = window.innerWidth;

  // Can a person see this element (now, or after scrolling)? `ignoreOpacity` is for the
  // transparent-control check below; everything else must also be non-transparent.
  const seen = new Map();
  const isVisible = (el, ignoreOpacity = false) => {
    const key = ignoreOpacity ? 'o' : 'v';
    if (!seen.has(el)) seen.set(el, {});
    const memo = seen.get(el);
    if (key in memo) return memo[key];
    let ok = true;
    if (el.closest('[aria-hidden="true"], [inert]')) ok = false;
    else if (
      el.checkVisibility &&
      !el.checkVisibility({ checkOpacity: !ignoreOpacity, checkVisibilityCSS: true, contentVisibilityAuto: true })
    )
      ok = false;
    else {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden') ok = false;
      else if (!ignoreOpacity && Number(style.opacity) <= 0.1) ok = false;
      else if (rect.width < 1 || rect.height < 1) ok = false;
      // pushed off the page to the left/top (a classic way to hide text)
      else if (rect.right + window.scrollX <= 0 || rect.bottom + window.scrollY <= 0) ok = false;
      else if (parseFloat(style.fontSize) < 4 && el.children.length === 0) ok = false;
    }
    memo[key] = ok;
    return ok;
  };

  // Big shops (Amazon's "Add to Cart", "Buy Now") put a TRANSPARENT <input> on top of a styled,
  // visible label. Such a control counts as visible only if it is the topmost element at its centre
  // and its parent shows text; it is then named by that visible text (what a person sees). If its
  // own label says something else, both are shown, so risk.js still sees e.g. "Delete account".
  const overlayName = (el) => {
    if (!['INPUT', 'BUTTON'].includes(el.tagName)) return null;
    if (el.tagName === 'INPUT' && !['submit', 'button', 'image'].includes(el.type)) return null;
    const parent = el.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) return null;
    if (!isVisible(el, true) || !isVisible(parent)) return null;
    const r = el.getBoundingClientRect();
    // The overlay pattern: the control covers (most of) its label's box, like a sheet of glass.
    const pr = parent.getBoundingClientRect();
    if (pr.width * pr.height === 0 || (r.width * r.height) / (pr.width * pr.height) < 0.6) return null;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || (hit !== el && !el.contains(hit))) return null;
    const shown = clean(parent.innerText);
    return shown || null;
  };

  const ROLE_BY_INPUT = {
    submit: 'button', button: 'button', reset: 'button', image: 'button',
    search: 'searchbox', checkbox: 'checkbox', radio: 'radio', range: 'slider'
  };
  const roleOf = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit.split(' ')[0];
    const tag = el.tagName;
    if (tag === 'A') return 'link';
    if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button';
    if (tag === 'SELECT') return 'combobox';
    if (tag === 'TEXTAREA') return 'textbox';
    if (tag === 'INPUT') return ROLE_BY_INPUT[el.type] ?? 'textbox';
    if (el.isContentEditable) return 'textbox';
    return 'generic';
  };

  const nameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return clean(aria);
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.innerText ?? '')
        .join(' ');
      if (t.trim()) return clean(t);
    }
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map((l) => l.innerText).join(' ');
      if (t.trim()) return clean(t);
    }
    if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(el.type) && el.value) return clean(el.value);
    const ph = el.getAttribute('placeholder');
    if (ph && ph.trim()) return clean(ph);
    const alt = el.getAttribute('alt') || el.getAttribute('title');
    if (alt && alt.trim()) return clean(alt);
    const text = el.innerText;
    if (text && text.trim()) return clean(text);
    const img = el.querySelector?.('img[alt]');
    if (img?.alt) return clean(img.alt);
    return '';
  };

  // Visible text first; the control's own label too when it says something different.
  const overlayLabel = (shown, own) => {
    const a = shown.toLowerCase();
    const b = String(own ?? '').toLowerCase();
    return !b || a.includes(b) || b.includes(a) ? shown : clean(`${shown} [${own}]`);
  };

  const SUBMITTERS = 'button:not([type]), button[type="submit"], input[type="submit"], input[type="image"]';
  const formSubmitName = (el) => {
    const form = el.form ?? el.closest('form');
    const submit = form?.querySelector(SUBMITTERS);
    return submit ? nameOf(submit) || 'Submit' : null;
  };

  // Clear refs from the previous snapshot so stale numbers can never match.
  document.querySelectorAll('[data-nexus-ref]').forEach((el) => el.removeAttribute('data-nexus-ref'));

  const CANDIDATES =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], ' +
    '[role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], ' +
    '[role="option"], [role="switch"], [role="combobox"], [contenteditable=""], [contenteditable="true"]';

  const elements = [];
  let more = false;
  for (const el of document.querySelectorAll(CANDIDATES)) {
    const rect = el.getBoundingClientRect();
    // on screen, or within one more screen below (what one scroll would reveal)
    if (rect.bottom <= 0 || rect.top >= viewH * 2 || rect.right <= 0 || rect.left >= viewW) continue;
    let shownName = null;
    if (!isVisible(el)) {
      shownName = overlayName(el);
      if (!shownName) continue;
    }
    if (elements.length >= maxElements) {
      more = true;
      break;
    }
    const ref = elements.length + 1;
    el.setAttribute('data-nexus-ref', String(ref));

    const role = roleOf(el);
    const isInput = el.tagName === 'INPUT';
    const type = isInput || el.tagName === 'BUTTON' ? el.type : null;
    let value = null;
    let options = null;
    if (el.tagName === 'SELECT') {
      value = clean(el.selectedOptions[0]?.text ?? '');
      options = [...el.options].slice(0, 20).map((o) => clean(o.text, 40));
      if (el.options.length > 20) options.push('…');
    } else if (el.tagName === 'TEXTAREA' || (isInput && !['checkbox', 'radio', 'submit', 'button', 'reset', 'image'].includes(el.type))) {
      value = el.type === 'password' ? null : clean(el.value, 80);
    } else if (el.isContentEditable) {
      value = clean(el.innerText, 80);
    }
    let checked = null;
    if (isInput && (el.type === 'checkbox' || el.type === 'radio')) checked = el.checked;
    else if (el.hasAttribute('aria-checked')) checked = el.getAttribute('aria-checked') === 'true';
    else if (el.hasAttribute('aria-pressed')) checked = el.getAttribute('aria-pressed') === 'true';

    elements.push({
      ref,
      role,
      name: shownName ? overlayLabel(shownName, nameOf(el)) : nameOf(el),
      value,
      options,
      type,
      checked,
      disabled: Boolean(el.disabled) || el.getAttribute('aria-disabled') === 'true',
      formSubmitName: formSubmitName(el),
      autocomplete: el.getAttribute('autocomplete'),
      inputName: el.getAttribute('name')
    });
  }

  // Same-named elements ("View", "Add to cart" on every card) get a short `near` label from the
  // closest ancestor whose text says more, so the model can tell them apart.
  const counts = {};
  for (const e of elements) counts[e.role + e.name] = (counts[e.role + e.name] ?? 0) + 1;
  for (const e of elements) {
    if (counts[e.role + e.name] < 2) continue;
    let node = document.querySelector(`[data-nexus-ref="${e.ref}"]`).parentElement;
    for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
      const t = clean(node.innerText, 400);
      if (t.length > e.name.length + 3) {
        e.near = clean(t.replace(e.name, ' '), 60);
        break;
      }
    }
  }

  // Visible text, in document order, starting half a screen above the current view so
  // scrolling down reveals text further into long pages.
  const fromY = window.scrollY - viewH / 2;
  const parts = [];
  let length = 0;
  let textCut = false;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return isVisible(parent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const bottom = node.parentElement.getBoundingClientRect().bottom + window.scrollY;
    if (bottom < fromY) continue;
    const piece = node.nodeValue.replace(/\s+/g, ' ').trim();
    parts.push(piece);
    length += piece.length + 1;
    if (length > maxText) {
      textCut = true;
      break;
    }
  }
  let text = parts.join(' ');
  if (text.length > maxText) text = text.slice(0, maxText);

  return {
    url: location.href,
    title: clean(document.title, 200),
    scroll: { y: Math.round(window.scrollY), height: document.documentElement.scrollHeight },
    elements,
    text,
    truncated: { elements: more, text: textCut || fromY > 0 }
  };
}

// Strip invisible characters from every string in the snapshot (S4).
function scrub(value) {
  if (typeof value === 'string') return value.replace(INVISIBLE_CHARS, '');
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
  }
  return value;
}

export async function takeSnapshot(page, { maxElements = MAX_ELEMENTS, maxText = MAX_TEXT } = {}) {
  const raw = await page.evaluate(SNAPSHOT_SCRIPT, { maxElements, maxText });
  return scrub(raw);
}

const quote = (s) => `"${String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function renderElement(el) {
  let line = `[${el.ref}] ${el.role} ${quote(el.name)}`;
  if (el.value !== null && el.value !== undefined) line += ` value=${quote(el.value)}`;
  if (el.options) line += ` options=${el.options.join('|')}`;
  if (el.checked !== null && el.checked !== undefined) {
    line += `${el.role === 'button' ? ' pressed=' : ' checked='}${el.checked}`;
  }
  if (el.near) line += ` near=${quote(el.near)}`;
  if (el.type === 'password') line += ' (password)';
  if (el.disabled) line += ' disabled';
  return line;
}

// The exact text format the model gets (PLAN.md §2).
export function renderSnapshot(snap) {
  const pct = snap.scroll.height ? Math.round((snap.scroll.y / snap.scroll.height) * 100) : 0;
  const lines = [
    `URL: ${snap.url}`,
    `TITLE: ${snap.title}`,
    `SCROLL: ${snap.scroll.y} of ${snap.scroll.height} px (${pct}%)`,
    'ELEMENTS (visible, interactive):',
    ...snap.elements.map(renderElement)
  ];
  if (snap.elements.length === 0) lines.push('(none)');
  if (snap.truncated.elements) lines.push('… more elements not shown');
  lines.push('TEXT (visible, may be cut):', snap.text || '(none)');
  return lines.join('\n');
}
