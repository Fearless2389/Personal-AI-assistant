import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, isSameDay, addDays, startOfDay } from 'date-fns';
import { calendarApi } from '../lib/api.js';

function dayLabel(date) {
  const today = startOfDay(new Date());
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, addDays(today, 1))) return 'Tomorrow';
  return format(date, 'EEE MMM d');
}

function groupByDay(events) {
  const groups = new Map();
  for (const e of events) {
    if (!e.start_time) continue;
    const d = startOfDay(new Date(e.start_time));
    const key = d.toISOString();
    if (!groups.has(key)) groups.set(key, { date: d, label: dayLabel(d), events: [] });
    groups.get(key).events.push(e);
  }
  return [...groups.values()].sort((a, b) => a.date - b.date);
}

export function useCalendar() {
  const [status, setStatus] = useState('unknown'); // 'connected' | 'disconnected' | 'broken' | 'unknown'
  const [lastConnectedAt, setLastConnectedAt] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const inFlight = useRef(null);

  const refresh = useCallback(async () => {
    if (inFlight.current) return inFlight.current;
    const run = (async () => {
      try {
        setError(null);
        const s = await calendarApi.status();
        setStatus(s.status);
        setLastConnectedAt(s.last_connected_at);
        if (s.connected) {
          const { events: list } = await calendarApi.list();
          setEvents(list ?? []);
        } else {
          setEvents([]);
        }
      } catch (err) {
        if (err.status === 409 && err.body?.error === 'reconnect_required') {
          setStatus('broken');
        } else if (err.status === 429) {
          setError({ kind: 'rate_limited' });
        } else {
          setError({ kind: 'unknown', message: err.message });
        }
      } finally {
        setLoading(false);
      }
    })();
    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const beginConnect = useCallback(async () => {
    const { url } = await calendarApi.beginConnect();
    window.location.href = url;
  }, []);

  const disconnect = useCallback(async () => {
    await calendarApi.disconnect();
    setStatus('disconnected');
    setEvents([]);
  }, []);

  const createEvent = useCallback(async (payload) => {
    const { event } = await calendarApi.create(payload);
    setEvents((prev) => [...prev, event].sort((a, b) => new Date(a.start_time) - new Date(b.start_time)));
    return event;
  }, []);

  const groupedEvents = useMemo(() => groupByDay(events), [events]);

  return {
    status,
    connected: status === 'connected',
    lastConnectedAt,
    events,
    groupedEvents,
    loading,
    error,
    refresh,
    beginConnect,
    disconnect,
    createEvent
  };
}

export default useCalendar;
