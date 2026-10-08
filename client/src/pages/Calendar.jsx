import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { ConnectGoogleCard } from '../components/calendar/ConnectGoogleCard.jsx';
import { AgendaList } from '../components/calendar/AgendaList.jsx';
import { CalendarErrorBanner } from '../components/calendar/CalendarErrorBanner.jsx';
import { useCalendar } from '../hooks/useCalendar.js';

const ERROR_LABELS = {
  missing_state: 'Sign-in state expired. Try again.',
  state_invalid: 'Sign-in state is invalid.',
  missing_code: 'Google did not return a consent code.',
  exchange_failed: 'Token exchange with Google failed.'
};

export default function Calendar() {
  const { status, loading, groupedEvents, error, beginConnect, disconnect, refresh } = useCalendar();
  const location = useLocation();
  const navigate = useNavigate();
  const [flash, setFlash] = useState(null);

  // Handle ?connected=1 and ?error=... once on mount.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('connected')) {
      setFlash({ kind: 'success', text: 'Connected to Google Calendar.' });
      navigate('/calendar', { replace: true });
      refresh();
    } else if (params.has('error')) {
      const code = params.get('error');
      setFlash({ kind: 'error', text: ERROR_LABELS[code] ?? `Couldn't connect: ${code}` });
      navigate('/calendar', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageWrapper>
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Calendar</h1>
          <p className="text-sm text-text-secondary mt-0.5">Next 14 days from your primary Google Calendar.</p>
        </div>
        {status === 'connected' && (
          <Button size="sm" variant="ghost" onClick={disconnect}>
            Disconnect
          </Button>
        )}
      </div>

      {flash && (
        <div className="mb-4">
          <Badge intent={flash.kind === 'success' ? 'success' : 'danger'}>{flash.text}</Badge>
        </div>
      )}

      {loading && (
        <Card>
          <div className="grid place-items-center py-12">
            <LoadingSpinner />
          </div>
        </Card>
      )}

      {!loading && status === 'disconnected' && <ConnectGoogleCard onConnect={beginConnect} />}

      {!loading && status === 'broken' && (
        <div className="space-y-4">
          <CalendarErrorBanner kind="reconnect" onAction={beginConnect} />
          {groupedEvents.length > 0 && <AgendaList groupedEvents={groupedEvents} />}
        </div>
      )}

      {!loading && status === 'connected' && (
        <div className="space-y-4">
          {error?.kind === 'rate_limited' && <CalendarErrorBanner kind="rate_limited" />}
          {error?.kind === 'unknown' && <CalendarErrorBanner kind="unknown" onAction={refresh} />}
          {groupedEvents.length === 0 ? (
            <Card>
              <EmptyState
                icon="◰"
                title="No events in the next 14 days"
                description="Free as a bird. Ask Nexus in chat to add one."
              />
            </Card>
          ) : (
            <AgendaList groupedEvents={groupedEvents} />
          )}
        </div>
      )}
    </PageWrapper>
  );
}
