// "What has Nexus done for me?" — the newest action_log rows (voice and chat):
// what ran, what is waiting for your OK, what was cancelled or failed.
import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Mic, MessageSquare } from 'lucide-react';
import { actionsApi } from '../../lib/api.js';
import { actionStatusMeta } from '../../lib/actionStatus.js';
import { Badge } from '../ui/Badge.jsx';
import { LoadingSpinner } from '../shared/LoadingSpinner.jsx';

const LIMIT = 15;
const SOURCE_ICON = { voice: Mic, chat: MessageSquare };

/** One readable line per row: the gate's summary, else the tool's own message, else the tool name. */
const describe = (a) => a.summary || a.result?.message || a.tool.replaceAll('_', ' ');

export function RecentActions() {
  const [actions, setActions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true; // ignore a response that lands after leaving Settings
    actionsApi.list(LIMIT).then(
      ({ actions: rows }) => alive && setActions(rows),
      (err) => alive && setError(err.message)
    );
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="text-sm text-danger">Couldn&rsquo;t load the action log: {error}</p>;
  if (!actions) {
    return (
      <div className="grid place-items-center py-6">
        <LoadingSpinner />
      </div>
    );
  }
  if (!actions.length) {
    return <p className="text-sm text-text-secondary">Nothing yet. Actions from voice and chat will show up here.</p>;
  }

  return (
    <ul className="divide-y divide-surface-border -my-1">
      {actions.map((a) => {
        const meta = actionStatusMeta(a.status);
        const Icon = SOURCE_ICON[a.source] ?? MessageSquare;
        return (
          <li key={a.id} className="flex items-center gap-2.5 py-2">
            <Icon size={14} className="shrink-0 text-text-muted" aria-label={a.source} />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary truncate">{describe(a)}</p>
              <p className="text-xs text-text-muted truncate">
                {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                {a.utterance && <> · &ldquo;{a.utterance}&rdquo;</>}
              </p>
            </div>
            <Badge intent={meta.intent} className="shrink-0">
              {meta.label}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

export default RecentActions;
