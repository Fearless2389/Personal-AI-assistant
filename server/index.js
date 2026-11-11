import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { requestId } from './middleware/requestId.js';
import { startScheduler } from './services/scheduler.js';
import chatRouter from './routes/chat.js';
import notesRouter from './routes/notes.js';
import tasksRouter from './routes/tasks.js';
import dashboardRouter from './routes/dashboard.js';
import calendarRouter from './routes/calendar.js';
import habitsRouter from './routes/habits.js';
import goalsRouter from './routes/goals.js';
import focusRouter from './routes/focus.js';
import reviewRouter from './routes/review.js';
import remindersRouter from './routes/reminders.js';
import webhooksRouter from './routes/webhooks.js';
import analyticsRouter from './routes/analytics.js';
import settingsRouter from './routes/settings.js';
import applicationsRouter from './routes/applications.js';
import agendaRouter from './routes/agenda.js';
import nudgesRouter from './routes/nudges.js';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

app.use(requestId);
app.use(
  cors({
    origin: CLIENT_ORIGIN,
    credentials: true,
    exposedHeaders: ['Content-Type', 'X-Request-Id']
  })
);
app.use(express.json({ limit: '1mb' }));

// Healthcheck — no auth, used by Render and curl smoke tests
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), service: 'nexus-server' });
});

// Mount routes
app.use('/api/chat', chatRouter);
app.use('/api/notes', notesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/habits', habitsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api/focus', focusRouter);
app.use('/api/review', reviewRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/agenda', agendaRouter);
app.use('/api/nudges', nudgesRouter);

// 404 for unmatched /api/*
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[server] error:', err.stack || err);
  res.status(err.status ?? 500).json({ error: err.message ?? 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`[nexus-server] listening on http://localhost:${PORT}`);
  console.log(`[nexus-server] CORS origin: ${CLIENT_ORIGIN}`);
  startScheduler(); // SMS reminder poller (no-op until Twilio is configured)
});
