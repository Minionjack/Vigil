import { test, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadLiveState, recordSessionEvent } from "./db.js";

const localConfig = {
  current_program: { name: "test program", next_session: { type: "Push", planned: ["Bench"] } },
  journal_config: { max_messages_per_day: 2, quiet_hours: { before: "06:30", after: "21:30" }, delivery: { method: "ntfy", topic: "t" } },
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
  expect(state.current_program).toEqual(localConfig.current_program);
  expect(state.journal_config).toEqual(localConfig.journal_config);
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

