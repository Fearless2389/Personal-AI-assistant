import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import { useUser, useAuthLoading } from '../hooks/useSupabase.js';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardTitle } from '../components/ui/Card.jsx';

const FEATURES = [
  { title: 'Semantic memory', body: 'Ask "what did I say about X last week?" and Nexus surfaces the exact note.' },
  { title: 'Conversational interface', body: 'Capture notes, schedule tasks, and search history — all in one chat.' },
  { title: 'PWA-installable', body: 'Pin to your phone or desktop. Works offline-friendly through service workers.' }
];

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/chat` }
  });
  if (error) {
    // eslint-disable-next-line no-alert
    alert(`Sign-in failed: ${error.message}`);
  }
}

export default function Landing() {
  const user = useUser();
  const loading = useAuthLoading();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/chat', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="min-h-dvh bg-surface-base text-text-primary">
      <div className="mx-auto max-w-5xl px-6 py-12 md:py-20">
        <header className="flex items-center justify-between mb-16">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-nexus-primary to-nexus-secondary grid place-items-center font-display font-bold text-white">
              N
            </div>
            <span className="font-display text-lg font-semibold">Nexus</span>
          </div>
          <span className="text-xs text-text-muted">Personal · v0.1 · Phase 1</span>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="text-center mb-16"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-text-muted mb-4">A second brain for one</p>
          <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight mb-5 text-balance">
            <span className="bg-gradient-to-r from-nexus-primary via-nexus-secondary to-nexus-primary bg-clip-text text-transparent">
              Everything you've thought,
            </span>
            <br className="hidden md:block" />
            <span> recalled in one chat.</span>
          </h1>
          <p className="text-text-secondary max-w-xl mx-auto mb-8">
            Replace your notes, tasks, calendar, and reminders with a single conversational AI agent that
            actually remembers what you told it.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Button size="lg" onClick={signInWithGoogle} disabled={loading}>
              {loading ? 'Loading…' : 'Sign in with Google'}
            </Button>
            <a
              href="https://github.com/"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Read the spec →
            </a>
          </div>
        </motion.section>

        <section className="grid md:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 + i * 0.08 }}
            >
              <Card className="h-full">
                <CardTitle className="mb-2">{f.title}</CardTitle>
                <p className="text-sm text-text-secondary">{f.body}</p>
              </Card>
            </motion.div>
          ))}
        </section>

        <footer className="mt-16 text-center text-xs text-text-muted">
          Built solo by Rama · Mahindra University
        </footer>
      </div>
    </div>
  );
}
