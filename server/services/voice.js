import { tools } from './gemini.js';
import { buildSystemPrompt } from './memory.js';
import { formatInTz } from './time.js';

// Voice mode: the browser talks to the Gemini Live API directly (audio both ways),
// but only with a short-lived token minted here. The token locks the whole session
// setup — prompt, tools, voice, turn-taking — so the browser can neither see the
// API key nor change what the model is told or allowed to do. Tool calls still
// come back through /api/voice/tool and run server-side via handleToolCall.
// Phase 0 findings: spikes/live-voice/FINDINGS.md.

export const VOICE_MODEL = 'gemini-3.8-live';
const TOKEN_TTL_MS = 30 * 60_000; // how long an open session may keep talking
const TOKEN_START_MS = 60_000; // window to open the socket after minting

// Appended after the text-chat prompt; overrides its formatting guidance.
const SPOKEN_RULES = `
SPOKEN MODE (this conversation is out loud — these rules override the formatting notes above)
- You are speaking, not texting. Answer in one to three short sentences unless asked for more.
- No markdown, bullet points, emojis, URLs or IDs. Say dates and times the way a person would ("Friday at 6 PM").
- You are a capable general assistant as well as Rama's second brain. Answer general-knowledge questions (history, science, explanations, advice, stories) from your own knowledge, directly. Placement season is context, not a limit.
- After a tool acts, confirm in one short sentence what you did. If a tool fails, say so plainly.
- If you are interrupted, drop what you were saying and deal with the new request.
- Only live information (today's news, prices, a specific web page) needs the web, which you can't reach yet. Say so in one line only for those. You can search and read Rama's email.
- When something waits for Rama's OK, read the summary back in ONE spoken sentence ending "Should I go ahead?". Rama can answer out loud or tap Confirm.`;

/** The full system prompt for a voice session, built from loadAssistantContext() output. */
export function buildVoiceInstruction({ settings, tz, upcoming, todaysHabits }) {
  return (
    buildSystemPrompt({
      personaName: settings?.persona_name ?? 'Nexus',
      personaStyle: settings?.persona_style ?? 'friendly',
      memoryContext: [], // no utterance yet to search with; the model can call search_memory
      upcoming,
      todaysHabits,
      tz,
      currentDateTime: formatInTz(tz)
    }) + SPOKEN_RULES
  );
}

/** Session setup locked into the token (BidiGenerateContentSetup). */
export function voiceSetup(systemInstruction, { voice = 'Puck' } = {}) {
  return {
    model: `models/${VOICE_MODEL}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
    },
    systemInstruction: { parts: [{ text: systemInstruction }] },
    tools,
    // Push-to-talk: the client marks speech with activityStart/activityEnd, and a
    // new activity interrupts the model mid-sentence (barge-in).
    realtimeInputConfig: {
      automaticActivityDetection: { disabled: true },
      activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    // Sliding-window compression lifts the 15-minute audio-session cap.
    contextWindowCompression: { slidingWindow: {} }
  };
}

/**
 * Mint a single-use ephemeral token for one Live session.
 * Note: the REST field is `bidiGenerateContentSetup` — the docs' name
 * (`liveConnectConstraints`) is rejected by the API (verified in Phase 0).
 */
export async function mintVoiceToken(setup) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const now = Date.now();
  const expiresAt = new Date(now + TOKEN_TTL_MS).toISOString();
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime: expiresAt,
      newSessionExpireTime: new Date(now + TOKEN_START_MS).toISOString(),
      bidiGenerateContentSetup: setup
    })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Gemini token ${res.status}: ${body?.error?.message ?? 'unknown error'}`);
    err.status = res.status === 429 ? 429 : 502;
    throw err;
  }
  return { token: body.name, model: VOICE_MODEL, expiresAt };
}

/** Tool names the voice client may ask the server to run — exactly the declared ones. */
export const VOICE_TOOL_NAMES = new Set(tools.flatMap((t) => t.functionDeclarations.map((f) => f.name)));
