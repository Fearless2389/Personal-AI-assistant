import { useCallback, useRef } from 'react';
import { streamChat } from '../lib/api.js';
import { useChatStore } from '../store/useChatStore.js';
import { applyToolResult } from '../lib/confirmations.js';

export function useStreamingChat() {
  const ctrlRef = useRef(null);
  const { sessionId, addMessage, appendDelta, finishStreaming, setStreaming, setMemory, pushToolResult } =
    useChatStore();

  const send = useCallback(
    async (text) => {
      if (!text || !text.trim()) return;
      addMessage({ role: 'user', content: text });
      addMessage({ role: 'assistant', content: '', isStreaming: true });
      setStreaming(true);
      setMemory([]);

      const ctrl = streamChat({
        message: text,
        sessionId,
        onChunk: (evt) => {
          if (evt.type === 'text') appendDelta(evt.delta ?? '');
          else if (evt.type === 'memory') setMemory(evt.items ?? []);
          else if (evt.type === 'tool_result') {
            pushToolResult({ name: evt.name, args: evt.args, result: evt.result });
            applyToolResult(evt.name, evt.result);
          } else if (evt.type === 'done') finishStreaming();
          else if (evt.type === 'error') {
            appendDelta(`\n\n[error] ${evt.message}`);
            finishStreaming();
          }
        }
      });
      ctrlRef.current = ctrl;

      try {
        await ctrl.promise;
      } catch (err) {
        appendDelta(`\n\n[network error] ${err.message}`);
        finishStreaming();
      }
    },
    [sessionId, addMessage, appendDelta, finishStreaming, setStreaming, setMemory, pushToolResult]
  );

  const cancel = useCallback(() => {
    ctrlRef.current?.abort();
    finishStreaming();
  }, [finishStreaming]);

  return { send, cancel };
}
