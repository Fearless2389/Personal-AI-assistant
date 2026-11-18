// The server's one browser-agent runner (chunk 2F), shared by the routes and the Nexus tools
// (chunk 2G). Off unless BROWSER_AGENT_ENABLED=1: then the routes and tools don't exist at all.
import { createRunner } from './runner.js';
import * as taskHub from './taskHub.js';

export const browserAgentEnabled = () => process.env.BROWSER_AGENT_ENABLED === '1';

let runner = null;
export function getRunner() {
  runner ??= createRunner({ hub: taskHub });
  return runner;
}

/** Map runner/store errors to an HTTP status + a message Ruthvik can act on. */
export function httpError(err) {
  if (err?.code === 'queue_full') return { status: 409, error: err.message };
  if (err?.code === 'not_waiting') return { status: 409, error: err.message };
  if (err?.code === 'migration_008_missing') return { status: 503, error: err.message };
  return null;
}
