// Gemini declarations for the manage_* tools (handlers: manageTools.js) and the
// shared confirmation tool. Kept apart from gemini.js so each section's contract
// is readable on its own. Items are named the way the user says them; the server
// resolves the name, so never invent ids.

const action = (values, description) => ({ type: 'STRING', enum: values, description });
const name = (what) => ({ type: 'STRING', description: `The ${what} as the user names it (partial is fine).` });

export const MANAGE_DECLARATIONS = [
  {
    name: 'manage_task',
    description:
      'List, complete, reopen, edit or delete tasks. "I finished X" → complete. "Push X to Friday" → update ' +
      "with due_date. Create new tasks with create_task instead. Delete waits for the user's OK.",
    parameters: {
      type: 'OBJECT',
      properties: {
        action: action(['list', 'complete', 'reopen', 'update', 'delete']),
        task: name('task'),
        status: { type: 'STRING', enum: ['open', 'done', 'all'], description: 'For list. Default open.' },
        new_title: { type: 'STRING' },
        due_date: { type: 'STRING', description: 'ISO 8601 datetime, for update' },
        priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        description: { type: 'STRING' }
      },
      required: ['action']
    }
  },
  {
    name: 'manage_habit',
    description:
      'Habits: create one to track ("start tracking meditation"), check in for today ("I meditated"), undo ' +
      "today's check-in, list habits with streaks, or delete one. Checking in an unknown habit starts tracking it. " +
      "Delete waits for the user's OK.",
    parameters: {
      type: 'OBJECT',
      properties: {
        action: action(['list', 'create', 'check_in', 'undo_check_in', 'delete']),
        habit: name('habit (or the new habit name, for create)'),
        frequency: { type: 'STRING', enum: ['daily', 'weekly'], description: 'For create. Default daily.' }
      },
      required: ['action']
    }
  },
  {
    name: 'manage_note',
    description:
      'Existing notes: list recent ones, read one out, append text to one, or delete one. Save new notes with ' +
      "create_note; find notes by meaning with search_memory. Delete waits for the user's OK.",
    parameters: {
      type: 'OBJECT',
      properties: {
        action: action(['list', 'read', 'append', 'delete']),
        note: name('note (its title or how it starts)'),
        text: { type: 'STRING', description: 'For append.' }
      },
      required: ['action']
    }
  },
  {
    name: 'manage_goal',
    description:
      'Goals and their milestones: list, create a goal, add a milestone, complete a milestone (progress updates ' +
      "itself), or delete a goal. Delete waits for the user's OK.",
    parameters: {
      type: 'OBJECT',
      properties: {
        action: action(['list', 'create', 'add_milestone', 'complete_milestone', 'delete']),
        goal: name('goal (or the new goal title, for create)'),
        description: { type: 'STRING' },
        category: { type: 'STRING', enum: ['academic', 'health', 'personal', 'career'] },
        target_date: { type: 'STRING', description: 'YYYY-MM-DD, for create' },
        milestone: { type: 'STRING', description: 'Milestone title, for add_milestone / complete_milestone' },
        milestone_due: { type: 'STRING', description: 'YYYY-MM-DD, for add_milestone' }
      },
      required: ['action']
    }
  },
  {
    name: 'manage_reminder',
    description: 'SMS reminders: list the pending ones, or cancel one. Schedule new ones with schedule_reminder.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: action(['list', 'cancel']),
        reminder: name('reminder (its message)')
      },
      required: ['action']
    }
  },
  {
    name: 'resolve_pending_action',
    description:
      'Answer a pending confirmation after the user replies to "Should I go ahead?". decision "confirm" when they ' +
      'said yes, "cancel" for no, stop or cancel. The server checks what the user actually said or typed; if it was ' +
      'not a clear yes, it stays pending. Never call it for a new request or to confirm on your own.',
    parameters: {
      type: 'OBJECT',
      properties: {
        confirmation_id: {
          type: 'STRING',
          description: 'From the needs_confirmation result. Optional: defaults to the newest pending action.'
        },
        decision: { type: 'STRING', enum: ['confirm', 'cancel'] }
      },
      required: ['decision']
    }
  }
];
