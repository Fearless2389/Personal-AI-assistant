import { create } from 'zustand';

function newSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

const STORAGE_KEY = 'nexus.chat.sessionId';

function loadSessionId() {
  if (typeof window === 'undefined') return newSessionId();
  const existing = window.sessionStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = newSessionId();
  window.sessionStorage.setItem(STORAGE_KEY, id);
  return id;
}

export const useChatStore = create((set, get) => ({
  sessionId: loadSessionId(),
  messages: [],          // [{ id, role: 'user'|'assistant', content, isStreaming? }]
  memory: [],            // last set of retrieved memories
  toolResults: [],       // [{ name, args, result, ts }]
  isStreaming: false,

  addMessage: (msg) => set((s) => ({
    messages: [...s.messages, { id: crypto.randomUUID?.() ?? String(Math.random()), ...msg }]
  })),

  appendDelta: (delta) => set((s) => {
    const msgs = s.messages.slice();
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: (last.content ?? '') + delta };
    }
    return { messages: msgs };
  }),

  finishStreaming: () => set((s) => {
    const msgs = s.messages.slice();
    const last = msgs[msgs.length - 1];
    if (last && last.isStreaming) {
      msgs[msgs.length - 1] = { ...last, isStreaming: false };
    }
    return { messages: msgs, isStreaming: false };
  }),

  setStreaming: (v) => set({ isStreaming: v }),
  setMemory: (items) => set({ memory: items ?? [] }),
  pushToolResult: (r) => set((s) => ({ toolResults: [...s.toolResults, { ...r, ts: Date.now() }] })),

  resetSession: () => {
    const id = newSessionId();
    if (typeof window !== 'undefined') window.sessionStorage.setItem(STORAGE_KEY, id);
    set({ sessionId: id, messages: [], memory: [], toolResults: [], isStreaming: false });
  }
}));
