// The assistant's manage_* tools: one tool per section (tasks, habits, notes, goals,
// reminders) with an `action`, so voice and chat can do what the pages can without
// a tool per button. Items are found by name through matcher.js; an ambiguous name
// comes back as a which-one question instead of a guess. Every handler returns a
// plain result object; deletes reach here only after the confirmation gate.
import { supabaseAdmin } from './supabase.js';
import { pickByName } from './matcher.js';
import { embedAndStore } from './memory.js';
import { checkIn, undoCheckIn, listHabitsWithToday } from './habitService.js';
import { recomputeProgress } from './goalService.js';
import { localDateKey } from './time.js';

const LIST_LIMIT = 25;
const MAX_NOTE_READ = 4000;

// How each kind of item is stored and named.
const KINDS = {
  task: { table: 'tasks', cols: 'id, title, status, due_date, priority', label: (r) => r.title },
  habit: { table: 'habits', cols: 'id, name, current_streak', label: (r) => r.name },
  note: { table: 'notes', cols: 'id, title, content', label: (r) => r.title || r.content?.slice(0, 80) },
  goal: { table: 'goals', cols: 'id, title, status, progress_pct, target_date', label: (r) => r.title },
  reminder: { table: 'sms_jobs', cols: 'id, message, scheduled_at', label: (r) => r.message, pendingOnly: true }
};

const fail = (message, extra = {}) => ({ ok: false, message, ...extra });
const dateOnly = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

function must({ data, error }) {
  if (error) throw error;
  return data;
}

async function loadRows(kind, userId) {
  const k = KINDS[kind];
  let q = supabaseAdmin.from(k.table).select(k.cols).eq('user_id', userId);
  if (k.pendingOnly) q = q.eq('status', 'pending');
  return must(await q.order('created_at', { ascending: false }).limit(300)) ?? [];
}

/**
 * The item the user named → { row } | { result } (a tool result to hand back).
 * `target_id` (pinned by the gate when it parked a delete) beats the name, so a
 * confirmed delete removes exactly the item that was read back.
 */
export async function findTarget(kind, userId, args) {
  const k = KINDS[kind];
  if (args.target_id) {
    const row = must(
      await supabaseAdmin.from(k.table).select(k.cols).eq('id', args.target_id).eq('user_id', userId).maybeSingle()
    );
    return row ? { row } : { result: fail(`That ${kind} no longer exists.`), notFound: true };
  }
  const query = args[kind];
  if (!query) return { result: fail(`Which ${kind}? Pass its name in "${kind}".`) };
  const hit = pickByName(await loadRows(kind, userId), query, k.label);
  if (hit.status === 'found') return { row: hit.row };
  if (hit.status === 'ambiguous') {
    const candidates = hit.rows.slice(0, 5).map(k.label);
    return {
      result: {
        ok: true,
        needs_choice: true,
        kind,
        candidates,
        message: `Several ${kind}s match "${query}": ${candidates.join('; ')}. Ask which one.`
      }
    };
  }
  return { result: fail(`No ${kind} matches "${query}".`), notFound: true };
}

/**
 * Gate hook, run before a risky action is parked: resolve the item now so the
 * readback names the exact one and the later delete can't hit a different item.
 * → { args } (possibly with target_id/target_label pinned) | { result } to return instead.
 */
export async function prepareAction(name, args, userId) {
  const kind = name.startsWith('manage_') ? name.slice('manage_'.length) : null;
  if (!KINDS[kind] || args.action !== 'delete') return { args };
  const t = await findTarget(kind, userId, args);
  if (t.result) return { result: t.result };
  return { args: { ...args, target_id: t.row.id, target_label: KINDS[kind].label(t.row) } };
}

async function deleteRow(kind, userId, row) {
  must(await supabaseAdmin.from(KINDS[kind].table).delete().eq('id', row.id).eq('user_id', userId));
  return { ok: true, message: `Deleted the ${kind} "${KINDS[kind].label(row)}".` };
}

const unknownAction = (kind, action) => fail(`Unknown action "${action}" for ${kind}s.`);

// ---- tasks -------------------------------------------------------------------------

