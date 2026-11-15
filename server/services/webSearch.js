// Web search for the assistant, behind one function with interchangeable providers:
//   tavily    — real web search built for AI agents (free tier, needs TAVILY_API_KEY)
//   wikipedia — keyless fallback: encyclopedic topics, companies, people
// Gemini's built-in Google Search grounding was tried first and has no free quota
// on this key (429 on every model, 2026-11-15).
// Results are third-party content: callers mark them untrusted.

const TIMEOUT_MS = 12_000;
const USER_AGENT = 'NexusAssistant/1.0 (personal use)';

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    const err = new Error(`search provider answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function tavily(query, max) {
  const data = await getJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query, max_results: max, search_depth: 'basic', include_answer: true })
  });
  return {
    provider: 'tavily',
    answer: data.answer ?? null,
    results: (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content?.slice(0, 500) ?? '' }))
  };
}

async function wikipedia(query, max) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: String(max),
    prop: 'extracts|info',
    exintro: '1',
    explaintext: '1',
    exsentences: '3',
    inprop: 'url',
    origin: '*'
  });
  const data = await getJson(`https://en.wikipedia.org/w/api.php?${params}`, { headers: { 'user-agent': USER_AGENT } });
  const pages = Object.values(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  return {
    provider: 'wikipedia',
    answer: null,
    results: pages.map((p) => ({ title: p.title, url: p.fullurl, snippet: (p.extract ?? '').slice(0, 500) }))
  };
}

/** Which providers are usable, best first. */
export function searchProviders() {
  return [process.env.TAVILY_API_KEY ? 'tavily' : null, 'wikipedia'].filter(Boolean);
}

/**
 * → { provider, answer, results: [{ title, url, snippet }], fallback_note? }
 * Tries providers in order; a failing provider (quota, outage) falls through.
 */
export async function webSearch(query, { max = 5 } = {}) {
  const q = String(query ?? '').trim();
  if (!q) throw new Error('Search query is empty.');
  const n = Math.min(Math.max(Number(max) || 5, 1), 8);
  const run = { tavily, wikipedia };
  let lastErr;
  for (const name of searchProviders()) {
    try {
      const out = await run[name](q, n);
      if (name === 'wikipedia' && !process.env.TAVILY_API_KEY) {
        out.fallback_note =
          'Only Wikipedia is available (no web search key set). Fine for background; it has no news, prices or job postings.';
      }
      return out;
    } catch (err) {
      lastErr = err;
      console.warn(`[web-search] ${name} failed:`, err.message);
    }
  }
  throw lastErr ?? new Error('No search provider is available.');
}
