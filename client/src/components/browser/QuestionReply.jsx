// Answer the question a browser task asked ("You're not signed in to amazon.in…"): free text, or a
// quick reply for the questions the agent itself asks. Used by TaskCard and the AgentStrip.
import { useState } from 'react';
import { Button } from '../ui/Button.jsx';
import { answerTask, quickReplies } from '../../lib/browserTasks.js';

export function QuestionReply({ taskId, question, autoFocus = false }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async (reply) => {
    const value = reply.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await answerTask(taskId, value);
      setText('');
    } catch (err) {
      setError(err.message || 'Could not reach Nexus.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type an answer…"
          aria-label="Answer the browser agent"
          autoFocus={autoFocus}
          maxLength={1000}
          className="h-8 flex-1 min-w-[10rem] rounded-md border border-surface-border bg-surface-2 px-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-nexus-primary/50"
        />
        <Button size="sm" type="submit" disabled={busy || !text.trim()}>
          Send
        </Button>
        {quickReplies(question).map((r) => (
          <Button key={r} size="sm" variant="outline" disabled={busy} onClick={() => send(r)}>
            {r}
          </Button>
        ))}
      </form>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default QuestionReply;
