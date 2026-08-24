import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// One-time: inserts the first (and, until now, only ever missing)
// `program_changed` event — BRIEF-PHASE3.md's progression engine needs a
// `program` to compute against, and the schema's own design comment says
// "current program is the payload of the most recent program_changed
// event," but no such event had ever been written.
//
// The `exercises` array below is transcribed by hand from
// proactive/local-config.json's current_program (Push) and the original
// fake-profile.json (Legs) — it is NOT derived by code or a model. Only
// the four lifts with a real known current working weight anywhere in
// this repo's files are included (Bench press, Incline DB press, Squat,
// Romanian deadlift). Pull-day lifts have no target weight recorded
// anywhere — inventing plausible-sounding numbers for them would be
// exactly the fabrication this architecture forbids, so they're left out
// until a real number exists to seed them with.
//
// Usage: run once, after 0002_add_override_kind.sql has been applied.

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
const USER_ID = requireEnv("PROACTIVE_USER_ID");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  realtime: { transport: WebSocket as never },
});

const localConfigPath = path.resolve(import.meta.dirname, "..", "proactive", "local-config.json");
const localConfig = JSON.parse(fs.readFileSync(localConfigPath, "utf-8"));

const payload = {
  name: localConfig.current_program.name,
  next_session: localConfig.current_program.next_session,
  exercises: [
    { exercise: "Bench press", sessionType: "Push", targetReps: 6, targetSets: 4, category: "upper", seedWeight_kg: 82.5 },
    { exercise: "Incline DB press", sessionType: "Push", targetReps: 10, targetSets: 3, category: "upper", seedWeight_kg: 30 },
    { exercise: "Squat", sessionType: "Legs", targetReps: 6, targetSets: 4, category: "lower", seedWeight_kg: 95 },
    { exercise: "Romanian deadlift", sessionType: "Legs", targetReps: 10, targetSets: 3, category: "lower", seedWeight_kg: 80 },
  ],
};

async function main() {
  const { error } = await supabase.from("events").insert({
    user_id: USER_ID,
    // A decision happening now, not a backfill — the program has been
    // "current" all along, but this is the first time it's ever been
    // written down as a real event.
    occurred_at: new Date().toISOString(),
    kind: "program_changed",
    payload,
  });

  if (error) {
    console.error("Failed to seed program_changed event:", error.message);
    process.exit(1);
  }

  console.log(`Seeded program_changed event for user ${USER_ID} with ${payload.exercises.length} tracked lifts:`);
  for (const ex of payload.exercises) {
    console.log(`  - ${ex.exercise} (${ex.sessionType}): seed ${ex.seedWeight_kg}kg, target ${ex.targetSets}x${ex.targetReps}`);
  }
}

main();
