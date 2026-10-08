import { cn } from '../../lib/utils.js';

export function ChatBubble({ role, content, isStreaming }) {
  const isUser = role === 'user';
  const text = String(content ?? '');
  const showCaret = isStreaming && !isUser;

  return (
    <div className={cn('w-full flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] md:max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-nexus-primary text-on-accent rounded-br-sm'
            : 'bg-surface-3 text-text-primary border border-surface-border rounded-bl-sm',
          showCaret && 'blinking-caret'
        )}
      >
        {text || (showCaret ? '' : (isUser ? '' : 'Thinking…'))}
      </div>
    </div>
  );
}

export default ChatBubble;
