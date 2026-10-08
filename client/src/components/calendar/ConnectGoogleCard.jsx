import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';

const GIcon = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
    <path
      fill="#FFC107"
      d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5z"
    />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.1 0 9.8-2 13.3-5.2l-6.1-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z" />
    <path
      fill="#1976D2"
      d="M43.6 20.5H42V20H24v8h11.3a12.1 12.1 0 0 1-4.1 5.6l6.1 5.2C40 35 44 30 44 24c0-1.2-.1-2.4-.4-3.5z"
    />
  </svg>
);

export function ConnectGoogleCard({ onConnect }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const click = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onConnect();
    } catch (e) {
      setErr(e.message ?? 'Connect failed');
      setBusy(false);
    }
  };
  return (
    <Card className="max-w-xl mx-auto text-center">
      <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-gradient-to-br from-nexus-primary to-nexus-secondary grid place-items-center text-on-accent signal-glow">
        <CalendarDays size={28} />
      </div>
      <h2 className="font-display text-xl font-semibold text-text-primary mb-2">Connect Google Calendar</h2>
      <p className="text-sm text-text-secondary max-w-md mx-auto mb-5">
        Nexus reads upcoming events from your primary calendar so the chat can answer "what's on today" — and can create
        new events when you ask.
      </p>
      <Button onClick={click} disabled={busy} size="lg" className="mx-auto">
        <GIcon /> {busy ? 'Redirecting…' : 'Connect Google Calendar'}
      </Button>
      {err && <p className="mt-3 text-xs text-danger">{err}</p>}
      <div className="mt-6 text-left bg-surface-3 border border-surface-border rounded-lg p-4 text-xs text-text-secondary">
        <p className="font-medium text-text-primary mb-1">What you give Nexus access to</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Read events from your primary Google Calendar.</li>
          <li>Create new events on your primary calendar (only when you ask in chat or via the Calendar page).</li>
        </ul>
        <p className="mt-2">Tokens are encrypted with AES-256-GCM before storage. You can disconnect any time.</p>
      </div>
    </Card>
  );
}

export default ConnectGoogleCard;
