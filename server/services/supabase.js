import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

// Placeholder URL so the SDK constructor doesn't throw at module-load time when
// env is missing (e.g., during smoke tests). All real DB calls will still fail
// loudly with a clear network error if the placeholder is ever used.
const PLACEHOLDER_URL = 'https://missing-env.supabase.invalid';
const PLACEHOLDER_KEY = 'missing-env';

if (!url || !serviceRoleKey || !anonKey) {
  console.warn('[supabase] Missing SUPABASE_URL / keys in environment. Set them in server/.env before making DB calls.');
}

// Admin client: bypasses RLS. Use for DB writes after the request is already auth'd
// via the requireAuth middleware (which validates the user JWT).
export const supabaseAdmin = createClient(
  url || PLACEHOLDER_URL,
  serviceRoleKey || PLACEHOLDER_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// Per-user client: uses the user's JWT so RLS applies. Use when you want
// Postgres-level enforcement on reads.
export function getUserClient(jwt) {
  return createClient(
    url || PLACEHOLDER_URL,
    anonKey || PLACEHOLDER_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } }
    }
  );
}
