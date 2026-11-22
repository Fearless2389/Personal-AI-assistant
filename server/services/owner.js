// Who Nexus works for. It is a single-user app, so the name the assistant uses in its
// prompts, tool descriptions, briefings and readbacks lives here, in one place.
// (The client has the same constant in client/src/lib/owner.js.)
export const OWNER_NAME = 'Ruthvik';

// What the assistant should assume about Ruthvik's situation right now (studies, job, what
// matters most). Personal, so it lives in the gitignored server/.env as OWNER_CONTEXT
// (this repo is public); the default is deliberately neutral.
export const OWNER_CONTEXT =
  process.env.OWNER_CONTEXT?.trim() ||
  `${OWNER_NAME} is a student. Help with studies, projects, applications and day-to-day life.`;

// Ruthvik's own accounts ("GitHub: github.com/<user>; LinkedIn: …"), so "open my repo" can reach
// the exact page instead of a site's home page. Personal, so .env (OWNER_LINKS); none by default.
export const OWNER_LINKS = process.env.OWNER_LINKS?.trim() || '';

// Which country's version of a shop or service to open (amazon.in, not amazon.com).
export const OWNER_COUNTRY = process.env.OWNER_COUNTRY?.trim() || 'India';
