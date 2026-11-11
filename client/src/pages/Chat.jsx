import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { summarizeTool } from '../lib/toolSummary.js';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../store/useChatStore.js';
import { useStreamingChat } from '../hooks/useStreamingChat.js';
import { ArrowUp } from 'lucide-react';
import { ChatBubble } from '../components/shared/ChatBubble.jsx';
import { VoiceButton } from '../components/shared/VoiceButton.jsx';
import { NeuralField } from '../components/shared/NeuralField.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { formatRelative } from '../lib/utils.js';

const SUGGESTIONS = [
  'Applied to Atlassian SWE intern off-campus, referral from Priya',
  "What's due this week?",
  'Where am I with my off-campus applications?',
  'Comp Fin midterm next Thursday 10am'
];

export default function Chat() {
  const { messages, isStreaming, memory, toolResults, resetSession } = useChatStore();
  const { send } = useStreamingChat();
  const location = useLocation();
  const navigate = useNavigate();
  // Prompts handed over from elsewhere (e.g. a nudge's "Prep plan") arrive via
  // router state: { draft, autoSend }. Non-auto drafts just pre-fill the composer.
  const [draft, setDraft] = useState(() => (location.state?.autoSend ? '' : (location.state?.draft ?? '')));
  const scrollRef = useRef(null);
  const handoffRef = useRef(null);

  // Send an auto-send handoff once, then clear router state so a refresh won't resend.
  useEffect(() => {
    const { draft: incoming, autoSend } = location.state ?? {};
    if (!incoming || handoffRef.current === location.key) return;
    handoffRef.current = location.key;
    navigate(location.pathname, { replace: true, state: null });
    if (autoSend && !isStreaming) send(incoming);
  }, [location, navigate, send, isStreaming]);

  // Auto-scroll on new content
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isStreaming) return;
    setDraft('');
    await send(text);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-[calc(100dvh-3.5rem)]">
      {/* Conversation */}
      <section className="flex-1 flex flex-col min-w-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-4">
          {messages.length === 0 ? (
            <div className="relative h-full grid place-items-center overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-70">
                <NeuralField />
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(ellipse 55% 50% at 50% 48%, transparent 26%, var(--color-surface-base) 76%)'
                  }}
                />
              </div>
              <div className="relative text-center max-w-xl px-6">
                <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-nexus-primary to-nexus-secondary grid place-items-center text-on-accent font-display font-bold text-xl signal-glow">
                  N
                </div>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
                  How can I help, Rama?
                </h2>
                <p className="text-text-secondary mb-8">
                  Capture a thought, plan your day, or ask what you told me before — I'll route it to the right place.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setDraft(s)}
                      className="text-sm text-text-secondary hover:text-text-primary border border-surface-border hover:border-nexus-primary/50 rounded-full px-3.5 py-2 bg-surface-2/70 backdrop-blur transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <ChatBubble role={m.role} content={m.content} isStreaming={m.isStreaming} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Composer */}
        <div className="px-4 md:px-8 pb-5 pt-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 rounded-2xl border border-surface-border bg-surface-2 p-2 pl-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.8)] focus-within:border-nexus-primary/40 transition-colors">
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask, capture, plan…  (Shift+Enter for newline)"
                className="flex-1 resize-none bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none py-2 max-h-40"
              />
              <VoiceButton onTranscript={(t) => setDraft((prev) => (prev ? prev + ' ' + t : t))} />
              <button
                onClick={handleSend}
                disabled={isStreaming || !draft.trim()}
                aria-label="Send message"
                className="w-10 h-10 rounded-xl grid place-items-center bg-nexus-primary text-on-accent hover:bg-nexus-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ArrowUp size={18} strokeWidth={2.5} />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted px-1">
              <span>Gemini · Semantic memory via pgvector</span>
              <button onClick={resetSession} className="hover:text-text-secondary">
                New session
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Context panel (desktop only) */}
      <aside className="hidden lg:flex flex-col w-80 border-l border-surface-border overflow-y-auto p-4 gap-4 bg-surface-1">
        <div>
          <h3 className="font-display text-sm font-semibold mb-2 text-text-secondary uppercase tracking-wider">
            Cited memories
          </h3>
          {memory.length === 0 ? (
            <p className="text-xs text-text-muted">No relevant memories surfaced yet. Send a message to retrieve.</p>
          ) : (
            <div className="space-y-2">
              {memory.map((m) => (
                <Card key={m.id} className="!p-3">
                  <div className="flex items-center justify-between mb-1">
                    <Badge intent={m.source_table === 'notes' ? 'primary' : 'info'}>{m.source_table}</Badge>
                    <span className="text-[11px] text-text-muted">sim {(m.similarity * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-xs text-text-secondary line-clamp-4">{m.content}</p>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold mb-2 text-text-secondary uppercase tracking-wider">
            Actions taken
          </h3>
          {toolResults.length === 0 ? (
            <p className="text-xs text-text-muted">Nexus will note any tools it invokes here.</p>
          ) : (
            <ul className="space-y-2">
              {toolResults
                .slice()
                .reverse()
                .slice(0, 12)
                .map((r, i) => {
                  const s = summarizeTool(r.name, r.args, r.result);
                  const Icon = s.icon;
                  return (
                    <li
                      key={`${r.ts}-${i}`}
                      className="flex items-start gap-2 rounded-xl border border-surface-border bg-surface-2 p-2.5"
                    >
                      <Icon size={14} className={`mt-0.5 shrink-0 ${s.ok ? 'text-nexus-primary' : 'text-danger'}`} />
                      <div className="min-w-0">
                        <p className="text-xs text-text-primary leading-snug">{s.text}</p>
                        <p className="text-[10px] text-text-muted mt-0.5">
                          {formatRelative(new Date(r.ts).toISOString())}
                        </p>
                      </div>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
