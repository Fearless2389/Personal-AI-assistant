import { supabase } from './supabase.js';

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function request(path, { method = 'GET', body, query, headers: extraHeaders } = {}) {
  const headers = { ...(await authHeaders()), ...(extraHeaders ?? {}) };
  let url = `${BASE}${path}`;
  if (query && typeof query === 'object') {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error || `${method} ${path} → ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

export const notesApi = {
  list: () => request('/api/notes'),
  search: (q) => request('/api/notes', { query: { q } }),
  byTag: (tag) => request('/api/notes', { query: { tag } }),
  get: (id) => request(`/api/notes/${id}`),
  create: (payload) => request('/api/notes', { method: 'POST', body: payload }),
  update: (id, patch) => request(`/api/notes/${id}`, { method: 'PATCH', body: patch }),
  remove: (id) => request(`/api/notes/${id}`, { method: 'DELETE' })
};

export const tasksApi = {
  list: (filters = {}) => request('/api/tasks', { query: filters }),
  get: (id) => request(`/api/tasks/${id}`),
  create: (payload) => request('/api/tasks', { method: 'POST', body: payload }),
  update: (id, patch) => request(`/api/tasks/${id}`, { method: 'PATCH', body: patch }),
  remove: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' })
};

function randomIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const dashboardApi = {
  get: ({ refresh = false } = {}) =>
    request('/api/dashboard', { query: refresh ? { refresh: 1 } : undefined })
};

export const habitsApi = {
  list: () => request('/api/habits'),
  create: (payload) => request('/api/habits', { method: 'POST', body: payload }),
  update: (id, patch) => request(`/api/habits/${id}`, { method: 'PATCH', body: patch }),
  remove: (id) => request(`/api/habits/${id}`, { method: 'DELETE' }),
  checkin: (id) => request(`/api/habits/${id}/checkin`, { method: 'POST' }),
  uncheckin: (id) => request(`/api/habits/${id}/checkin`, { method: 'DELETE' })
};

export const goalsApi = {
  list: () => request('/api/goals'),
  create: (payload) => request('/api/goals', { method: 'POST', body: payload }),
  update: (id, patch) => request(`/api/goals/${id}`, { method: 'PATCH', body: patch }),
  remove: (id) => request(`/api/goals/${id}`, { method: 'DELETE' }),
  addMilestone: (goalId, payload) => request(`/api/goals/${goalId}/milestones`, { method: 'POST', body: payload }),
  updateMilestone: (goalId, id, patch) => request(`/api/goals/${goalId}/milestones/${id}`, { method: 'PATCH', body: patch }),
  removeMilestone: (goalId, id) => request(`/api/goals/${goalId}/milestones/${id}`, { method: 'DELETE' })
};

export const focusApi = {
  log: (payload) => request('/api/focus', { method: 'POST', body: payload }),
  list: () => request('/api/focus'),
  stats: () => request('/api/focus/stats')
};

export const reviewApi = {
  latest: () => request('/api/review'),
  generate: () => request('/api/review/generate', { method: 'POST' })
};

export const analyticsApi = {
  get: () => request('/api/analytics')
};

export const settingsApi = {
  get: () => request('/api/settings'),
  update: (patch) => request('/api/settings', { method: 'PATCH', body: patch })
};

export const remindersApi = {
  list: () => request('/api/reminders'),
  create: (payload) => request('/api/reminders', { method: 'POST', body: payload }),
  cancel: (id) => request(`/api/reminders/${id}`, { method: 'DELETE' })
};

export const calendarApi = {
  status: () => request('/api/calendar/status'),
  beginConnect: () => request('/api/calendar/connect'),
  disconnect: () => request('/api/calendar/disconnect', { method: 'POST' }),
  list: ({ timeMin, timeMax } = {}) =>
    request('/api/calendar/events', { query: { timeMin, timeMax } }),
  create: (payload) => request('/api/calendar/events', {
    method: 'POST',
    body: payload,
    headers: { 'X-Idempotency-Key': randomIdempotencyKey() }
  })
};

/**
 * Stream a chat response. `onChunk` is called with each parsed SSE event:
 *   { type: 'text', delta }
 *   { type: 'tool_result', name, args, result }
 *   { type: 'memory', items }
 *   { type: 'done' }
 *   { type: 'error', message }
 *
 * Returns a controller with `.abort()`.
 */
export function streamChat({ message, sessionId, onChunk, signal }) {
  const controller = new AbortController();
  const composedSignal = signal
    ? composeSignals(signal, controller.signal)
    : controller.signal;

  const promise = (async () => {
    const headers = await authHeaders();
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { ...headers, Accept: 'text/event-stream' },
      body: JSON.stringify({ message, sessionId }),
      signal: composedSignal
    });
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error || `chat stream failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const obj = JSON.parse(payload);
          onChunk?.(obj);
          if (obj.type === 'done') return;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[stream] bad chunk:', payload, err);
        }
      }
    }
  })();

  return { promise, abort: () => controller.abort() };
}

function composeSignals(a, b) {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (a.aborted || b.aborted) ctl.abort();
  else {
    a.addEventListener('abort', onAbort, { once: true });
    b.addEventListener('abort', onAbort, { once: true });
  }
  return ctl.signal;
}
