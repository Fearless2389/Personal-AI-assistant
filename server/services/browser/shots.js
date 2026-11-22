// Screenshots of the agent window at the two moments worth seeing (PLAN.md D12, narrowed in Week 3):
// just before a risky step waits for Ruthvik's yes ("what am I approving?") and when a task ends
// ("what did it leave behind?"). Saved as JPEG under server/.agent-shots/<taskId>/<name>.jpg
// (gitignored), served only to the task's owner (routes/browser.js), swept after 7 days.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SHOTS_DIR = process.env.BROWSER_SHOTS_DIR || path.resolve(HERE, '../../.agent-shots');
export const SHOT_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = /^(\d{1,3}|final)$/; // a step number, or the last page

/** The file for (task, name), or null when either isn't a valid id: no path tricks reach the disk. */
export function shotFile(taskId, name, dir = SHOTS_DIR) {
  if (!UUID.test(String(taskId)) || !NAME.test(String(name))) return null;
  return path.join(dir, String(taskId).toLowerCase(), `${name}.jpg`);
}

/** Screenshot the page as <name>. Returns the name, or null if it couldn't (never throws). */
export async function takeShot(page, taskId, name, dir = SHOTS_DIR) {
  const file = shotFile(taskId, name, dir);
  if (!file || !page?.screenshot) return null;
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: 'jpeg', quality: 60, timeout: 5_000 }); // a hung page can't hold a task open
    return String(name);
  } catch (err) {
    console.warn('[browser] screenshot failed:', err.message);
    return null;
  }
}

/** Delete task folders older than maxAgeMs. Returns how many were removed. */
export async function sweepShots({ maxAgeMs = SHOT_MAX_AGE_MS, dir = SHOTS_DIR, now = Date.now() } = {}) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0; // no screenshots yet
  }
  let removed = 0;
  for (const e of entries) {
    if (!e.isDirectory() || !UUID.test(e.name)) continue;
    const full = path.join(dir, e.name);
    const { mtimeMs } = await fs.stat(full);
    if (now - mtimeMs > maxAgeMs) {
      await fs.rm(full, { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
}
