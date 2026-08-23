// Supabase Edge Function — nightly-digest
//
// UNVERIFIED, same caveats as functions/chat/index.ts: written against
// Supabase's documented conventions, never deployed. The trigger mechanism
// itself also isn't configured yet — this function needs to be invoked on
// a schedule (Supabase's Scheduled Edge Functions, or a pg_cron job that
// calls it via net.http_post) once the project exists. See
// SUPABASE-SETUP.md.
//
// For each user with a profile, summarizes the previous UTC day's events
// into a memory_digests row. Per BRIEF-PHASE2.md §4 this is the highest
// fabrication risk in the roadmap — the actual prompt-construction and
// no-digits constraint live in packages/core/src/digest.ts, which has a
// real regression test (packages/core/src/generateDigest.test.ts) that
// runs today, independent of this function ever being deployed.

import { createClient } from "npm:@supabase/supabase-js@2";
import { generateDigest, type DigestEvent } from "../../../packages/core/src/index.ts";

Deno.serve(async (_req) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);
  const periodStartStr = periodStart.toISOString().slice(0, 10);
  const periodEndStr = periodEnd.toISOString().slice(0, 10);

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("user_id");
  if (profilesError) {
    return new Response(JSON.stringify({ error: profilesError.message }), { status: 500 });
  }

  const results: { user_id: string; ok: boolean }[] = [];

  for (const { user_id } of profiles ?? []) {
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("occurred_at, kind, payload")
      .eq("user_id", user_id)
      .gte("occurred_at", periodStart.toISOString())
      .lt("occurred_at", periodEnd.toISOString());

    if (eventsError) {
      results.push({ user_id, ok: false });
      continue;
    }

    const digestEvents: DigestEvent[] = (events ?? []).map((e) => ({ occurred_at: e.occurred_at, kind: e.kind, payload: e.payload }));
    const digest = await generateDigest(digestEvents, periodStartStr, periodEndStr);

    const { error: insertError } = await supabase.from("memory_digests").insert({
      user_id,
      period_start: periodStartStr,
      period_end: periodEndStr,
      digest,
      model: "claude-sonnet-4-6",
    });

    results.push({ user_id, ok: !insertError });
  }

  return new Response(JSON.stringify({ periodStart: periodStartStr, periodEnd: periodEndStr, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
