import { GoogleGenerativeAI } from '@google/generative-ai';
import { MANAGE_DECLARATIONS } from './manageDeclarations.js';
import { GOOGLE_DECLARATIONS } from './googleDeclarations.js';
import { WEB_DECLARATIONS } from './webTools.js';
import { UI_DECLARATIONS } from './uiTools.js';
import { BRIEFING_DECLARATIONS } from './briefingTools.js';
import { OWNER_NAME } from './owner.js';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) console.warn('[gemini] Missing GEMINI_API_KEY in environment.');

const genAI = new GoogleGenerativeAI(apiKey ?? '');

// Function/tool declarations exposed to Gemini. Handlers live in routes/chat.js →
// handleToolCall. The last three are deterministic (DB queries, no embeddings) so
// date and pipeline questions never depend on fuzzy semantic recall.
export const tools = [
  {
    functionDeclarations: [
      {
        name: 'create_note',
        description: 'Save a note or piece of information the user wants to remember.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            content: { type: 'STRING', description: 'The note content' },
            tags: { type: 'ARRAY', items: { type: 'STRING' } }
          },
          required: ['content']
        }
      },
      {
        name: 'create_task',
        description: 'Create a task or to-do item.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            description: { type: 'STRING' },
            due_date: { type: 'STRING', description: 'ISO 8601 datetime string' },
            priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
            project_tag: { type: 'STRING' }
          },
          required: ['title']
        }
      },
      {
        name: 'schedule_reminder',
        description: 'Schedule an SMS reminder for a specific time.',
        parameters: {
          type: 'OBJECT',
          properties: {
            message: { type: 'STRING' },
            scheduled_at: { type: 'STRING', description: 'ISO 8601 datetime string' },
            linked_type: { type: 'STRING', enum: ['task', 'event', 'custom'] },
            linked_id: { type: 'STRING' }
          },
          required: ['message', 'scheduled_at']
        }
      },
      {
        name: 'create_calendar_event',
        description: 'Create a Google Calendar event.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING' },
            start_time: { type: 'STRING', description: 'ISO 8601' },
            end_time: { type: 'STRING', description: 'ISO 8601' },
            description: { type: 'STRING' },
            location: { type: 'STRING' }
          },
          required: ['title', 'start_time', 'end_time']
        }
      },
      {
        name: 'search_memory',
        description: 'Search through past notes and conversations semantically.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Natural language search query' }
          },
          required: ['query']
        }
      },
      {
        name: 'track_application',
        description:
          'Create or update a job/internship/placement application. If one already exists for the company ' +
          '(and role), it is updated in place — use this for both "applied to X" and "got the X OA/interview/offer".',
        parameters: {
          type: 'OBJECT',
          properties: {
            company: { type: 'STRING' },
            role: { type: 'STRING', description: 'e.g. "SWE Intern", "SDE-1"' },
            stage: {
              type: 'STRING',
              enum: ['wishlist', 'applied', 'oa', 'interview', 'offer', 'rejected', 'withdrawn']
            },
            channel: { type: 'STRING', enum: ['on_campus', 'off_campus'] },
            next_step: { type: 'STRING', description: 'The next thing due, e.g. "Online assessment", "Round 2"' },
            next_deadline: { type: 'STRING', description: 'ISO 8601 datetime when next_step is due' },
            link: { type: 'STRING' },
            notes: { type: 'STRING' }
          },
          required: ['company']
        }
      },
      {
        name: 'list_applications',
        description: `List ${OWNER_NAME}'s applications, optionally filtered by stage or on/off-campus.`,
        parameters: {
          type: 'OBJECT',
          properties: {
            stage: {
              type: 'STRING',
              enum: ['wishlist', 'applied', 'oa', 'interview', 'offer', 'rejected', 'withdrawn']
            },
            channel: { type: 'STRING', enum: ['on_campus', 'off_campus'] },
            active_only: { type: 'BOOLEAN', description: 'Exclude rejected/withdrawn. Defaults to true.' }
          }
        }
      },
      {
        name: 'list_upcoming',
        description:
          'Everything with a deadline in the next N days — tasks, application next-steps and calendar events — ' +
          'sorted by date, including overdue items. Use for "what is due", "what is coming up", "this week".',
        parameters: {
          type: 'OBJECT',
          properties: {
            days_ahead: { type: 'NUMBER', description: 'Window in days from today. Default 7.' },
            include_overdue: { type: 'BOOLEAN', description: 'Default true.' }
          }
        }
      },
      {
        name: 'list_recent_actions',
        description:
          `What Nexus recently did (or was asked to do) on ${OWNER_NAME}'s behalf, newest first: tool, status ` +
          '(executed, failed, awaiting_confirmation, cancelled, expired) and a summary. Use for ' +
          '"what did you just do", "did that go through", "what is waiting for my OK".',
        parameters: {
          type: 'OBJECT',
          properties: { limit: { type: 'NUMBER', description: 'How many, default 10.' } }
        }
      },
      ...MANAGE_DECLARATIONS,
      ...GOOGLE_DECLARATIONS,
      ...WEB_DECLARATIONS,
      ...UI_DECLARATIONS,
      ...BRIEFING_DECLARATIONS
    ]
  }
];

// Embeddings via the REST API (fetch) so `outputDimensionality` is honored regardless
// of SDK version. gemini-embedding-001 defaults to 3072 dims; we pin 768 to match the
// pgvector(768) columns + match_documents RPC. (Newer API keys no longer expose the
// older text-embedding-004 model, but this model returns identical-shape vectors.)
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 768;

