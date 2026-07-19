# Milestone 4 — Proactive Engine on Real Infrastructure

> **GATED** on Phase 2 done (event log is the source of truth) and the
> Apple Developer account purchased (~week 6 per roadmap). Phase 3 is not
> a hard dependency — proactive can ship against CLI-logged data — but if
> Phase 3 is done, its computed next-session loads feed the nudges.

**Goal:** The app messages me first, through real push notifications, from
the cloud — no laptop, no home Mac, no ntfy. Success = phone in pocket,
every machine I own asleep, and the 17:45 nudge still lands, naming the
exact thing I did or didn't do.

## Why this shape
Milestone 0.5 already proved the hard part: the rules, the anti-fabrication
layer, the anti-nag caps, the outcome scoring. Phase 4 is a **port, not a
rewrite** — the stub's `rules.ts` moves nearly verbatim, and its unit tests
move with it. New code is delivery plumbing only. The experiment's
instrumentation (journal → act rate) is NOT scaffolding to be discarded:
it becomes a permanent product feature, because act rate per rule is the
product's own health metric.

## Build exactly this

### 1. Scheduler & rules, server-side
- `pg_cron` every 15 minutes → edge function `proactive-check`.
- Port `evaluateRules`, `computeAcknowledgment`, and the tz helpers from
  `packages/core` (they moved there in Phase 2). Rules read `events` +
  `profiles`; fired nudges and outcomes are `events` rows (`nudge_fired`,
  `nudge_outcome`) — the journal IS the event log now.
- All caps and quiet hours enforced exactly as the stub does, per-user
  timezone. The de-dup keys (daily/weekly) come from the event log — verify
  the burst-tick idempotency holds under pg_cron the same way it was
  verified under launchd catch-up ticks.

### 2. Real push
- EAS dev build (the Expo Go era ends here), APNs credentials, Expo push
  tokens stored per device in a `push_tokens` table.
- Delivery: edge function → Expo push service. Delivery receipts recorded
  on the `nudge_fired` event (delivered / failed / token dead). A dead
  token disables that device's sends and surfaces in the app.
- Tapping a nudge deep-links into the chat with the coach, nudge text
  pre-loaded as context — replying to a nudge IS the conversation. (The
  stub was outbound-only; this closes the loop the cheap way.)

### 3. Morning check-in + optional Apple Health sleep
- New rule R6: morning check-in on training days (once, inside quiet-hours
  rules) — plan for the day, computed next-session load if Phase 3 is live.
  On the first training day of the week, R6 also carries a weekly weigh-in
  reminder ("log your weight before Wednesday") — no new rule, no new cron
  cadence, just a clause folded into the existing morning check-in. It
  cites the last logged `weight_kg` and its date (Phase 2's `weight_logged`
  event) and nothing else — no trend, no rate, no projection toward the
  September goal; that arithmetic stays banned.
- Apple Health sleep read (opt-in): last night's sleep duration enters
  **Verified stats as a raw number** ("Sleep last night: 5h48m"). The
  LESSONS.md wearable warning applies with full force: no code and no
  prompt may characterize trends ("recovery trending down") — if a trend
  matters, compute it as a number (7-day avg) or don't say it. The coach
  may react to the number in voice; it may not invent its meaning.

### 4. Decommission ceremony
- The home Mac's launchd/cron job is removed the day cloud nudges are
  verified for three consecutive days. `state.json` and `journal.jsonl`
  are archived into the repo's private history via the Phase 2 migration
  path (if not already imported). One brain, in the cloud, forever after.

## Acceptance test
1. All devices I own asleep or off. Training day, nothing logged by 17:45
   → real push arrives naming the session, the computed load, and the
   week's completion count. Every figure traces to the event log.
2. Log the session (chat or CLI) → the outcome event resolves the nudge as
   acted; no R2 the next morning.
3. Force two pg_cron ticks in quick succession (manual invoke) → exactly
   one nudge, cap and de-dup intact.
4. Sleep opt-in on: morning check-in quotes last night's number exactly as
   HealthKit reports it; grep the assembled prompt → no trend adjectives
   attached to sleep anywhere.
5. Kill the app, revoke nothing: nudges still arrive (push is server-sent,
   not app-polled).

## Out of scope — do not build even if easy
Android push (iOS only until beta), location/geofencing, outbound voice or
calls, HRV/recovery scores beyond sleep duration, notification content
A/B'ing, any new rules beyond R6 (rule tuning is data-driven, post-beta).
Calorie/macro tracking, nutrition advice, daily weigh-ins (weekly only —
see BRIEF-PHASE2.md).

## Done when
Five acceptance tests pass, the home Mac job is removed, and a full week of
cloud-fired nudges shows act-rate instrumentation working per-rule in
production — the same `score` read-out, now a SQL query.
