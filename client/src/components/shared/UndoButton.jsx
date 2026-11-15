// Undo for one logged action (action chips in ⌘K and the voice panel, Settings ›
// Recent actions). The server reverses it once and says if it can't; the button then
// shows "Undone" or the reason. onUndone lets a list update its own row.
import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { undoByTap } from '../../lib/confirmations.js';
import { cn } from '../../lib/utils.js';

export function UndoButton({ actionId, onUndone, className }) {
  const [state, setState] = useState({ phase: 'idle', error: null }); // idle | working | undone | failed

  const undo = async () => {
    setState({ phase: 'working', error: null });
    try {
      const res = await undoByTap(actionId);
      if (res?.ok) {
        setState({ phase: 'undone', error: null });
        onUndone?.(actionId);
      } else setState({ phase: 'failed', error: res?.error ?? 'Could not undo that.' });
    } catch (err) {
      setState({ phase: 'failed', error: err.message || 'Could not reach Nexus.' });
    }
  };

  if (state.phase === 'undone') return <span className={cn('shrink-0 text-xs text-text-muted px-1.5', className)}>Undone</span>;
  return (
    <button
      onClick={undo}
      disabled={state.phase === 'working'}
      title={state.error ?? 'Undo this'}
      aria-label="Undo this"
      className={cn(
        'shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs hover:bg-surface-3 disabled:opacity-50',
        state.phase === 'failed' ? 'text-danger' : 'text-text-muted hover:text-text-primary',
        className
      )}
    >
      <Undo2 size={13} />
      {state.phase === 'failed' ? "Can't undo" : 'Undo'}
    </button>
  );
}

export default UndoButton;
