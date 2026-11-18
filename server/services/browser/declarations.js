// The browser agent's step tools (PLAN.md T1.6, §2). Inside the agent loop the model has ONLY
// these: no Nexus tools (no email, notes, memory), so a page can't steer it into leaking Nexus data
// (S4). Each call becomes one step action; toAction() maps a function call to the §2 shape.
import { OWNER_NAME } from '../owner.js';
import { KEYS } from './actions.js';

const ref = { type: 'NUMBER', description: 'The [number] of the element in the latest page.' };
const why = { type: 'STRING', description: 'A few words on why (shown to the user in the step log).' };
const obj = (properties, required = []) => ({ type: 'OBJECT', properties, required });

const DECLARATIONS = [
  {
    name: 'click',
    description: 'Click a link, button, checkbox, radio, tab or option.',
    parameters: obj({ ref, why }, ['ref'])
  },
  {
    name: 'type',
    description: 'Replace the text in a text field. Set submit=true to press Enter afterwards (e.g. to run a search).',
    parameters: obj(
      { ref, text: { type: 'STRING' }, submit: { type: 'BOOLEAN' }, why },
      ['ref', 'text']
    )
  },
  {
    name: 'select',
    description: 'Choose an option in a dropdown (combobox) by its visible text.',
    parameters: obj({ ref, option: { type: 'STRING' }, why }, ['ref', 'option'])
  },
  {
    name: 'press',
    description: 'Press a key on the focused element.',
    parameters: obj({ key: { type: 'STRING', enum: KEYS }, why }, ['key'])
  },
  {
    name: 'scroll',
    description: 'Scroll the page to see more.',
    parameters: obj({ direction: { type: 'STRING', enum: ['down', 'up'] } }, ['direction'])
  },
  {
    name: 'navigate',
    description: 'Open a web address in this tab. Prefer clicking links; use this to start on a site or open a found URL.',
    parameters: obj({ url: { type: 'STRING' }, why }, ['url'])
  },
  { name: 'back', description: 'Go back to the previous page.', parameters: obj({ why }) },
  {
    name: 'wait',
    description: 'Wait for the page to finish loading or updating.',
    parameters: obj({ seconds: { type: 'NUMBER', description: '1 to 5' } }, ['seconds'])
  },
  {
    name: 'search_web',
    description: 'Search the web and get result titles and URLs (research only). Then navigate to the best ones.',
    parameters: obj({ query: { type: 'STRING' } }, ['query'])
  },
  {
    name: 'extract',
    description:
      'Record facts from the CURRENT page as table rows (research only). Use the same columns every time and ' +
      'include a "Source" column with the page URL.',
    parameters: obj(
      {
        title: { type: 'STRING', description: 'What the table is about.' },
        columns: { type: 'ARRAY', items: { type: 'STRING' } },
        rows: {
          type: 'ARRAY',
          items: obj({ cells: { type: 'ARRAY', items: { type: 'STRING' } } }, ['cells'])
        }
      },
      ['columns', 'rows']
    )
  },
  {
    name: 'done',
    description: `Finish. Summarise the result for ${OWNER_NAME} (what was found, what is in the cart, what is waiting for approval).`,
    parameters: obj({ success: { type: 'BOOLEAN' }, summary: { type: 'STRING' } }, ['success', 'summary'])
  },
  {
    name: 'ask_user',
    description: `Ask ${OWNER_NAME} a question and pause (ambiguous goal, sign-in needed, a choice only they can make).`,
    parameters: obj({ question: { type: 'STRING' } }, ['question'])
  }
];

const RESEARCH_ONLY = new Set(['search_web', 'extract']);
export const STEP_NAMES = DECLARATIONS.map((d) => d.name);

export function stepDeclarationsFor(kind = 'errand') {
  return kind === 'research' ? DECLARATIONS : DECLARATIONS.filter((d) => !RESEARCH_ONLY.has(d.name));
}

/** A model function call → a step action (§2), or null if it isn't one of the step tools. */
export function toAction(call, kind = 'errand') {
  const name = call?.name;
  if (!STEP_NAMES.includes(name)) return null;
  if (kind !== 'research' && RESEARCH_ONLY.has(name)) return null;
  return { type: name, ...(call.args ?? {}) };
}
