import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", "server", ".env") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}.`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const USER_ID = requireEnv("PROACTIVE_USER_ID");
const NEW_PASSWORD = process.argv[2];

if (!NEW_PASSWORD) {
  console.error("Usage: npx tsx rotate-dev-password.ts <new-password>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: WebSocket as never },
});

const { error } = await supabase.auth.admin.updateUserById(USER_ID, { password: NEW_PASSWORD });
if (error) {
  console.error("Failed to update password:", error.message);
  process.exit(1);
}
console.log("Password updated successfully.");
