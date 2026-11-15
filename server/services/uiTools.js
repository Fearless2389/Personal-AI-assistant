// Tools that act on the Nexus app itself (not on data): open a page. The server
// only validates and answers { navigate: '/path' }; the client moves the app there
// (client/src/lib/confirmations.js#applyToolResult → lib/navigation.js). The model can
// only pick from these pages — never an arbitrary URL.

export const PAGES = Object.freeze({
  today: '/dashboard',
  applications: '/applications',
  chat: '/chat',
  notes: '/notes',
  tasks: '/tasks',
  calendar: '/calendar',
  habits: '/habits',
  goals: '/goals',
  focus: '/focus',
  analytics: '/analytics',
  review: '/review',
  settings: '/settings'
});

function openPage(_userId, args) {
  const page = String(args.page ?? '').toLowerCase();
  const path = PAGES[page];
  if (!path) return { ok: false, error: `There's no "${args.page}" page. Pages: ${Object.keys(PAGES).join(', ')}.` };
  return { ok: true, page, navigate: path, message: `Opened ${page}.` };
}

export const UI_HANDLERS = Object.freeze({ open_page: openPage });

export const UI_DECLARATIONS = [
  {
    name: 'open_page',
    description:
      'Show a page of the Nexus app ("open my applications", "go to habits", "show settings"). Use when Rama asks ' +
      'to see something, not to change data.',
    parameters: {
      type: 'OBJECT',
      properties: { page: { type: 'STRING', enum: Object.keys(PAGES) } },
      required: ['page']
    }
  }
];
