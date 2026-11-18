// Runs one agent step on the live page (PLAN.md T1.4). The model names elements by the numbers in
// the latest snapshot; snapshot.js put those numbers on the page as data-nexus-ref. Nothing here
// decides whether a step is allowed: risk.js classifies every step before agentLoop calls this.
// runAction never throws; it returns { ok, error?, newUrl, page } where `page` is the tab the
// task continues on (a link that opened a new tab moves the task there and closes the old one).
import { checkNavigation } from './urlPolicy.js';
import { takeBlock, documentVerdict } from './guard.js';

export { checkNavigation };

export const KEYS = ['Enter', 'Escape', 'Tab', 'PageDown', 'PageUp'];
const ACTION_TIMEOUT_MS = 5000;
const NAV_TIMEOUT_MS = 20000;
const SETTLE_MS = 400;
const SCROLL_PX = 700;

// Playwright errors carry multi-line call logs; the model needs one short line.
function shortError(err) {
  const first = String(err?.message ?? err).split('\n')[0].replace(/^\w+\.\w+: /, '');
  return first.length > 200 ? `${first.slice(0, 199)}…` : first;
}

function refLocator(page, ref) {
  return page.locator(`[data-nexus-ref="${Number(ref)}"]`);
}

async function perform(page, action, allowOrigins) {
  switch (action.type) {
    case 'click':
    case 'type':
    case 'select': {
      const target = refLocator(page, action.ref);
      if ((await target.count()) === 0) {
        return { ok: false, error: `ref ${action.ref} is not on the page any more. Look at the new snapshot.` };
      }
      if (action.type === 'click') {
        await target.click({ timeout: ACTION_TIMEOUT_MS });
      } else if (action.type === 'type') {
        try {
          await target.fill(String(action.text ?? ''), { timeout: ACTION_TIMEOUT_MS });
        } catch (err) {
          if (/Malformed value/i.test(err.message)) {
            return { ok: false, error: 'That field wants a specific format (dates are YYYY-MM-DD, times HH:MM).' };
          }
          throw err;
        }
        if (action.submit) await target.press('Enter', { timeout: ACTION_TIMEOUT_MS });
      } else {
        const option = String(action.option ?? '');
        try {
          await target.selectOption({ label: option }, { timeout: ACTION_TIMEOUT_MS });
        } catch {
          await target.selectOption({ value: option }, { timeout: ACTION_TIMEOUT_MS });
        }
      }
      return { ok: true };
    }
    case 'press':
      if (!KEYS.includes(action.key)) return { ok: false, error: `Key must be one of ${KEYS.join(', ')}.` };
      await page.keyboard.press(action.key);
      return { ok: true };
    case 'scroll': {
      const size = page.viewportSize() ?? { width: 1280, height: 800 };
      await page.mouse.move(size.width / 2, size.height / 2);
      await page.mouse.wheel(0, action.direction === 'up' ? -SCROLL_PX : SCROLL_PX);
      return { ok: true };
    }
    case 'navigate': {
      const checked = checkNavigation(action.url, allowOrigins);
      if (!checked.ok) return { ok: false, error: checked.reason };
      await page.goto(checked.url.href, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      return { ok: true };
    }
    case 'back': {
      const res = await page.goBack({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      return res ? { ok: true } : { ok: false, error: 'There is no previous page in this tab.' };
    }
    case 'wait': {
      const seconds = Math.min(5, Math.max(1, Number(action.seconds) || 1));
      await page.waitForTimeout(seconds * 1000);
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown action "${action.type}".` };
  }
}

export async function runAction(page, action, { allowOrigins = [] } = {}) {
  // A click can open a new tab: listen before acting, give it a second to appear.
  const popup = page
    .context()
    .waitForEvent('page', { timeout: 1000 })
    .catch(() => null);
  takeBlock(page); // forget blocks from before this step
  const before = page.url();
  let result;
  try {
    result = await perform(page, action, allowOrigins);
  } catch (err) {
    result = { ok: false, error: shortError(err) };
  }

  let current = page;
  const opened = await popup;
  if (opened) await opened.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(SETTLE_MS).catch(() => {}); // a click's navigation request lands a moment later
  // The navigation guard refused a page this step tried to load (guard.js), here or in a new tab.
  let block = takeBlock(page) ?? (opened ? takeBlock(opened) : null);
  // Redirect hops aren't routed (Playwright), so a redirect can still land somewhere forbidden:
  // the request went out, but the agent leaves at once and never acts there (risk.js refuses too).
  if (!block && !page.isClosed() && /^https?:/.test(page.url())) {
    const verdict = documentVerdict(page.url(), { allowOrigins });
    if (!verdict.ok) block = { url: page.url(), reason: verdict.reason };
  }
  if (block) {
    result = { ok: false, error: `blocked: ${block.reason} (${block.url.slice(0, 80)})` };
    // An aborted load leaves Chrome's error page; go back to where the step started.
    if (!page.isClosed() && page.url() !== before && /^https?:/.test(before)) {
      await page.goto(before, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS }).catch(() => {});
    }
  }

  if (opened && result.ok) {
    await page.close().catch(() => {});
    current = opened;
  } else if (opened) {
    await opened.close().catch(() => {}); // blocked or failed: stay on the original tab
  }
  if (current !== page && !current.isClosed()) {
    await current.waitForTimeout(SETTLE_MS).catch(() => {});
  }
  return { ...result, newUrl: current.isClosed() ? null : current.url(), page: current };
}
