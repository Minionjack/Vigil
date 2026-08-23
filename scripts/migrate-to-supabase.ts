import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// One-time import of the Milestone 0.5 experiment's data (journal.jsonl +
// state.json sessions) as the first rows of `events`, timestamps
// preserved — the experiment's data is the seed corpus, not left behind
// (BRIEF-PHASE2.md §5). Run once, after the schema in
// supabase/migrations/0001_init.sql has been applied to a real project.
// UNVERIFIED — no live project exists to run this against yet.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MIGRATION_USER_ID=... \
//     npm run migrate-to-supabase

dotenv.config({ path: path.resolve(import.meta.dirname, "..", "server", ".env") });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in the environment before running this script.`);
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const USER_ID = requireEnv("MIGRATION_USER_ID");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface JournalEntry {
  kind: "fired" | "outcome";
  timestamp?: string;
  fired_at?: string;
  rule?: string;
  message_text?: string;
  delivered?: boolean;
  acted?: boolean;
  note?: string;
}

interface Session {
  date: string;
  type: string;
  status: "completed" | "skipped";
  note?: string;
  excuse?: string;
}

interface EventRow {
  user_id: string;
  // The historical moment the event happened, preserved from the source
  // data — never left to default. recorded_at is deliberately NOT set
  // here: it should reflect when this row was actually written, i.e. when
  // this migration runs, which is exactly what its DB default (now())
  // already gives it.
  occurred_at: string;
  kind: string;
  payload: Record<string, unknown>;
}

function readJsonl(filePath: string): JournalEntry[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

async function main() {
  const journalPath = path.resolve(import.meta.dirname, "..", "proactive", "journal.jsonl");
  const statePath = path.resolve(import.meta.dirname, "..", "proactive", "state.json");

  const journal = readJsonl(journalPath);
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf-8")) : { sessions: [] as Session[] };

  const events: EventRow[] = [];

  for (const entry of journal) {
    if (entry.kind === "fired") {
      events.push({
        user_id: USER_ID,
        occurred_at: entry.timestamp!,
        kind: "nudge_fired",
        payload: { rule: entry.rule, message_text: entry.message_text, delivered: entry.delivered },
      });
    } else if (entry.kind === "outcome") {
      events.push({
        user_id: USER_ID,
        occurred_at: entry.timestamp!,
        kind: "nudge_outcome",
        payload: { rule: entry.rule, fired_at: entry.fired_at, acted: entry.acted, note: entry.note },
      });
    }
  }

  for (const s of state.sessions as Session[]) {
    events.push({
      user_id: USER_ID,
      // Sessions only ever recorded a date, never a time — anchored at UTC
      // noon, the same convention packages/core's date helpers use, so
      // this doesn't silently roll to a different calendar day depending
      // on which timezone reads it back.
      occurred_at: `${s.date}T12:00:00Z`,
      kind: s.status === "completed" ? "session_completed" : "session_skipped",
      payload: s.status === "completed" ? { type: s.type, note: s.note } : { type: s.type, excuse: s.excuse },
    });
  }

  console.log(`Prepared ${events.length} events from ${journal.length} journal entries and ${state.sessions?.length ?? 0} sessions.`);

  if (events.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  const { error } = await supabase.from("events").insert(events);
  if (error) {
    console.error("Migration failed:", error.message);
    process.exit(1);
  }

  console.log(`Inserted ${events.length} events for user ${USER_ID}.`);
}

main();
