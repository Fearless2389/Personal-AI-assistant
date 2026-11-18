// Run one browser-agent task from the terminal, in the agent's own Chromium window (PLAN.md T1.7).
//   npm run agent -- "Find the cheapest laptop and add it to the cart" --start http://127.0.0.1:3999/
//   options: --kind research   --headless
// Steps that need a yes are asked here (y/N). Ctrl+C stops the task (the kill switch).
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { runTask } from '../services/browser/agentLoop.js';
import { newPage, closeBrowser, allowOrigin } from '../services/browser/driver.js';
import { start as startFixtures } from '../test/fixtureServer.js';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : (argv.splice(i, 2)[1] ?? null);
};
const has = (name) => {
  const i = argv.indexOf(name);
  if (i !== -1) argv.splice(i, 1);
  return i !== -1;
};
const startUrl = flag('--start');
const kind = flag('--kind') ?? 'errand';
if (has('--headless')) process.env.BROWSER_HEADLESS = '1';
const goal = argv.join(' ').trim();
if (!goal) {
  console.error('Usage: npm run agent -- "<goal>" [--start <url>] [--kind errand|research] [--headless]');
  process.exit(2);
}

// The local fixture site is allowed despite the private-address guard, and started if needed.
const fixturePort = Number(process.env.AGENT_FIXTURE_PORT) || 3999;
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
let fixtures = null;
allowOrigin(fixtureOrigin);
if (startUrl?.startsWith(fixtureOrigin)) {
  fixtures = await startFixtures(fixturePort).catch(() => null); // already running → fine
}

const rl = readline.createInterface({ input: stdin, output: stdout });
const abort = new AbortController();
process.on('SIGINT', () => {
  console.log('\n[stop] stopping the task…');
  abort.abort();
});

const RISK_TAG = { safe: '[safe]', confirm: '[CONFIRM]', never: '[BLOCKED]' };
const t0 = Date.now();
const result = await runTask({
  goal,
  kind,
  page: await newPage(),
  startUrl,
  allowOrigins: [fixtureOrigin],
  signal: abort.signal,
  decide: async (step, c) => {
    const answer = await rl.question(`  ? ${c.reason} on ${new URL(step.url).host}. Allow? (y/N) `);
    return /^y(es)?$/i.test(answer.trim()) ? 'execute' : 'decline';
  },
  onEvent: (e) => {
    if (e.type === 'thinking') stdout.write(`#${e.n} …\r`);
    if (e.type === 'step') {
      const s = e.step;
      console.log(`#${s.n} ${s.label} ${RISK_TAG[s.risk] ?? ''} ${s.status}${s.note ? ` (${s.note})` : ''}`);
    }
  }
});

console.log('\n' + '-'.repeat(60));
console.log(`status:  ${result.status}${result.status === 'done' ? (result.success ? ' (success)' : ' (not achieved)') : ''}`);
if (result.summary) console.log(`summary: ${result.summary}`);
if (result.question) console.log(`question: ${result.question}`);
for (const table of result.collected) {
  console.log(`\n${table.title || 'Collected'} (${table.url})\n${table.columns.join(' | ')}`);
  for (const row of table.rows) console.log(row.join(' | '));
}
console.log(`steps: ${result.steps.length}, ${Math.round((Date.now() - t0) / 1000)} s`);

rl.close();
await closeBrowser();
await fixtures?.close();
