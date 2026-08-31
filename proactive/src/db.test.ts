import { test, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLiveState, recordSessionEvent, recordFoodEvent } from "./db.js";

const localConfig = {
  journal_config: { max_messages_per_day: 2, quiet_hours: { before: "06:30", after: "21:30" }, delivery: { method: "ntfy", topic: "t" } },
};

const PROGRAM_CHANGED_EVENT = {
  occurred_at: "2026-07-15T12:00:00Z",
  kind: "program_changed",
  payload: {
    name: "test program",
    next_session: { type: "Push", planned: ["Bench"] },
    exercises: [{ exercise: "Bench press", sessionType: "Push", targetReps: 6, targetSets: 4, category: "upper", seedWeight_kg: 80 }],
  },
};

// A minimal fake matching just the chain shapes db.ts actually calls —
// not a general-purpose Supabase mock, so it stays honest about what
// this module depends on.
function fakeClient(opts: { profile?: unknown; profileError?: unknown; events?: unknown[]; eventsError?: unknown; insertError?: unknown }) {
  const insertedRows: unknown[] = [];
  const client = {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: opts.profile ?? null, error: opts.profileError ?? null }),
            }),
          }),
        };
      }
      if (table === "events") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: async () => ({ data: opts.events ?? [], error: opts.eventsError ?? null }),
              }),
            }),
          }),
          insert: async (row: unknown) => {
            insertedRows.push(row);
            return { error: opts.insertError ?? null };
          },
        };
      }
      throw new Error(`fakeClient: unexpected table "${table}"`);
    },
  };
  return { client: client as unknown as SupabaseClient, insertedRows };
}

test("loadLiveState maps a profile row + event rows into the State shape rules.ts/message.ts expect", async () => {
  const { client } = fakeClient({
    profile: {
      name: "Jack",
      goal: "test goal",
      training_days: ["Monday", "Wednesday", "Friday"],
      usual_session_time: "18:30:00", // Postgres `time` comes back with seconds
      timezone: "Asia/Dubai",
      personality: "mentor",
    },
    events: [
      { occurred_at: "2026-07-25T12:00:00Z", kind: "session_completed", payload: { type: "Legs", note: "felt strong" } },
      { occurred_at: "2026-07-01T12:00:00Z", kind: "session_skipped", payload: { type: "Legs", excuse: "too tired" } },
      { occurred_at: "2026-07-20T09:00:00Z", kind: "nudge_fired", payload: { rule: "R1" } }, // must be filtered out
      PROGRAM_CHANGED_EVENT,
    ],
  });

  const state = await loadLiveState("user-1", client, localConfig);

  expect(state.client).toEqual({
    name: "Jack",
    goal: "test goal",
    training_days: ["Monday", "Wednesday", "Friday"],
    usual_session_time: "18:30", // seconds trimmed
    timezone: "Asia/Dubai",
    personality: "mentor",
  });
  expect(state.sessions).toEqual([
    { date: "2026-07-25", type: "Legs", status: "completed", note: "felt strong", excuse: undefined },
    { date: "2026-07-01", type: "Legs", status: "skipped", note: undefined, excuse: "too tired" },
  ]);
  // current_program now comes from the latest program_changed event, not
  // local-config.json — this is what lets chat and proactive read the
  // literal same program data.
  expect(state.current_program).toEqual({ name: "test program", next_session: { type: "Push", planned: ["Bench"] } });
  expect(state.suggestions).toBeDefined();
  expect(state.suggestions?.[0].exercise).toBe("Bench press");
  expect(state.journal_config).toEqual(localConfig.journal_config);
});

test("loadLiveState falls back to a placeholder program rather than crashing when no program_changed event exists yet", async () => {
  const { client } = fakeClient({
    profile: { name: "Jack", goal: "g", training_days: [], usual_session_time: "18:30:00", timezone: "Asia/Dubai", personality: "mentor" },
    events: [],
  });
  const state = await loadLiveState("user-1", client, localConfig);
  expect(state.current_program.name).toBe("No program set");
  expect(state.suggestions).toBeUndefined();
});

test("loadLiveState throws rather than silently proceeding when no profile row exists", async () => {
  const { client } = fakeClient({ profile: null, events: [] });
  await expect(loadLiveState("missing-user", client, localConfig)).rejects.toThrow(/no profile row/);
});

test("recordSessionEvent inserts a completed session as an events row with the right kind and payload", async () => {
  const { client, insertedRows } = fakeClient({});
  await recordSessionEvent("user-1", { date: "2026-08-01", type: "Pull", status: "completed", note: "rows 5x5@75" }, client);

  expect(insertedRows).toEqual([
    {
      user_id: "user-1",
      occurred_at: "2026-08-01T12:00:00Z",
      kind: "session_completed",
      payload: { type: "Pull", note: "rows 5x5@75" },
    },
  ]);
});

test("recordSessionEvent inserts a skipped session with an excuse, not a note", async () => {
  const { client, insertedRows } = fakeClient({});
  await recordSessionEvent("user-1", { date: "2026-08-01", type: "Legs", status: "skipped", excuse: "traveling" }, client);

  expect(insertedRows).toEqual([
    {
      user_id: "user-1",
      occurred_at: "2026-08-01T12:00:00Z",
      kind: "session_skipped",
      payload: { type: "Legs", excuse: "traveling" },
    },
  ]);
});

test("recordSessionEvent surfaces an insert error instead of swallowing it", async () => {
  const { client } = fakeClient({ insertError: { message: "constraint violation" } });
  await expect(
    recordSessionEvent("user-1", { date: "2026-08-01", type: "Pull", status: "completed", note: "x" }, client)
  ).rejects.toThrow(/constraint violation/);
});

test("loadLiveState surfaces an events-query error instead of silently returning an empty session list", async () => {
  const { client } = fakeClient({ profile: { name: "Jack" }, eventsError: { message: "network blip" } });
  await expect(loadLiveState("user-1", client, localConfig)).rejects.toThrow(/network blip/);
});

test("recordFoodEvent with no estimate writes just text, exactly as before this feature existed", async () => {
  const { client, insertedRows } = fakeClient({});
  await recordFoodEvent("user-1", { date: "2026-08-26", text: "chicken and rice" }, client);

  expect(insertedRows).toEqual([
    {
      user_id: "user-1",
      occurred_at: "2026-08-26T12:00:00Z",
      kind: "food_logged",
      payload: { text: "chicken and rice" },
    },
  ]);
});

test("recordFoodEvent with calories_est and source attaches all three provenance fields, estimated_at set by this call", async () => {
  const { client, insertedRows } = fakeClient({});
  await recordFoodEvent("user-1", { date: "2026-08-26", text: "chicken and rice", calories_est: 650, source: "gemini" }, client);

  expect(insertedRows).toHaveLength(1);
  const row = insertedRows[0] as { payload: { text: string; calories_est: number; source: string; estimated_at: string } };
  expect(row.payload.text).toBe("chicken and rice");
  expect(row.payload.calories_est).toBe(650);
  expect(row.payload.source).toBe("gemini");
  expect(new Date(row.payload.estimated_at).toString()).not.toBe("Invalid Date");
});

test("recordFoodEvent with only calories_est (no source) fails loudly rather than writing a partial estimate", async () => {
  const { client, insertedRows } = fakeClient({});
  await expect(recordFoodEvent("user-1", { date: "2026-08-26", text: "mystery meal", calories_est: 400 }, client)).rejects.toThrow(
    /Incomplete calorie-estimate provenance/
  );
  expect(insertedRows).toEqual([]); // the failed validation must run before the insert, not after
});

