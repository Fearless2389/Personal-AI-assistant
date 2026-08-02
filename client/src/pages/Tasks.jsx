import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCorners
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { tasksApi } from '../lib/api.js';
import { useTasksStore, TASK_COLUMNS } from '../store/useTasksStore.js';
import { Button } from '../components/ui/Button.jsx';
import { Card, CardTitle } from '../components/ui/Card.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { EmptyState } from '../components/shared/EmptyState.jsx';
import { LoadingSpinner } from '../components/shared/LoadingSpinner.jsx';
import { PageWrapper } from '../components/layout/PageWrapper.jsx';
import { formatRelative, priorityColor } from '../lib/utils.js';

const COLUMN_LABELS = { todo: 'Todo', in_progress: 'In progress', done: 'Done' };

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Due today' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'high', label: 'High priority' }
];

function applyFilter(tasks, filter) {
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  switch (filter) {
    case 'today':
      return tasks.filter(t => t.due_date && new Date(t.due_date) >= startOfDay && new Date(t.due_date) <= endOfDay);
    case 'overdue':
      return tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== 'done');
    case 'high':
      return tasks.filter(t => t.priority === 'high');
    default:
      return tasks;
  }
}

export default function Tasks() {
  const { tasks, loading, setTasks, setLoading, upsert } = useTasksStore();
  const [filter, setFilter] = useState('all');
  const [openNew, setOpenNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tasksApi.list();
      setTasks(res.tasks ?? []);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[tasks] load failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [setTasks, setLoading]);

  useEffect(() => { load(); }, [load]);

  const filteredByColumn = useMemo(() => {
    const filtered = applyFilter(tasks, filter);
    const cols = Object.fromEntries(TASK_COLUMNS.map(c => [c, []]));
    for (const t of filtered) {
      const col = TASK_COLUMNS.includes(t.status) ? t.status : 'todo';
      cols[col].push(t);
    }
    return cols;
  }, [tasks, filter]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id;
    const overId = over.id;
    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    // Was it dropped onto a column container (over.id matches a column key) or onto a sibling?
    let targetColumn = TASK_COLUMNS.includes(overId) ? overId : tasks.find(t => t.id === overId)?.status;
    if (!targetColumn) return;

    if (activeTask.status !== targetColumn) {
      const next = { ...activeTask, status: targetColumn };
      upsert(next);
      try {
        const res = await tasksApi.update(activeTask.id, { status: targetColumn });
        upsert(res.task);
      } catch (err) {
        // eslint-disable-next-line no-alert
        alert(`Update failed: ${err.message}`);
        upsert(activeTask); // revert
      }
    } else if (activeId !== overId) {
      // Reorder within the same column (local-only — order not persisted in Phase 1)
      const colTasks = filteredByColumn[targetColumn];
      const oldIndex = colTasks.findIndex(t => t.id === activeId);
      const newIndex = colTasks.findIndex(t => t.id === overId);
      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(colTasks, oldIndex, newIndex);
        // Rebuild task list: keep tasks in other columns as-is, splice reordered list
        const others = tasks.filter(t => t.status !== targetColumn);
        setTasks([...others, ...reordered]);
      }
    }
  };

  return (
    <PageWrapper>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map(f => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? 'primary' : 'ghost'}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button onClick={() => setOpenNew(true)}>+ New task</Button>
      </div>

      {loading && <LoadingSpinner variant="bar" className="mb-4" />}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TASK_COLUMNS.map(col => (
            <KanbanColumn
              key={col}
              columnId={col}
              title={COLUMN_LABELS[col]}
              tasks={filteredByColumn[col] ?? []}
            />
          ))}
        </div>
      </DndContext>

      <NewTaskModal
        open={openNew}
        onClose={() => setOpenNew(false)}
        onCreated={(t) => upsert(t)}
      />
    </PageWrapper>
  );
}

function KanbanColumn({ columnId, title, tasks }) {
  const ids = tasks.map(t => t.id);
  return (
    <Card padded={false} className="overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge intent="neutral">{tasks.length}</Badge>
      </div>
      <SortableContext id={columnId} items={ids} strategy={verticalListSortingStrategy}>
        <DroppableArea columnId={columnId}>
          {tasks.length === 0 && (
            <p className="text-xs text-text-muted text-center py-6">Drop tasks here</p>
          )}
          <div className="space-y-2">
            {tasks.map(t => <SortableTaskCard key={t.id} task={t} />)}
          </div>
        </DroppableArea>
      </SortableContext>
    </Card>
  );
}

function DroppableArea({ columnId, children }) {
  // The column id is registered as a sortable container via SortableContext id.
  // dnd-kit will use this id when dropping into an empty column.
  const { setNodeRef } = useSortable({ id: columnId, disabled: true });
  return (
    <div ref={setNodeRef} className="p-3 min-h-[280px]">
      {children}
    </div>
  );
}

function SortableTaskCard({ task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderLeftColor: priorityColor(task.priority)
  };
  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="bg-surface-3 border border-surface-border rounded-lg p-3 cursor-grab active:cursor-grabbing border-l-4"
    >
      <p className="text-sm text-text-primary mb-1 line-clamp-2">{task.title}</p>
      {task.description && (
        <p className="text-xs text-text-secondary line-clamp-2 mb-2">{task.description}</p>
      )}
      <div className="flex items-center justify-between text-[11px] text-text-muted">
        <span>{task.due_date ? formatRelative(task.due_date) : 'no due date'}</span>
        {task.project_tag && <Badge intent="info">{task.project_tag}</Badge>}
      </div>
    </motion.div>
  );
}

function NewTaskModal({ open, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState('medium');
  const [project, setProject] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTitle(''); setDescription(''); setDue(''); setPriority('medium'); setProject('');
  };

  const submit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await tasksApi.create({
        title: title.trim(),
        description: description.trim() || null,
        due_date: due ? new Date(due).toISOString() : null,
        priority,
        project_tag: project.trim() || null
      });
      onCreated(res.task);
      reset();
      onClose();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Create failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New task"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim() || submitting}>
            {submitting ? 'Saving…' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" autoFocus />
        <Input as="textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
        <div className="grid grid-cols-2 gap-3">
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full rounded-lg bg-surface-3 border border-surface-border px-3 py-2 text-sm text-text-primary"
          >
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
          </select>
        </div>
        <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="Project tag (optional)" />
      </div>
    </Modal>
  );
}
