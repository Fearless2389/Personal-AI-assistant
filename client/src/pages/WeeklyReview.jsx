// Weekly Review — AI-generated recap of the week. Real (Phase 4).
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { reviewApi } from '../lib/api.js';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';
import { formatDate } from '../lib/utils.js';

// Minimal markdown renderer for our generated format (#, ##, **bold**, - lists).
function inline(text, keyBase) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${keyBase}-${i}`} className="text-text-primary font-semibold">{p.slice(2, -2)}</strong>
      : <span key={`${keyBase}-${i}`}>{p}</span>
  );
}

function MiniMarkdown({ md }) {
  const lines = (md ?? '').split('\n');
  const blocks = [];
  let list = [];
  const flush = (key) => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${key}`} className="list-disc pl-5 space-y-1 text-sm text-text-secondary my-2">
          {list.map((li, i) => <li key={i}>{inline(li, `li-${key}-${i}`)}</li>)}
        </ul>
      );
      list = [];
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.startsWith('# ')) { flush(idx); blocks.push(<h1 key={idx} className="font-display text-xl font-semibold text-text-primary mt-1 mb-2">{inline(line.slice(2), idx)}</h1>); }
    else if (line.startsWith('## ')) { flush(idx); blocks.push(<h2 key={idx} className="font-display text-base font-semibold text-text-primary mt-4 mb-1">{inline(line.slice(3), idx)}</h2>); }
    else if (/^\d+\.\s/.test(line)) { list.push(line.replace(/^\d+\.\s/, '')); }
    else if (line.startsWith('- ')) { list.push(line.slice(2)); }
    else if (line.trim() === '') { flush(idx); }
    else { flush(idx); blocks.push(<p key={idx} className="text-sm text-text-secondary my-1.5">{inline(line, idx)}</p>); }
  });
  flush('end');
  return <div>{blocks}</div>;
}

export default function WeeklyReview() {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  const loadLatest = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { review: r } = await reviewApi.latest();
      setReview(r);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLatest(); }, [loadLatest]);

  const generate = async () => {
    setGenerating(true); setError(null);
    try {
      const payload = await reviewApi.generate();
      setReview({ content_md: payload.markdown, week_start: payload.weekStart, generated_at: payload.generatedAt });
    } catch (err) { setError(err.message); }
    finally { setGenerating(false); }
  };

  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Weekly Review</h1>
          {review?.generated_at && (
            <p className="text-sm text-text-secondary mt-0.5">Generated {formatDate(review.generated_at, 'MMM d, h:mm a')}</p>
          )}
        </div>
        <Button size="sm" onClick={generate} disabled={generating}>
          {generating ? <LoadingSpinner /> : review ? 'Regenerate' : 'Generate review'}
        </Button>
      </div>

      {error && <div className="mb-4"><Badge intent="danger">{error}</Badge></div>}

      {loading ? (
        <Card><div className="grid place-items-center py-12"><LoadingSpinner /></div></Card>
      ) : !review ? (
        <Card>
          <EmptyState
            icon="✎"
            title="No review yet"
            description="Generate an AI recap of your week — completed tasks, focus time, habit streaks, and priorities for next week."
            action={<Button size="sm" onClick={generate} disabled={generating}>{generating ? 'Generating…' : 'Generate this week\'s review'}</Button>}
          />
        </Card>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
          <Card>
            <MiniMarkdown md={review.content_md} />
          </Card>
        </motion.div>
      )}
    </PageWrapper>
  );
}
