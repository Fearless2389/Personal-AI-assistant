import { Button } from '../ui/Button.jsx';

const COPY = {
  reconnect: {
    title: 'Google connection expired',
    body: 'We can\'t talk to your calendar anymore. Reconnect to bring it back.',
    cta: 'Reconnect',
    intent: 'danger'
  },
  rate_limited: {
    title: 'Calendar API rate-limited',
    body: 'Google is throttling us. The page will retry on its own in a moment.',
    cta: null,
    intent: 'warning'
  },
  unknown: {
    title: 'Calendar error',
    body: 'Something went wrong fetching events.',
    cta: 'Retry',
    intent: 'warning'
  }
};

const RING = {
  danger: 'border-danger/40 bg-danger/10',
  warning: 'border-warning/40 bg-warning/10'
};

export function CalendarErrorBanner({ kind = 'unknown', onAction }) {
  const c = COPY[kind] ?? COPY.unknown;
  return (
    <div className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${RING[c.intent]}`}>
      <div className="flex-1">
        <p className="text-sm font-medium text-text-primary">{c.title}</p>
        <p className="text-xs text-text-secondary mt-0.5">{c.body}</p>
      </div>
      {c.cta && onAction && (
        <Button size="sm" variant="outline" onClick={onAction} className="shrink-0">
          {c.cta}
        </Button>
      )}
    </div>
  );
}

export default CalendarErrorBanner;
