// The push-to-talk shortcut, in one place (the tray helper tools/hotkey/nexus-hotkey.ps1 registers
// the same combination). Alt+Space since 2026-11-18: Ctrl+Alt+Space collided with the Claude
// desktop app's own shortcut, which grabbed the microphone.
export const HOTKEY_LABEL = 'Alt+Space';
// Windows gives Alt+Space to the window menu before a web page sees it (verified in Chrome,
// 2026-11-18), so the shortcut works through the tray helper (`npm run hotkey`), not on its own.
export const HOTKEY_HINT = `${HOTKEY_LABEL} with the tray helper running`;

/** Exactly Alt+Space: no Ctrl, Shift or Win, so Ctrl+Alt+Space (other apps) never matches. */
export const isHotkey = (e) => e.code === 'Space' && e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey;

/** Releasing either key ends the press. */
export const endsHotkey = (e) => e.code === 'Space' || e.key === 'Alt';
