// Phase 0 spike helpers — shared by probe.mjs (Node) and server.mjs (browser test).
// Throwaway: nothing in the real app imports this.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Read GEMINI_API_KEY from server/.env without adding a dependency. */
export function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = readFileSync(join(here, '..', '..', 'server', '.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='));
  const key = line?.slice('GEMINI_API_KEY='.length).trim().replace(/^["']|["']$/g, '');
  if (!key) throw new Error('GEMINI_API_KEY missing from server/.env');
  return key;
}

export const DEFAULT_MODEL = process.env.LIVE_MODEL || 'gemini-3.8-live';

export const WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

/**
 * Mint a single-use ephemeral token so the browser never sees the real key.
 * The token is locked to one model; it must start a session within 1 minute.
 */
export async function mintToken(apiKey, model = DEFAULT_MODEL, { pushToTalk = false } = {}) {
  const now = Date.now();
  // Lock the whole setup (prompt + tools + voice) into the token: verified that
  // with only the model locked, the client's prompt and tools are silently
  // ignored — and locking means the browser can't swap in its own tools anyway.
  const constraint = setupMessage(model, { pushToTalk }).setup;
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      // REST name for the docs' "liveConnectConstraints" (the SDK renames it).
      bidiGenerateContentSetup: constraint
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`auth_tokens ${res.status}: ${body?.error?.message || JSON.stringify(body)}`);
  return { token: body.name, model };
}

/** One stub tool so we can prove the voice -> tool -> voice round trip. */
export const TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'list_upcoming',
        description:
          "List the user's tasks, placement deadlines and calendar events in the next N days. Use for any question about what is due, coming up, or scheduled.",
        parameters: {
          type: 'OBJECT',
          properties: { days_ahead: { type: 'INTEGER', description: 'How many days ahead to look (default 7).' } }
        }
      }
    ]
  }
];

/** Fake agenda used until Supabase is back; shape mirrors agenda.listUpcoming. */
export function stubUpcoming() {
  return {
    items: [
      { kind: 'application', title: 'Google — OA', at: 'Friday 6:00 PM', overdue: false },
      { kind: 'application', title: 'Uber — interview round 1', at: 'Monday 11:00 AM', overdue: false },
      { kind: 'task', title: 'Update resume with Nexus project', at: 'Thursday', overdue: false }
    ]
  };
}

/**
 * pushToTalk: the client marks speech with activityStart/activityEnd (hotkey
 * held = talking). Otherwise Gemini's own voice-activity detection decides.
 * Either way a new activity interrupts the model mid-sentence (barge-in).
 */
export function setupMessage(model, { voice = 'Puck', pushToTalk = true } = {}) {
  return {
    setup: {
      model: `models/${model}`,
      realtimeInputConfig: {
        automaticActivityDetection: { disabled: pushToTalk },
        activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
      },
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
      },
      systemInstruction: {
        parts: [
          {
            text: 'You are Nexus, a concise personal assistant for a student in placement season. Answer in one or two short spoken sentences. Use tools for anything about deadlines or schedule.'
          }
        ]
      },
      tools: TOOLS,
      inputAudioTranscription: {},
      outputAudioTranscription: {}
    }
  };
}
