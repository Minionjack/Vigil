// Supabase Edge Function — GET/POST /history
//
// BRIEF-PHASE3.md's History screen: reverse-chron session list plus one
// per-lift trend line, both computed server-side (the client stays dumb,
// per CLAUDE.md). Same auth pattern as chat/index.ts — a normal user
// session, RLS-scoped, no service-role key needed for a read.

import { createClient } from "npm:@supabase/supabase-js@2";
import { computeLiftTrends } from "../_shared/core/trends.ts";
import { computeDashboardStats } from "../_shared/core/dashboard.ts";
import type { CoreSession } from "../_shared/core/stats.ts";

const DASHBOARD_WEEKS_BACK = 4;

interface EventRow {
  occurred_at: string;
  kind: string;
  payload: Record<string, unknown>;
}

interface SessionSummary {
  date: string;
  type: string;
  status: "completed" | "skipped";
  note?: string;
  excuse?: string;
  exercises?: { exercise: string; weight_kg: number; reps: number; sets: number; rpe?: number }[];
}

function sessionSummary(e: EventRow): SessionSummary {
  const date = e.occurred_at.slice(0, 10);
  const type = String(e.payload.type ?? "Unknown");
  if (e.kind === "session_skipped") {
    return { date, type, status: "skipped", excuse: e.payload.excuse as string | undefined };
  }
  // Old-shape rows (migrated pre-Phase-3 data, or a CLI-only write) have
  // no `exercises` array — the client falls back to showing `note` for
  // those, same compatibility rule computeLiftTrends already follows.
  const exercises = Array.isArray(e.payload.exercises) ? (e.payload.exercises as SessionSummary["exercises"]) : undefined;
  return { date, type, status: "completed", note: e.payload.note as string | undefined, exercises };
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "GET or POST only" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const [{ data: events, error }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("events")
      .select("occurred_at, kind, payload")
      .eq("user_id", user.id)
      .in("kind", ["session_completed", "session_skipped"])
      .order("occurred_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("training_days").eq("user_id", user.id).single(),
  ]);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: profileError?.message ?? "No profile for this user." }), { status: 404 });
  }

  const allEvents = events ?? [];
  const sessions = allEvents.map(sessionSummary);
  const trends = computeLiftTrends(allEvents);

  const today = new Date().toISOString().slice(0, 10);
  const coreSessions: CoreSession[] = sessions.map((s) => ({ date: s.date, type: s.type, status: s.status, excuse: s.excuse }));
  const dashboardStats = computeDashboardStats(coreSessions, profile.training_days as string[], today, DASHBOARD_WEEKS_BACK);

  return new Response(JSON.stringify({ sessions, trends, dashboardStats }), { headers: { "Content-Type": "application/json" } });
});