export async function getEmbedding(text) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: String(text ?? '') }] },
        outputDimensionality: EMBED_DIMS
      })
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini embed ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.embedding.values; // 768-dim
}

/**
 * Stream one model turn: text deltas go to onText as they arrive; returns the
 * turn's function calls and the model `content` to append before sending tool
 * results back.
 *
 * Gemini 3 models attach a `thoughtSignature` to function-call parts and reject the
 * next request if it's missing ("Function call is missing a thought_signature").
 * The SDK's merged `stream.response` drops it, so the model turn is rebuilt from the
 * raw chunk parts, which keep it (verified live, 2026-11-14).
 */
export async function streamTurn(model, contents, onText = () => {}) {
  // Our own deadline, not the SDK's `timeout` (that one keeps running after the
  // stream starts and would cut long answers off): FIRST_CHUNK_MS to start
  // answering, then CHUNK_GAP_MS between chunks. A model that never answers (seen
  // live: gemini-flash-latest hung for a day) fails fast instead of spinning.
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), FIRST_CHUNK_MS);
  const parts = [];
  let text = '';
  try {
    const stream = await model.generateContentStream({ contents }, { signal: ctrl.signal });
    for await (const chunk of stream.stream) {
      clearTimeout(timer);
      timer = setTimeout(() => ctrl.abort(), CHUNK_GAP_MS);
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        parts.push(part);
        if (part.text && !part.thought) {
          text += part.text;
          onText(part.text);
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);
  return { text, calls, content: { role: 'model', parts } };
}

const FIRST_CHUNK_MS = 20_000;
const CHUNK_GAP_MS = 45_000;

// Chat models in order of preference; override with env. If the first one times
// out or is overloaded before saying anything, it's skipped for MODEL_DOWN_MS.
export const CHAT_MODELS = [
  ...new Set([
    process.env.GEMINI_CHAT_MODEL || 'gemini-flash-latest',
    process.env.GEMINI_CHAT_FALLBACK_MODEL || 'gemini-flash-lite-latest'
  ])
];
const MODEL_DOWN_MS = 10 * 60_000;
const downUntil = new Map(); // model name → timestamp

export function getChatModel(systemInstruction, name = CHAT_MODELS[0]) {
  return genAI.getGenerativeModel({ model: name, systemInstruction, tools });
}

/** Worth trying another model: a timeout, overload, quota or server error — not a bad request. */
export function isModelUnavailable(err) {
  return (
    err?.name === 'AbortError' ||
    /abort|timed? ?out|fetch failed|\b(429|500|502|503|504)\b|overloaded|unavailable|exhausted/i.test(
      err?.message ?? ''
    )
  );
}

/**
 * Stream the first turn of a chat request on the first healthy model, falling back
 * if a model is unavailable before it says anything. Returns the model that
 * answered: later rounds must reuse it (thought signatures are per model).
 * → { model, name, turn }
 */
export async function firstTurnWithFallback(systemInstruction, contents, onText) {
  const healthy = CHAT_MODELS.filter((n) => (downUntil.get(n) ?? 0) <= Date.now());
  let lastErr;
  for (const name of healthy.length ? healthy : CHAT_MODELS) {
    const model = getChatModel(systemInstruction, name);
    let spoke = false;
    try {
      const turn = await streamTurn(model, contents, (t) => {
        spoke = true;
        onText(t);
      });
      downUntil.delete(name);
      return { model, name, turn };
    } catch (err) {
      lastErr = err;
      if (spoke || !isModelUnavailable(err)) throw err;
      downUntil.set(name, Date.now() + MODEL_DOWN_MS);
      console.warn(`[gemini] ${name} unavailable (${String(err.message).slice(0, 90)}); trying the next model`);
    }
  }
  throw lastErr;
}

/**
 * A model configured to return strict JSON matching `responseSchema`.
 * This is what our AI *workflows* (morning briefing, weekly review, …) use —
 * no tool loop, no streaming, just "reason over context → typed JSON out".
 * `responseSchema` uses the same OBJECT/STRING/ARRAY type strings as `tools`.
 */
export function getStructuredModel(systemInstruction, responseSchema, name = CHAT_MODELS[0]) {
  return genAI.getGenerativeModel({
    model: name,
    systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema
    }
  });
}

const STRUCTURED_TIMEOUT_MS = 25_000;

/**
 * One structured (JSON) call for an AI workflow, with the same model fallback and
 * down-marking as chat, and a deadline per attempt. Returns the response text; the
 * workflow parses it and keeps its deterministic fallback for anything that fails.
 */
export async function generateStructured(systemInstruction, responseSchema, prompt) {
  const healthy = CHAT_MODELS.filter((n) => (downUntil.get(n) ?? 0) <= Date.now());
  let lastErr;
  for (const name of healthy.length ? healthy : CHAT_MODELS) {
    try {
      const result = await getStructuredModel(systemInstruction, responseSchema, name).generateContent(prompt, {
        timeout: STRUCTURED_TIMEOUT_MS // fine here: not a stream, the whole call is one request
      });
      downUntil.delete(name);
      return result.response.text();
    } catch (err) {
      lastErr = err;
      if (!isModelUnavailable(err)) throw err;
      downUntil.set(name, Date.now() + MODEL_DOWN_MS);
      console.warn(`[gemini] ${name} unavailable for a workflow; trying the next model`);
    }
  }
  throw lastErr;
}
