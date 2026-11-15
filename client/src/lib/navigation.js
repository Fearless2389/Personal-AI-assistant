// App navigation from outside React (the voice engine, chat stream handlers).
// App.jsx registers the data router's navigate; tool results carrying
// { navigate: '/path' } (the open_page tool) move the app — only to known pages.
// openExternal opens a website tab for the open_website tool.
const PAGE_PATHS = new Set([
  '/dashboard',
  '/applications',
  '/chat',
  '/notes',
  '/tasks',
  '/calendar',
  '/habits',
  '/goals',
  '/focus',
  '/analytics',
  '/review',
  '/settings'
]);

let navigator = null;

export function registerNavigator(fn) {
  navigator = fn;
}

/** Navigate to an in-app page. Anything else (external URLs, unknown paths) is ignored. */
export function navigateTo(path) {
  if (!PAGE_PATHS.has(path) || !navigator) return false;
  navigator(path);
  return true;
}

/**
 * Open a public website in a new tab (open_website). The server already checked the
 * link; this re-checks the scheme. Voice and chat answers arrive without a click, so
 * the browser's pop-up blocker may refuse: returns false, and the action chip stays
 * as a link to click instead. Allowing pop-ups for the Nexus site makes it hands-free.
 */
export function openExternal(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const tab = window.open(parsed.href, '_blank');
  if (!tab) return false;
  tab.opener = null; // the site can't reach back into Nexus
  return true;
}
