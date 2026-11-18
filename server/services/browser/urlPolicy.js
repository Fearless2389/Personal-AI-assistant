// Where the agent's browser may go. Pure, shared by actions.js (navigate), risk.js (classify) and
// guard.js (every document load).
import { checkUrl } from '../webFetch.js';

export const PAYMENT_HOST =
  /(^|\.)(paypal\.com|razorpay\.com|paytm\.com|phonepe\.com|stripe\.com|billdesk\.com|ccavenue\.com|payu\.in|cashfree\.com)$|bank|netbanking/i;

/**
 * May the agent go to this URL? Public http(s) only (the same SSRF guard as read_webpage), except
 * origins explicitly allowed for the run (the local fixture site in tests, evals and the CLI).
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
