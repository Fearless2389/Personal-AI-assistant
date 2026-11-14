import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { notesApi } from '../lib/api.js';
import { useNotesStore } from '../store/useNotesStore.js';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Input } from '../components/ui/Input.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';
import { formatRelative } from '../lib/utils.js';
import { useRefreshKey } from '../store/useRefreshStore.js';

export default function Notes() {
  const { notes, activeNoteId, semantic, loading, setNotes, setActive, upsert, remove, setLoading } = useNotesStore();
  const [query, setQuery] = useState('');
  const debounceRef = useRef(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notesApi.list();
      setNotes(res.notes ?? [], { semantic: false });
      if (!activeNoteId && res.notes?.[0]) setActive(res.notes[0].id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[notes] load failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [setNotes, setLoading, setActive, activeNoteId]);

  // Refetch when voice, chat or ⌘K changes notes behind this page's back.
  const refreshKey = useRefreshKey('notes');
  useEffect(() => {
    loadAll();
  }, [loadAll, refreshKey]);

  // Debounced semantic search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      // Restore default list when query clears (but only if we're currently showing semantic)
      if (semantic) loadAll();
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await notesApi.search(q);
        setNotes(res.notes ?? [], { semantic: true });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[notes] search failed:', err.message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const createNew = async () => {
    try {
      const res = await notesApi.create({ title: 'Untitled', content: '', tags: [] });
      upsert(res.note);
      setActive(res.note.id);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Create failed: ${err.message}`);
    }
  };

  const active = notes.find((n) => n.id === activeNoteId) ?? null;

  return (
    <PageWrapper>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:gap-6">
        {/* List */}
        <section className="space-y-3 min-w-0">
          <div className="flex items-center gap-2">
            <Input placeholder="Search notes semantically…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button size="md" onClick={createNew}>
              New
            </Button>
          </div>
          {loading && <LoadingSpinner variant="bar" />}
          {!loading && notes.length === 0 && (
            <Card>
              <EmptyState
                icon="◇"
                title="No notes yet"
                description="Capture your first thought — type below or ask Nexus on the chat page."
                action={<Button onClick={createNew}>Create your first note</Button>}
              />
            </Card>
          )}
          <div className="space-y-2">
            {notes.map((n) => (
              <motion.button
                key={n.id}
                onClick={() => setActive(n.id)}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12 }}
                className={`w-full text-left p-3 rounded-xl border transition-colors ${
                  activeNoteId === n.id
                    ? 'bg-surface-2 border-nexus-primary/60'
                    : 'bg-surface-2 border-surface-border hover:border-surface-3'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-sm truncate text-text-primary">{n.title || 'Untitled'}</span>
                  {semantic && typeof n.similarity === 'number' && (
                    <Badge intent="primary">{(n.similarity * 100).toFixed(0)}%</Badge>
                  )}
                </div>
                <p className="text-xs text-text-secondary line-clamp-2 mb-2 whitespace-pre-wrap">{n.content || '—'}</p>
                <div className="flex items-center justify-between text-[11px] text-text-muted">
                  <span>{formatRelative(n.updated_at ?? n.created_at)}</span>
                  {n.source && n.source !== 'manual' && <Badge intent="info">{n.source}</Badge>}
                </div>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Editor */}
        <section className="min-w-0">
          {active ? (
            <Editor
              key={active.id}
              note={active}
              onSave={async (patch) => {
                try {
                  const res = await notesApi.update(active.id, patch);
                  upsert(res.note);
                } catch (err) {
                  // eslint-disable-next-line no-alert
                  alert(`Save failed: ${err.message}`);
                }
              }}
              onDelete={async () => {
                if (!confirm('Delete this note?')) return;
                await notesApi.remove(active.id);
                remove(active.id);
                setActive(notes.find((n) => n.id !== active.id)?.id ?? null);
              }}
            />
          ) : (
            <Card>
              <EmptyState
                icon="◇"
                title="Pick a note"
                description="Select something on the left or create a new note to start writing."
              />
            </Card>
          )}
        </section>
      </div>
    </PageWrapper>
  );
}

function Editor({ note, onSave, onDelete }) {
  const [title, setTitle] = useState(note.title ?? '');
  const [content, setContent] = useState(note.content ?? '');
  const [tags, setTags] = useState((note.tags ?? []).join(', '));
  const [savedAt, setSavedAt] = useState(null);

  const save = useCallback(async () => {
    const patch = {
      title: title.trim() || null,
      content,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    };
    await onSave(patch);
    setSavedAt(new Date().toISOString());
  }, [title, content, tags, onSave]);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="p-5 border-b border-surface-border flex items-center gap-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          onBlur={save}
          className="!bg-transparent !border-transparent text-lg font-display font-semibold focus:!bg-surface-3 focus:!border-surface-border"
        />
        <Button variant="ghost" size="sm" onClick={save}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger hover:!bg-danger/15">
          Delete
        </Button>
      </div>
      <div className="p-5 space-y-3">
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags (comma-separated)"
          onBlur={save}
        />
        <Input
          as="textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={save}
          placeholder="Start writing…"
          className="min-h-[320px] font-mono text-sm"
        />
        <p className="text-[11px] text-text-muted">
          {savedAt ? `Saved ${formatRelative(savedAt)}` : 'Auto-saves on blur'}
        </p>
      </div>
    </Card>
  );
}
