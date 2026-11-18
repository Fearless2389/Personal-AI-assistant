// Navigation guard for the agent's browser (PLAN.md chunk 2A, S2 + SSRF). risk.js judges the
// step the model proposes, but a harmless-looking click can still lead somewhere dangerous: a
// link, a redirect or a form post to the home router (192.168.x.x), to the Nexus server on
// localhost, or to a payment site. This guard sits under every page of the context and aborts
// those document loads, whatever triggered them. actions.js reports a block as the step's result.
import { checkNavigation, PAYMENT_HOST } from './urlPolicy.js';

/**
 * Pure: may a document at `url` load? Main-frame loads must be public http(s) (or an allowed test
 * origin) and not a payment/banking host. Sub-frames may embed payment widgets (a shop's own
 * checkout iframe, which Ruthvik may use by hand) but never private-network addresses.
 * → { ok: true } | { ok: false, reason }
 */
export function documentVerdict(url, { mainFrame = true, allowOrigins = [] } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }
  if (parsed.protocol === 'about:' || parsed.protocol === 'blob:') return { ok: true };
  if (parsed.protocol === 'data:') {
    return mainFrame ? { ok: false, reason: 'Pages made from data: links are not allowed.' } : { ok: true };
  }
  const checked = checkNavigation(url, allowOrigins);
  if (!checked.ok) return { ok: false, reason: checked.reason };
  if (mainFrame && PAYMENT_HOST.test(parsed.hostname)) {
    return { ok: false, reason: 'Payment and banking sites are off limits' };
  }
  return { ok: true };
}

const lastBlock = new WeakMap(); // page or context → { url, reason }

/** The block (if any) on this page (or its context: pop-ups have no page yet) since the last call. */
export function takeBlock(page) {
  const block = lastBlock.get(page) ?? lastBlock.get(page.context()) ?? null;
  lastBlock.delete(page);
  lastBlock.delete(page.context());
  return block;
}

// A pop-up's first navigation has no frame yet (request.frame() throws): treat it as a main frame.
function frameInfo(request) {
  try {
    const frame = request.frame();
    return { mainFrame: !frame.parentFrame(), page: frame.page() };
  } catch {
    return { mainFrame: true, page: null };
  }
}

/**
 * Install the guard on a Playwright BrowserContext. `allowOrigins` is a live Set the caller may
 * extend (the CLI allows the fixture site); everything else must pass documentVerdict.
 * Redirect hops are not routed by Playwright, so they're checked on the `request` event: the hop
 * is recorded as a block (actions.js then leaves the page and reports it).
 */
export async function installNavigationGuard(context, { allowOrigins = new Set(), onBlock = () => {} } = {}) {
  const record = (request, verdict, page) => {
    const block = { url: request.url(), reason: verdict.reason };
    lastBlock.set(page ?? context, block);
    onBlock(block);
  };
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() !== 'document') return route.continue();
    const { mainFrame, page } = frameInfo(request);
    const verdict = documentVerdict(request.url(), { mainFrame, allowOrigins: [...allowOrigins] });
    if (verdict.ok) return route.continue();
    record(request, verdict, page);
    return route.abort('blockedbyclient');
  });
  context.on('request', (request) => {
    if (request.resourceType() !== 'document' || !request.redirectedFrom()) return;
    const { mainFrame, page } = frameInfo(request);
    const verdict = documentVerdict(request.url(), { mainFrame, allowOrigins: [...allowOrigins] });
    if (!verdict.ok) record(request, verdict, page);
  });
}
