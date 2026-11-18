// Runs one agent step on the live page (PLAN.md T1.4). The model names elements by the numbers in
// the latest snapshot; snapshot.js put those numbers on the page as data-nexus-ref. Nothing here
// decides whether a step is allowed: risk.js classifies every step before agentLoop calls this.
// runAction never throws; it returns { ok, error?, newUrl, page } where `page` is the tab the
// task continues on (a link that opened a new tab moves the task there and closes the old one).
import { checkUrl } from '../webFetch.js';

export const KEYS = ['Enter', 'Escape', 'Tab', 'PageDown', 'PageUp'];
const ACTION_TIMEOUT_MS = 5000;
const NAV_TIMEOUT_MS = 20000;
const SETTLE_MS = 400;
const SCROLL_PX = 700;

/**
 * May the agent go to this URL by typing it? Public http(s) only (the same SSRF guard as
 * read_webpage), except origins explicitly allowed for the run (the local fixture site in tests,
 * evals and the CLI). Pure; also used by risk.js.
 */
export function checkNavigation(raw, allowOrigins = []) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }
  if (allowOrigins.includes(url.origin)) return { ok: true, url };
  const checked = checkUrl(url.href);
  if (!checked.ok) return { ok: false, reason: checked.reason.replace('can be read', 'can be opened') };
  return checked;
}

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
  let result;
  try {
    result = await perform(page, action, allowOrigins);
  } catch (err) {
    result = { ok: false, error: shortError(err) };
  }

  let current = page;
  const opened = await popup;
  if (opened && result.ok) {
    await opened.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await page.close().catch(() => {});
    current = opened;
  } else if (opened) {
    await opened.close().catch(() => {});
  }
  if (!current.isClosed()) {
    await current.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
    await current.waitForTimeout(SETTLE_MS).catch(() => {});
  }
  return { ...result, newUrl: current.isClosed() ? null : current.url(), page: current };
}
