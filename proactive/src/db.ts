import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { suggestNextSession, dateStringInTz, type Program, type ProgressionEvent } from "@vigil/core";
import type { Session, State } from "./types.js";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it in server/.env before running this.`);
  }
  return value;
}

// Node 20 (this environment) has no native WebSocket global, which
// @supabase/supabase-js's realtime client requires just to construct —
// even though nothing here uses realtime. Same workaround already
// proven in scripts/create-dev-user.ts and scripts/migrate-to-supabase.ts.
function makeClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — set them in server/.env.");
  }
  return createClient(url, key, { realtime: { transport: WebSocket as never } });
}

let defaultClient: SupabaseClient | null = null;
function getDefaultClient(): SupabaseClient {
  if (!defaultClient) defaultClient = makeClient();
  return defaultClient;
}

interface LocalConfig {
  journal_config: State["journal_config"];
}

export function readLocalConfig(configPath: string = path.resolve(import.meta.dirname, "..", "local-config.json")): LocalConfig {
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

// The unattended cron job has been observed hitting an intermittent
// "JWT issued at future" error from Supabase roughly a third of ticks —
// a static service_role key can't itself be issued "in the future"
// relative to a stable clock, so this reads as a transient
// clock-validation hiccup on the auth layer, not a code bug: every
// manual retry of the exact same request has succeeded. Retrying a
// bounded number of times with a short backoff means one flaky tick
// doesn't silently drop a whole check/log — important now specifically
// because BRIEF-PHASE2.md's test 1 needs 7 real days of the cron job
// actually running.
// isRetryable defaults to "always" — safe for reads. Writes pass a
// narrower predicate (see recordSessionEvent) because retrying an
// insert on an error that might mean "it actually went through, the
// response just didn't come back" risks a duplicate event row; auth
// rejections happen before the write is ever attempted server-side, so
// they're always safe to retry regardless of which operation they wrap.
async function withRetry<T>(fn: () => Promise<T>, isRetryable: (err: unknown) => boolean = () => true, attempts = 3, delayMs = 500): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1 && isRetryable(err)) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw err;
      }
    }
  }
  throw lastError;
}

function isJwtClockSkewError(err: unknown): boolean {
  return err instanceof Error && /JWT issued at future/i.test(err.message);
}

interface EventRow {
  occurred_at: string;
  kind: string;
  payload: Record<string, unknown>;
}

function eventsToSessions(events: EventRow[]): Session[] {
  return events
    .filter((e) => e.kind === "session_completed" || e.kind === "session_skipped")
    .map((e) => ({
      date: e.occurred_at.slice(0, 10),
      type: String(e.payload.type ?? "Unknown"),
      status: e.kind === "session_completed" ? "completed" : "skipped",
      note: e.payload.note as string | undefined,
      excuse: e.payload.excuse as string | undefined,
    }));
}

/**
 * Assembles the same `State` shape rules.ts/message.ts already consume,
 * but from the live Supabase project instead of a local state.json —
 * `client` from `profiles`, `sessions` from `events`. `current_program`
 * and `journal_config` have no Postgres equivalent (neither rules.ts nor
 * chat's edge function touch them) and stay in local-config.json — see
 * the Phase 2b-follow-up plan for why.
 */
export async function loadLiveState(
  userId: string,
  supabase: SupabaseClient = getDefaultClient(),
  localConfig: LocalConfig = readLocalConfig()
): Promise<State> {
  return withRetry(() => loadLiveStateOnce(userId, supabase, localConfig));
}

async function loadLiveStateOnce(userId: string, supabase: SupabaseClient, localConfig: LocalConfig): Promise<State> {
  const [{ data: profile, error: profileError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", userId).single(),
    // Broadened beyond session_completed/skipped (Phase 2b's original
    // query) to also fetch override and program_changed — the progression
    // engine needs both, and the "current program" now comes from the
    // latest program_changed event's payload rather than local-config.json,
    // per the schema's own design comment ("current program is the
    // payload of the most recent program_changed event").
    supabase
      .from("events")
      .select("occurred_at, kind, payload")
      .eq("user_id", userId)
      .in("kind", ["session_completed", "session_skipped", "override", "program_changed"])
      .order("occurred_at", { ascending: false }),
  ]);

  if (profileError || !profile) {
    throw new Error(`Failed to load profile for user ${userId}: ${profileError?.message ?? "no profile row"}`);
  }
  if (eventsError) {
    throw new Error(`Failed to load events for user ${userId}: ${eventsError.message}`);
  }

  const allEvents = events ?? [];
  const { journal_config } = localConfig;

  // allEvents is ordered occurred_at desc, so the first program_changed
  // row found is the most recent one.
  const programEvent = allEvents.find((e) => e.kind === "program_changed");
  const program = programEvent ? (programEvent.payload as unknown as Program) : null;

  const today = dateStringInTz(new Date(), profile.timezone);
  const progressionEvents: ProgressionEvent[] = allEvents
    .filter((e) => e.kind === "session_completed" || e.kind === "override")
    .map((e) => ({ occurred_at: e.occurred_at, kind: e.kind, payload: e.payload }));
  const suggestions = program ? suggestNextSession(program, progressionEvents, today) : undefined;

  return {
    client: {
      name: profile.name,
      goal: profile.goal,
      training_days: profile.training_days,
      usual_session_time: String(profile.usual_session_time).slice(0, 5),
      timezone: profile.timezone,
      personality: profile.personality,
    },
    // Falls back to a minimal placeholder if no program_changed event
    // exists yet (shouldn't happen post scripts/seed-program.ts, but a
    // freshly-migrated project with no program seeded yet shouldn't crash).
    current_program: program ? { name: program.name, next_session: (programEvent!.payload as { next_session: State["current_program"]["next_session"] }).next_session } : { name: "No program set", next_session: { type: "Unknown", planned: [] } },
    sessions: eventsToSessions(allEvents),
    journal_config,
    suggestions,
  };
}

/**
 * The write side of the same split: log.ts calls this instead of
 * mutating state.json's sessions array, so a session logged locally is
 * immediately visible to chat (which reads the same `events` table) —
 * this is the one-write-both-surfaces-know property BRIEF-PHASE2.md's
 * acceptance test 2 checks for.
 */
export async function recordSessionEvent(userId: string, session: Session, supabase: SupabaseClient = getDefaultClient()): Promise<void> {
  // Narrower than loadLiveState's retry: only the known-safe auth-layer
  // error is retried here, since retrying an insert on anything else
  // (a genuine timeout, say) can't rule out the first attempt having
  // already landed.
  return withRetry(() => recordSessionEventOnce(userId, session, supabase), isJwtClockSkewError);
}

async function recordSessionEventOnce(userId: string, session: Session, supabase: SupabaseClient): Promise<void> {
  const payload = session.status === "completed" ? { type: session.type, note: session.note } : { type: session.type, excuse: session.excuse };

  const { error } = await supabase.from("events").insert({
    user_id: userId,
    // Anchored at UTC noon — same convention scripts/migrate-to-supabase.ts
    // already uses for date-only sessions, so a date doesn't silently roll
    // to a different calendar day depending on which timezone reads it back.
    occurred_at: `${session.date}T12:00:00Z`,
    kind: session.status === "completed" ? "session_completed" : "session_skipped",
    payload,
  });

  if (error) {
    throw new Error(`Failed to record session event: ${error.message}`);
  }
}

/**
 * Milestone 3.5 — the CLI's write path for food logging, same shape and
 * discipline as recordSessionEvent: `text` is stored verbatim, no
 * nutritional field exists to compute or invent.
 */
export async function recordFoodEvent(userId: string, entry: { date: string; text: string }, supabase: SupabaseClient = getDefaultClient()): Promise<void> {
  return withRetry(() => recordFoodEventOnce(userId, entry, supabase), isJwtClockSkewError);
}

async function recordFoodEventOnce(userId: string, entry: { date: string; text: string }, supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.from("events").insert({
    user_id: userId,
    occurred_at: `${entry.date}T12:00:00Z`,
    kind: "food_logged",
    payload: { text: entry.text },
  });

  if (error) {
    throw new Error(`Failed to record food event: ${error.message}`);
  }
}
