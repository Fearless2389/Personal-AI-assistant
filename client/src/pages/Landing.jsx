import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, MessagesSquare, Smartphone, Sparkles, ArrowRight, Check } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { useUser, useAuthLoading } from '../hooks/useSupabase.js';
import { NeuralField } from '../components/shared/NeuralField.jsx';

const INK = '#05070a';
const MINT = '#2dd4bf';

const FEATURES = [
  { icon: Brain, title: 'Semantic memory', body: 'Ask "what did I say about X last week?" and Nexus surfaces the exact note — by meaning, not keywords.' },
  { icon: MessagesSquare, title: 'One conversation', body: 'Capture notes, schedule tasks and events, set reminders — all by talking to a single chat.' },
  { icon: Smartphone, title: 'Installable PWA', body: 'Pin it to your phone or desktop. Dark, fast, and native-feeling.' }
];

const GoogleG = () => (
  <svg viewBox="0 0 48 48" className="w-[18px] h-[18px]" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8a12 12 0 1 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 44 24c0-1.2-.1-2.4-.4-3.5z"/>
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"/>
    <path fill="#4CAF50" d="M24 44c5.1 0 9.8-2 13.3-5.2l-6.1-5.2A12 12 0 0 1 12.7 28l-6.5 5A20 20 0 0 0 24 44z"/>
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12.1 12.1 0 0 1-4.1 5.6l6.1 5.2C40 35 44 30 44 24c0-1.2-.1-2.4-.4-3.5z"/>
  </svg>
);

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/chat` }
  });
  if (error) alert(`Sign-in failed: ${error.message}`);
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } } };
const rise = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } } };

export default function Landing() {
  const user = useUser();
  const loading = useAuthLoading();
  const navigate = useNavigate();

  useEffect(() => { if (!loading && user) navigate('/chat', { replace: true }); }, [loading, user, navigate]);

  return (
    <div className="relative min-h-dvh overflow-hidden text-text-primary" style={{ background: INK }}>
      {/* Neural field + veil */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <NeuralField className="absolute inset-0" />
        {/* soft dark backing just behind the headline for legibility, field breathes elsewhere */}
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse 55% 40% at 50% 32%, ${INK}E6 0%, ${INK}80 35%, transparent 62%)` }} />
        <div className="absolute inset-x-0 bottom-0 h-64" style={{ background: `linear-gradient(to bottom, transparent, ${INK})` }} />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[44rem] h-[26rem] rounded-full blur-[130px]" style={{ background: 'rgba(45,212,191,0.16)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 py-7 md:py-10">
        <nav className="flex items-center justify-between mb-14 md:mb-20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[10px] grid place-items-center font-display font-bold text-[#04120e] signal-glow"
                 style={{ background: `linear-gradient(135deg, ${MINT}, #7ff0d8)` }}>N</div>
            <span className="font-display text-lg font-bold tracking-tight">Nexus</span>
          </div>
          <button onClick={signInWithGoogle} className="text-sm text-text-secondary hover:text-text-primary transition-colors">Sign in</button>
        </nav>

        <motion.section variants={stagger} initial="hidden" animate="show" className="text-center mb-16 md:mb-24">
          <motion.div variants={rise} className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 mb-8"
                      style={{ borderColor: 'rgba(120,150,160,0.18)', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(8px)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: MINT, boxShadow: `0 0 8px ${MINT}` }} />
            <span className="text-[11px] uppercase tracking-[0.2em] text-text-secondary">Memory that fires like neurons</span>
          </motion.div>

          <motion.h1 variants={rise} className="font-display font-extrabold text-5xl md:text-7xl tracking-[-0.035em] leading-[0.98] max-w-[15ch] mx-auto">
            Your mind,{' '}
            <span style={{ background: `linear-gradient(120deg, ${MINT}, #38bdf8)`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>connected</span>{' '}
            and always in reach.
          </motion.h1>

          <motion.p variants={rise} className="mt-7 mx-auto max-w-xl text-base md:text-lg text-text-secondary leading-relaxed">
            Nexus links every note, task, and idea into one living memory — recall anything just by asking. One chat replaces five apps.
          </motion.p>

          <motion.div variants={rise} className="mt-9 flex flex-col sm:flex-row gap-4 items-center justify-center">
            <button onClick={signInWithGoogle} disabled={loading}
              className="inline-flex items-center gap-2.5 font-semibold text-[15px] px-6 py-3.5 rounded-xl text-[#04120e] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
              style={{ background: `linear-gradient(120deg, ${MINT}, #7ff0d8)`, boxShadow: '0 10px 34px rgba(45,212,191,0.32)' }}>
              <GoogleG /> {loading ? 'Loading…' : 'Continue with Google'}
            </button>
            <a href="https://github.com/Fearless2389/Personal-AI-assistant" target="_blank" rel="noreferrer"
               className="group inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors">
              View the code <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </a>
          </motion.div>
        </motion.section>

        {/* Product glimpse */}
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-lg mb-20 md:mb-28">
          <div className="rounded-2xl border p-4 shadow-2xl shadow-black/50"
               style={{ borderColor: 'rgba(120,150,160,0.16)', background: 'rgba(10,14,20,0.72)', backdropFilter: 'blur(14px)' }}>
            <div className="flex justify-end mb-3">
              <div className="max-w-[82%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm text-[#04120e]" style={{ background: MINT }}>
                Remind me to email Prof. Rao tomorrow 9am, and note the deadline moved to Friday.
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[86%] rounded-2xl rounded-bl-sm bg-surface-3 px-3.5 py-2.5 text-sm text-text-primary">
                Done — reminder set for tomorrow 9:00 AM, and I saved a note about the Friday deadline.
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md text-[11px] px-1.5 py-0.5" style={{ background: 'rgba(45,212,191,0.14)', color: MINT }}><Check size={11}/> reminder</span>
                  <span className="inline-flex items-center gap-1 rounded-md text-[11px] px-1.5 py-0.5" style={{ background: 'rgba(56,189,248,0.14)', color: '#38bdf8' }}><Check size={11}/> note saved</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <section className="grid md:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.45, delay: i * 0.08 }}>
              <div className="group h-full rounded-2xl border p-5 transition-all duration-200"
                   style={{ borderColor: 'rgba(120,150,160,0.14)', background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.008))' }}>
                <div className="w-11 h-11 rounded-xl grid place-items-center mb-4 transition-transform group-hover:scale-105"
                     style={{ background: 'rgba(45,212,191,0.1)', color: MINT, border: '1px solid rgba(45,212,191,0.22)' }}>
                  <f.icon size={19} />
                </div>
                <h3 className="font-display text-lg font-semibold text-text-primary mb-1.5">{f.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{f.body}</p>
              </div>
            </motion.div>
          ))}
        </section>

        <footer className="mt-16 flex items-center justify-between text-xs text-text-muted">
          <span>Built solo by Rama · Mahindra University</span>
          <span>Nexus · v1.0</span>
        </footer>
      </div>
    </div>
  );
}