async function manageTask(userId, args) {
  if (args.action === 'list') {
    let q = supabaseAdmin.from('tasks').select('title, status, due_date, priority').eq('user_id', userId);
    const scope = args.status ?? 'open';
    if (scope === 'open') q = q.neq('status', 'done');
    else if (scope === 'done') q = q.eq('status', 'done');
    const tasks = must(await q.order('due_date', { ascending: true, nullsFirst: false }).limit(LIST_LIMIT));
    return { ok: true, count: tasks.length, tasks };
  }

  const t = await findTarget('task', userId, args);
  if (t.result) return t.result;
  if (args.action === 'delete') return deleteRow('task', userId, t.row);

  let patch;
  if (args.action === 'complete') patch = { status: 'done' };
  else if (args.action === 'reopen') patch = { status: 'todo' };
  else if (args.action === 'update') {
    patch = {};
    if (args.new_title) patch.title = args.new_title;
    if (args.due_date) patch.due_date = args.due_date;
    if (args.priority) patch.priority = args.priority;
    if (args.description) patch.description = args.description;
    if (!Object.keys(patch).length)
      return fail('Nothing to change: pass new_title, due_date, priority or description.');
  } else return unknownAction('task', args.action);

  const task = must(
    await supabaseAdmin
      .from('tasks')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', t.row.id)
      .eq('user_id', userId)
      .select('id, title, status, due_date, priority')
      .single()
  );
  const verb = { complete: 'Marked done', reopen: 'Reopened', update: 'Updated' }[args.action];
  return { ok: true, action: args.action, task, message: `${verb}: "${task.title}".` };
}

// ---- habits ------------------------------------------------------------------------

async function createHabit(userId, name, frequency = 'daily') {
  const existing = pickByName(await loadRows('habit', userId), name, KINDS.habit.label);
  if (existing.status === 'found' && existing.row.name.toLowerCase() === name.trim().toLowerCase()) {
    return { habit: existing.row, created: false };
  }
  const habit = must(
    await supabaseAdmin
      .from('habits')
      .insert({ user_id: userId, name: name.trim(), frequency })
      .select('id, name, current_streak')
      .single()
  );
  return { habit, created: true };
}

async function manageHabit(userId, args, { tz }) {
  const date = localDateKey(tz); // the user's today, not the server's
  if (args.action === 'list') {
    const habits = (await listHabitsWithToday(userId, date)).map((h) => ({
      name: h.name,
      done_today: h.done_today,
      streak: h.current_streak ?? 0
    }));
    return { ok: true, count: habits.length, habits };
  }
  if (args.action === 'create') {
    if (!args.habit?.trim()) return fail('Pass the new habit name in "habit".');
    const { habit, created } = await createHabit(userId, args.habit, args.frequency);
    return {
      ok: true,
      action: 'create',
      habit: habit.name,
      created,
      message: created ? `Now tracking "${habit.name}".` : `Already tracking "${habit.name}".`
    };
  }

  let t = await findTarget('habit', userId, args);
  let created = false;
  // "I meditated" for a habit that doesn't exist yet starts tracking it.
  if (t.notFound && args.action === 'check_in' && args.habit?.trim()) {
    ({ habit: t.row, created } = await createHabit(userId, args.habit));
    t = { row: t.row };
  }
  if (t.result) return t.result;
  const habit = t.row;

  if (args.action === 'delete') return deleteRow('habit', userId, habit);
  if (args.action === 'check_in') {
    const { streak } = await checkIn(userId, habit.id, { date });
    const s = `Streak: ${streak} day${streak === 1 ? '' : 's'}.`;
    return {
      ok: true,
      action: 'check_in',
      habit: habit.name,
      created,
      streak,
      message: `Logged "${habit.name}"${created ? ' (new habit)' : ''}. ${s}`
    };
  }
  if (args.action === 'undo_check_in') {
    const { streak } = await undoCheckIn(userId, habit.id, { date });
    return {
      ok: true,
      action: 'undo_check_in',
      habit: habit.name,
      streak,
      message: `Unchecked "${habit.name}" for today.`
    };
  }
  return unknownAction('habit', args.action);
}

// ---- notes -------------------------------------------------------------------------

