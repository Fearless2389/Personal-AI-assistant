// A slim "say or type" row under a page title: real example commands for that page.
// Clicking one opens ⌘K with it filled in (edit, then Enter); the mic icon is a
// reminder that the same words work by voice. × hides the row on this page, per
// device (a convenience only — it renders fine if storage is unavailable).
import { useState } from 'react';
import { Mic, X } from 'lucide-react';
import { COMMAND_EXAMPLES } from '../../lib/commandExamples.js';
import { useCommandBar } from '../../store/useCommandBar.js';
import { cn } from '../../lib/utils.js';

const storageKey = (page) => `nexus.tryCommands.hidden.${page}`;

function readHidden(page) {
  try {
    return localStorage.getItem(storageKey(page)) === '1';
  } catch {
    return false;
  }
}

export function TryCommands({ page, className }) {
  const examples = COMMAND_EXAMPLES[page];
  const openCapture = useCommandBar((s) => s.show);
  const [hidden, setHidden] = useState(() => readHidden(page));
  if (!examples?.length || hidden) return null;

  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(storageKey(page), '1');
    } catch {
      /* storage unavailable: hidden for this visit only */
    }
  };

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-surface-border bg-surface-2/50 px-3 py-2 text-sm',
        className
      )}
    >
      <Mic size={14} className="mt-0.5 shrink-0 text-nexus-primary" aria-hidden />
      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1 leading-relaxed">
        <span className="text-text-muted">Say or type:</span>
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => openCapture(ex)}
            className="text-text-secondary hover:text-nexus-primary underline-offset-2 hover:underline text-left"
          >
            &ldquo;{ex}&rdquo;
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={hide}
        aria-label="Hide these examples"
        className="shrink-0 text-text-muted hover:text-text-secondary p-0.5"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default TryCommands;
