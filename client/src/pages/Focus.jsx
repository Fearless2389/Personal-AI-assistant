// Focus — Pomodoro timer with an SVG progress ring + session logging. Real (Phase 3).
import { useCallback, useEffect, useRef, useState } from 'react';
import { focusApi } from '../lib/api.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';

const PRESETS = [
  { label: 'Focus 25', minutes: 25 },
  { label: 'Deep 50', minutes: 50 },
  { label: 'Short 15', minutes: 15 }
];
const RADIUS = 130;
const CIRC = 2 * Math.PI * RADIUS;

function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc.start(); osc.stop(ctx.currentTime + 0.9);
  } catch { /* audio blocked — silent */ }
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Focus() {
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [project, setProject] = useState('');
  const [stats, setStats] = useState({ todayMinutes: 0, weekMinutes: 0, todaySessions: 0 });
  const startedAtRef = useRef(null);
  const tickRef = useRef(null);

  const loadStats = useCallback(async () => {
    try { setStats(await focusApi.stats()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const selectPreset = (m) => {
    if (running) return;
    setMinutes(m);
    setRemaining(m * 60);
  };

  const complete = useCallback(async () => {
    setRunning(false);
    chime();
    try {
      await focusApi.log({
        project_tag: project.trim() || null,
        duration_minutes: minutes,
        started_at: startedAtRef.current ?? new Date().toISOString(),
        ended_at: new Date().toISOString(),
        completed: true
      });
      loadStats();
    } catch { /* ignore log failure */ }
    setRemaining(minutes * 60);
  }, [minutes, project, loadStats]);

  useEffect(() => {
    if (!running) { clearInterval(tickRef.current); return; }
    tickRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { clearInterval(tickRef.current); complete(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, [running, complete]);

  const start = () => { startedAtRef.current = new Date().toISOString(); setRunning(true); };
  const pause = () => setRunning(false);
  const reset = () => { setRunning(false); setRemaining(minutes * 60); };

  const progress = 1 - remaining / (minutes * 60);
  const dashoffset = CIRC * (1 - progress);

  return (
    <PageWrapper>
      <h1 className="font-display text-2xl font-semibold text-text-primary mb-5">Focus</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="grid place-items-center py-10">
          <div className="relative w-[300px] h-[300px] grid place-items-center">
            <svg width="300" height="300" className="-rotate-90">
              <circle cx="150" cy="150" r={RADIUS} fill="none" stroke="var(--color-surface-3)" strokeWidth="12" />
              <circle
                cx="150" cy="150" r={RADIUS} fill="none"
                stroke="url(#focusGrad)" strokeWidth="12" strokeLinecap="round"
                strokeDasharray={CIRC} strokeDashoffset={dashoffset}
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
              <defs>
                <linearGradient id="focusGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--color-nexus-primary)" />
                  <stop offset="1" stopColor="var(--color-nexus-secondary)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute text-center">
              <div className="font-display text-5xl font-semibold text-text-primary tabular-nums">{fmt(remaining)}</div>
              <div className="text-xs text-text-muted mt-1">{running ? 'Focusing…' : 'Ready'}</div>
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            {!running
              ? <Button onClick={start} size="lg">{remaining < minutes * 60 ? 'Resume' : 'Start'}</Button>
              : <Button onClick={pause} size="lg" variant="secondary">Pause</Button>}
            <Button onClick={reset} size="lg" variant="ghost">Reset</Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Length</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.minutes}
                  onClick={() => selectPreset(p.minutes)}
                  disabled={running}
                  className={[
                    'px-3 py-1.5 rounded-lg text-sm border transition-colors disabled:opacity-40',
                    minutes === p.minutes
                      ? 'bg-nexus-primary/15 border-nexus-primary/40 text-nexus-primary'
                      : 'border-surface-border text-text-secondary hover:bg-surface-2'
                  ].join(' ')}
                >
                  {p.minutes}m
                </button>
              ))}
            </div>
            <label className="block text-sm text-text-secondary mt-4 mb-1">Project tag</label>
            <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="optional, e.g. thesis" disabled={running} />
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-wider text-text-muted mb-3">Today</p>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-semibold text-text-primary tabular-nums">{stats.todayMinutes}</span>
              <span className="text-sm text-text-secondary">min focused</span>
            </div>
            <p className="text-xs text-text-muted mt-1">{stats.todaySessions} sessions · {stats.weekMinutes} min this week</p>
          </Card>
        </div>
      </div>
    </PageWrapper>
  );
}
