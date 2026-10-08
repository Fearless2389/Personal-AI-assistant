import { format } from 'date-fns';
import { MapPin } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Badge } from '../ui/Badge.jsx';

function timeRange(event) {
  if (event.all_day) return 'All day';
  if (!event.start_time) return '';
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : null;
  const startStr = format(start, 'h:mm a');
  if (!end) return startStr;
  return `${startStr} – ${format(end, 'h:mm a')}`;
}

function EventRow({ event }) {
  return (
    <div className="flex gap-3 py-3 border-b border-surface-border last:border-b-0">
      <div className="shrink-0 w-24 text-xs font-mono text-text-secondary pt-0.5">{timeRange(event)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <h4 className="font-medium text-sm text-text-primary truncate">{event.title}</h4>
          {event.all_day && <Badge intent="neutral">all day</Badge>}
        </div>
        {event.location && (
          <p className="text-xs text-text-secondary truncate flex items-center gap-1">
            <MapPin size={11} /> {event.location}
          </p>
        )}
        {event.description && <p className="text-xs text-text-muted truncate mt-0.5">{event.description}</p>}
        {event.html_link && (
          <a
            href={event.html_link}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-nexus-primary hover:underline mt-1 inline-block"
          >
            Open in Google →
          </a>
        )}
      </div>
    </div>
  );
}

export function AgendaList({ groupedEvents }) {
  if (!groupedEvents?.length) return null;
  return (
    <div className="space-y-4">
      {groupedEvents.map((g) => (
        <Card key={g.date.toISOString()}>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="font-display text-base font-semibold text-text-primary">{g.label}</h3>
            <span className="text-xs text-text-muted font-mono">{format(g.date, 'EEEE, MMM d')}</span>
          </div>
          <div>
            {g.events.map((e) => (
              <EventRow key={e.google_event_id} event={e} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default AgendaList;
