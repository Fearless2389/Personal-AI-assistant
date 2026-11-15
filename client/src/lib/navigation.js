// App navigation from outside React (the voice engine, chat stream handlers).
// App.jsx registers the data router's navigate; tool results carrying
// { navigate: '/path' } (the open_page tool) move the app — only to known pages.
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
