// The browser agent's own Chromium window (PLAN.md D1, safety rule S1). It runs with a
// persistent profile in server/.agent-profile (gitignored), separate from Ruthvik's Chrome, so
// logins Ruthvik makes by hand in this window survive restarts while the agent never touches the
// everyday browser. Every Playwright launch/close goes through this file: if Nexus is ever deployed,
// this is the seam where a local companion process takes over (D4).
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROFILE_DIR =
  process.env.BROWSER_PROFILE_DIR || path.resolve(HERE, '../../.agent-profile');

let ctx = null;
let opening = null;

// One persistent context per server process. Concurrent callers share the same launch;
// if Ruthvik closes the window, the next call opens a fresh one.
export async function getContext() {
  if (ctx) return ctx;
  opening ??= chromium
    .launchPersistentContext(PROFILE_DIR, {
      headless: process.env.BROWSER_HEADLESS === '1',
      viewport: { width: 1280, height: 800 },
      acceptDownloads: false,
      args: ['--disable-blink-features=AutomationControlled']
    })
    .then((c) => {
      ctx = c;
      c.on('close', () => {
        ctx = null;
      });
      return c;
    })
    .finally(() => {
      opening = null;
    });
  return opening;
}

// A tab for a task. Reuses the blank tab Chromium opens at launch so the window
// doesn't start with an empty extra tab.
export async function newPage() {
  const context = await getContext();
  const blank = context.pages().find((p) => p.url() === 'about:blank');
  return blank ?? context.newPage();
}

// "Open agent browser": a tab Ruthvik uses to sign in by hand (S2: the agent never types passwords).
export async function openForLogin(url) {
  const page = await newPage();
  await page.goto(url);
  return page;
}

export async function closeBrowser() {
  await ctx?.close();
  ctx = null;
}
