import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// One-off: create the single dev-account auth user and its profiles row,
// using the real values already in fake-profile.json / proactive/state.json
// rather than inventing new data. Prints the resulting user id — needed as
// MIGRATION_USER_ID for migrate-to-supabase.ts and for the app's headless
// sign-in to actually resolve to the right row.
//
// Usage: run once, after 0001_init.sql has been applied.

dotenv.config({ path: path.resolve(import.meta.dirname, "..", "server", ".env") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in server/.env before running this script.`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const AUTH_EMAIL = requireEnv("SUPABASE_AUTH_EMAIL");
const AUTH_PASSWORD = requireEnv("SUPABASE_AUTH_PASSWORD");

// Node 20 (this environment) has no native WebSocket global, which
// @supabase/supabase-js's realtime client requires just to construct —
// even though this script never uses realtime. Providing `ws` explicitly
// is the documented workaround for Node < 22.
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket as never },
});

async function main() {
  const fakeProfilePath = path.resolve(import.meta.dirname, "..", "fake-profile.json");
  const fakeProfile = JSON.parse(fs.readFileSync(fakeProfilePath, "utf-8"));
  const client = fakeProfile.client;

  const { data: userData, error: userError } = await supabase.auth.admin.createUser({
    email: AUTH_EMAIL,
    password: AUTH_PASSWORD,
    email_confirm: true,
  });

  if (userError) {
    console.error("Failed to create auth user:", userError.message);
    process.exit(1);
  }

  const userId = userData.user.id;
  console.log(`Created auth user ${AUTH_EMAIL} with id ${userId}`);

  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: userId,
    name: client.name,
    goal: client.goal,
    training_days: client.training_days,
    usual_session_time: client.usual_session_time,
    timezone: "Asia/Dubai",
    personality: "drill-sergeant",
  });

  if (profileError) {
    console.error("Failed to insert profile row:", profileError.message);
    process.exit(1);
  }

  console.log(`Inserted profile row for user ${userId}.`);
  console.log(`\nMIGRATION_USER_ID=${userId}`);
}

main();
