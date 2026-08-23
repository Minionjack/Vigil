// Phase 2b: repointed from the local LAN proxy to the deployed Supabase
// project — see SUPABASE-SETUP.md and the Phase 2b plan for the full
// deploy sequence this follows. The project URL and anon/publishable key
// are designed to be public (Supabase's own naming for the client-safe
// key), so committing them here is fine; the dev account's email/
// password live in config.local.ts instead, which is gitignored.
export const SUPABASE_URL = "https://phuzlutydizylgfsocbx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_td-TZxGmxq26QF4mlQULDA_YzxGVayV";

// The chat edge function's base URL — sendMessage() hits `${SERVER_URL}/chat`.
export const SERVER_URL = `${SUPABASE_URL}/functions/v1`;
