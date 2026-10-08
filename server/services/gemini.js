import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) console.warn('[gemini] Missing GEMINI_API_KEY in environment.');

const genAI = new GoogleGenerativeAI(apiKey ?? '');

// Function/tool declarations exposed to Gemini. Phase 1 wires all six so the model
// knows the surface area; Phase 2/3 fill in the handlers for reminders/calendar/habits.
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
        name: 'log_habit',
        description: 'Mark a habit as completed for today.',
        parameters: {
          type: 'OBJECT',
          properties: {
            habit_name: { type: 'STRING' }
          },
          required: ['habit_name']
        }
      }
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

export function getChatModel(systemInstruction) {
  return genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    systemInstruction,
    tools
  });
}

/**
 * A model configured to return strict JSON matching `responseSchema`.
 * This is what our AI *workflows* (morning briefing, weekly review, …) use —
 * no tool loop, no streaming, just "reason over context → typed JSON out".
 * `responseSchema` uses the same OBJECT/STRING/ARRAY type strings as `tools`.
 */
export function getStructuredModel(systemInstruction, responseSchema) {
  return genAI.getGenerativeModel({
    model: 'gemini-flash-latest',
    systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema
    }
  });
}