async function manageNote(userId, args) {
  if (args.action === 'list') {
    const rows = must(
      await supabaseAdmin
        .from('notes')
        .select('title, content, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)
    );
    const notes = rows.map((n) => ({ title: n.title || n.content.slice(0, 60), created_at: n.created_at }));
    return { ok: true, count: notes.length, notes };
  }

  const t = await findTarget('note', userId, args);
  if (t.result) return t.result;
  const note = t.row;
  if (args.action === 'delete') return deleteRow('note', userId, note);
  if (args.action === 'read') {
    return { ok: true, action: 'read', title: note.title, content: note.content.slice(0, MAX_NOTE_READ) };
  }
  if (args.action === 'append') {
    if (!args.text?.trim()) return fail('Pass the text to add in "text".');
    const content = `${note.content}\n\n${args.text.trim()}`;
    must(
      await supabaseAdmin
        .from('notes')
        .update({ content, updated_at: new Date().toISOString() })
        .eq('id', note.id)
        .eq('user_id', userId)
    );
    setImmediate(() => embedAndStore(userId, 'notes', note.id, content));
    return {
      ok: true,
      action: 'append',
      title: KINDS.note.label(note),
      message: `Added to "${KINDS.note.label(note)}".`
    };
  }
  return unknownAction('note', args.action);
}

// ---- goals -------------------------------------------------------------------------

async function manageGoal(userId, args) {
  if (args.action === 'list') {
    const goals = must(
      await supabaseAdmin
        .from('goals')
        .select('id, title, status, progress_pct, target_date')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT)
    );
    const ms = goals.length
      ? must(
          await supabaseAdmin
            .from('goal_milestones')
            .select('goal_id, title, completed, due_date')
            .eq('user_id', userId)
            .in(
              'goal_id',
              goals.map((g) => g.id)
            )
        )
      : [];
    return {
      ok: true,
      count: goals.length,
      goals: goals.map(({ id, ...g }) => ({
        ...g,
        milestones: ms.filter((m) => m.goal_id === id).map(({ goal_id: _g, ...m }) => m)
      }))
    };
  }
  if (args.action === 'create') {
    if (!args.goal?.trim()) return fail('Pass the goal title in "goal".');
    const goal = must(
      await supabaseAdmin
        .from('goals')
        .insert({
          user_id: userId,
          title: args.goal.trim(),
          description: args.description ?? null,
          category: args.category ?? 'personal',
          target_date: dateOnly(args.target_date)
        })
        .select('id, title, target_date')
        .single()
    );
    return { ok: true, action: 'create', goal: goal.title, message: `New goal: "${goal.title}".` };
  }

  const t = await findTarget('goal', userId, args);
  if (t.result) return t.result;
  const goal = t.row;
  if (args.action === 'delete') return deleteRow('goal', userId, goal);

  if (args.action === 'add_milestone') {
    if (!args.milestone?.trim()) return fail('Pass the milestone in "milestone".');
    must(
      await supabaseAdmin.from('goal_milestones').insert({
        goal_id: goal.id,
        user_id: userId,
        title: args.milestone.trim(),
        due_date: dateOnly(args.milestone_due)
      })
    );
    await recomputeProgress(userId, goal.id);
    return {
      ok: true,
      action: 'add_milestone',
      goal: goal.title,
      message: `Added "${args.milestone.trim()}" to "${goal.title}".`
    };
  }
  if (args.action === 'complete_milestone') {
    const ms = must(
      await supabaseAdmin.from('goal_milestones').select('id, title').eq('goal_id', goal.id).eq('user_id', userId)
    );
    const hit = pickByName(ms, args.milestone);
    if (hit.status === 'ambiguous') {
      return {
        ok: true,
        needs_choice: true,
        candidates: hit.rows.map((m) => m.title),
        message: 'Several milestones match. Ask which one.'
      };
    }
    if (hit.status === 'none') return fail(`"${goal.title}" has no milestone matching "${args.milestone}".`);
    must(
      await supabaseAdmin
        .from('goal_milestones')
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', hit.row.id)
        .eq('user_id', userId)
    );
    await recomputeProgress(userId, goal.id);
    return {
      ok: true,
      action: 'complete_milestone',
      goal: goal.title,
      message: `Done: "${hit.row.title}" (${goal.title}).`
    };
  }
  return unknownAction('goal', args.action);
}

// ---- reminders ---------------------------------------------------------------------

async function manageReminder(userId, args) {
  if (args.action === 'list') {
    const reminders = must(
      await supabaseAdmin
        .from('sms_jobs')
        .select('message, scheduled_at')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(LIST_LIMIT)
    );
    return { ok: true, count: reminders.length, reminders };
  }
  if (args.action === 'cancel') {
    const t = await findTarget('reminder', userId, args);
    if (t.result) return t.result;
    const done = must(
      await supabaseAdmin
        .from('sms_jobs')
        .update({ status: 'cancelled' })
        .eq('id', t.row.id)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle()
    );
    return done
      ? { ok: true, action: 'cancel', message: `Cancelled the reminder "${t.row.message}".` }
      : fail('That reminder was already sent or cancelled.');
  }
  return unknownAction('reminder', args.action);
}

export const MANAGE_HANDLERS = Object.freeze({
  manage_task: manageTask,
  manage_habit: manageHabit,
  manage_note: manageNote,
  manage_goal: manageGoal,
  manage_reminder: manageReminder
});
