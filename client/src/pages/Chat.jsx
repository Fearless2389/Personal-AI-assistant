import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../store/useChatStore.js';
import { useStreamingChat } from '../hooks/useStreamingChat.js';
import { ChatBubble } from '../components/shared/ChatBubble.jsx';
import { VoiceButton } from '../components/shared/VoiceButton.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardTitle } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Input } from '../components/ui/Input.jsx';
import { formatRelative } from '../lib/utils.js';

export default function Chat() {
  const { messages, isStreaming, memory, toolResults, resetSession } = useChatStore();
  const { send } = useStreamingChat();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);

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
            <div className="h-full grid place-items-center">
              <div className="text-center max-w-md">
                <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-nexus-primary to-nexus-secondary grid place-items-center text-white font-display font-bold text-lg">
                  N
                </div>
                <h2 className="font-display text-xl font-semibold mb-2">How can I help, Rama?</h2>
                <p className="text-sm text-text-secondary">
                  Try: <em>"Save a note about my Comp Finance midterm next Thursday."</em>
                </p>
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
        <div className="border-t border-surface-border bg-surface-base px-4 md:px-8 py-4">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <Input
              as="textarea"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask, capture, plan… (Shift+Enter for newline)"
              className="max-h-40"
            />
            <VoiceButton onTranscript={(t) => setDraft((prev) => (prev ? prev + ' ' + t : t))} />
            <Button onClick={handleSend} disabled={isStreaming || !draft.trim()}>
              {isStreaming ? '…' : 'Send'}
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between max-w-3xl mx-auto text-[11px] text-text-muted">
            <span>Powered by Gemini 2.0 Flash · Semantic memory via pgvector</span>
            <button onClick={resetSession} className="hover:text-text-secondary">
              New session
            </button>
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
                    <Badge intent={m.source_table === 'notes' ? 'primary' : 'info'}>
                      {m.source_table}
                    </Badge>
                    <span className="text-[11px] text-text-muted">
                      sim {(m.similarity * 100).toFixed(0)}%
                    </span>
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
            <div className="space-y-2">
              {toolResults.slice().reverse().slice(0, 12).map((r, i) => (
                <Card key={i} className="!p-3">
                  <div className="flex items-center justify-between mb-1">
                    <CardTitle className="!text-sm">{r.name}</CardTitle>
                    <span className="text-[11px] text-text-muted">{formatRelative(new Date(r.ts).toISOString())}</span>
                  </div>
                  <pre className="text-[11px] text-text-secondary whitespace-pre-wrap font-mono leading-snug">
                    {JSON.stringify(r.result, null, 2)}
                  </pre>
                </Card>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
