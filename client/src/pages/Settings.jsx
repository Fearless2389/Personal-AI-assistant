// Settings — persona, phone/SMS, wake time, Google Calendar connection, recent actions log.
import { useCallback, useEffect, useState } from 'react';
import { settingsApi, calendarApi } from '../lib/api.js';
import { Card, CardTitle } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Input } from '../components/ui/Input.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { RecentActions } from '../components/settings/RecentActions.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';
import { useUser } from '../hooks/useSupabase.js';
import { supabase } from '../lib/supabase.js';

function Section({ title, description, children }) {
  return (
    <Card className="mb-4">
      <CardTitle>{title}</CardTitle>
      {description && <p className="text-sm text-text-secondary mt-0.5 mb-3">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </Card>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="mb-3">
      <label className="block text-sm text-text-secondary mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const user = useUser();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [calStatus, setCalStatus] = useState('unknown');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ settings: s }, cal] = await Promise.all([settingsApi.get(), calendarApi.status()]);
      setSettings(s);
      setCalStatus(cal.status);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const { settings: s } = await settingsApi.update({
        persona_name: settings.persona_name,
        persona_style: settings.persona_style,
        phone_number: settings.phone_number || null,
        sms_opt_in: settings.sms_opt_in,
        wake_up_time: settings.wake_up_time
      });
      setSettings(s);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const connectCal = async () => {
    const { url } = await calendarApi.beginConnect();
    window.location.href = url;
  };
  const disconnectCal = async () => {
    await calendarApi.disconnect();
    setCalStatus('disconnected');
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <PageWrapper>
        <Card>
          <div className="grid place-items-center py-16">
            <LoadingSpinner />
          </div>
        </Card>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl font-semibold text-text-primary">Settings</h1>
        <div className="flex items-center gap-2">
          {saved && <Badge intent="success">Saved</Badge>}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Badge intent="danger">{error}</Badge>
        </div>
      )}

      <Section title="Account">
        <p className="text-sm text-text-secondary">
          Signed in as <span className="text-text-primary">{user?.email}</span>
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={signOut}>
          Sign out
        </Button>
      </Section>

      <Section title="Assistant persona" description="How Nexus talks to you in chat.">
        <Field label="Assistant name">
          <Input
            value={settings?.persona_name ?? ''}
            onChange={(e) => set({ persona_name: e.target.value })}
            placeholder="Nexus"
          />
        </Field>
        <Field label="Style">
          <Input
            as="select"
            value={settings?.persona_style ?? 'friendly'}
            onChange={(e) => set({ persona_style: e.target.value })}
          >
            <option value="friendly">Friendly</option>
            <option value="concise">Concise</option>
            <option value="formal">Formal</option>
          </Input>
        </Field>
      </Section>

      <Section title="Google Calendar" description="Read and create events from chat and the Calendar page.">
        <div className="flex items-center justify-between">
          <Badge intent={calStatus === 'connected' ? 'success' : calStatus === 'broken' ? 'danger' : 'neutral'}>
            {calStatus === 'connected' ? 'Connected' : calStatus === 'broken' ? 'Reconnect needed' : 'Not connected'}
          </Badge>
          {calStatus === 'connected' ? (
            <Button size="sm" variant="ghost" onClick={disconnectCal}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={connectCal}>
              Connect Google Calendar
            </Button>
          )}
        </div>
      </Section>

      <Section
        title="SMS reminders"
        description="Nexus can text you reminders. Requires Twilio configured on the server."
      >
        <Field label="Phone number" hint="Include country code, e.g. +91XXXXXXXXXX">
          <Input
            value={settings?.phone_number ?? ''}
            onChange={(e) => set({ phone_number: e.target.value })}
            placeholder="+91…"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={!!settings?.sms_opt_in}
            onChange={(e) => set({ sms_opt_in: e.target.checked })}
            className="accent-nexus-primary w-4 h-4"
          />
          Allow Nexus to send me SMS reminders
        </label>
      </Section>

      <Section title="Daily rhythm" description="Used to time your morning briefing (future).">
        <Field label="Wake-up time">
          <Input
            type="time"
            value={(settings?.wake_up_time ?? '08:00').slice(0, 5)}
            onChange={(e) => set({ wake_up_time: e.target.value })}
            className="max-w-[160px]"
          />
        </Field>
      </Section>

      <Section
        title="Recent actions"
        description="What Nexus did for you from voice and chat. Calendar events and SMS reminders wait for your OK first."
      >
        <RecentActions />
      </Section>
    </PageWrapper>
  );
}
