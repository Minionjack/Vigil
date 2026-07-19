# Milestone 2 — Real Memory & One Source of Truth

> **GATED.** Do not start this phase before the 2026-07-27 read-out. Green per
> DECISION-GATE.md — start. Yellow — iterate the stub two more weeks first.
> Red — this brief is dead; do not build it because it's already written.

**Goal:** The coach remembers me from the database, not from chat history — and
both surfaces (chat and proactive) read and write the *same* memory. Success =
the coach references something I told it more than a week ago, sourced from the
DB, and logging a session in one place is instantly known to the other.

## Why this shape (lessons paid for in Milestone 0/0.5)

1. **The split-brain gap is the #1 structural debt.** Chat reads
   `fake-profile.json`; proactive reads `proactive/state.json`. Telling one
   surface something the other never learns broke coherence during the
   experiment. Phase 2 exists to kill this: one event log, everything derives
   from it.
2. **Nothing hand-authored enters a prompt as fact** (LESSONS.md). The event
   log stores *raw events only*. Every derived claim — counts, streaks,
   weekdays, "next session", gaps — is computed in code/SQL and rendered as a
   Verified stats block. This rule survived three fabrication incidents;
   it is the constitution of this phase, not a guideline.
3. **`next_session` regressed twice because a human maintained it.** In Phase 2
   it is not stored at all: it is computed from the program definition + the
   event log. There is no field to drift.
4. **Duplicated logic drifts** (`computeSessionStats` exists twice, with
   incompatible shapes and a timezone inconsistency). Phase 2 introduces one
   shared package; both surfaces import from it. Delete both old copies.
5. **Half the stated goal has no data path.** "Lose 8kg by 30 September 2026
   and bench 100kg" is bipartite; every phase before this review computed and
   cited the strength half only. Left alone, "how's the weight loss going"
   becomes the `patterns_noted` setup all over again — a live coach question
   with nothing computed to answer it from. Phase 2 adds the raw event;
   nothing past that ever renders a trend — same physics as sleep in Phase 4.

## Build exactly this

### 1. Supabase project
- Auth: email + Apple. Single user (me) but schema'd for multi-user from day
  one (every table keyed by `user_id`) — cheap now, painful later.
- Tables:
  - `profiles` — name, goal (text), training_days, usual_session_time,
    timezone. The *only* hand-editable table.
  - `events` — append-only. `id, user_id, ts (timestamptz), kind, payload
    (jsonb)`. Kinds at minimum: `session_completed`, `session_skipped`
    (payload includes excuse), `weight_logged` (payload: `weight_kg`),
    `nudge_fired`, `nudge_outcome`, `note`, `program_changed`. No UPDATE or
    DELETE grants on this table for the app role — corrections are new
    events (`kind: correction` referencing the event they amend).
  - `memory_digests` — nightly LLM summaries. Columns: `period_start`,
    `period_end`, `digest (text)`, `model`, `created_at`. **Digests are
    labeled impressions, never facts** — see §4.
- Row-level security on from the start, even solo.

### 2. Shared core package (`packages/core`)
- All date/timezone helpers (lift from `proactive/src/rules.ts`, the hardened
  tz-aware versions — the server's implicit-timezone `dayOfWeek()` dies here).
- `computeSessionStats`, `renderVerifiedStats`, `computeNextScheduledSession`
  — single implementations, unit tests move with them.
- New: `daysSince(type)` — the still-open inference gap from the original
  status audit, never yet touched by any commit. (Not to be confused with
  the future-weekday gap, which commit `0c6a9e6` already closed via
  `computeNextScheduledSession`.)
- `renderVerifiedStats` also renders weight: the last logged `weight_kg` and
  its date, plus the full dated history on request — a number and a date,
  never a rate. No `kg/week` figure or projection toward the September goal
  is ever computed here or anywhere else; that arithmetic stays banned,
  exactly as the R3 prompt fix already established for lifts.
- Both the edge function and any remaining local scripts import from this
  package. The two old copies are deleted in the same PR that creates it.

### 3. API proxy — Supabase edge function
- `POST /chat` moves to an edge function. Same contract as today. System
  prompt assembled server-side from: personality md + Verified stats
  (computed from `events`) + latest memory digests + profile.
- Anthropic key lives in Supabase secrets. The Expo app's hardcoded LAN IP
  config dies; it points at the Supabase URL.
- `npm run log` becomes a thin client that inserts `events` rows (keep the
  CLI — it's proven; just change where it writes). `--date` backfill flag
  preserved.

### 4. Nightly memory summarization — the dangerous part, designed cold
This job is the highest fabrication risk in the entire roadmap: an LLM
writing summaries that later re-enter prompts as if they were ground truth
is `patterns_noted` industrialized. Constraints, non-negotiable:

- The digest prompt receives ONLY raw events + computed Verified stats for
  its period. It summarizes *qualitative* texture (excuse themes, tone of
  notes, what was said in chats) — it is FORBIDDEN from stating numbers,
  streaks, or dates, because those are always available fresher and truer
  from the computed block.
- Digests are injected into coach prompts under an explicit header:
  `## Coach's impressions (LLM-written summaries — cite themes, never
  numbers; all numbers come from Verified stats above)`.
- A regression test feeds a synthetic period through the digest prompt and
  asserts the output contains no digits. Crude, effective, honest about what
  it is.
- Digests are append-only like everything else; a bad digest is superseded,
  never edited.

### 5. Experiment continuity & migration
- The Milestone 0.5 stub keeps running untouched through 2026-07-26. Phase 2
  work happens in parallel branches; nothing deploys to the home Mac
  mid-experiment.
- Migration script: import `journal.jsonl` (fired + outcome entries) and
  `state.json` sessions as the first rows of `events`, timestamps preserved.
  The experiment's data is the seed corpus — it is not left behind.
- The proactive stub is then retargeted: `check.ts` reads state via a small
  adapter over Supabase instead of `state.json`. Rules engine, prompts, and
  delivery are UNCHANGED — real push and pg_cron are Phase 4, not now.

## Acceptance test (all four, on my phone, before calling it done)
1. Tell the chat coach a qualitative fact ("my left shoulder clicks on
   incline"). Seven+ days and several digests later, open a fresh
   conversation: the coach references it unprompted when incline comes up —
   sourced from digests, with chat history cleared.
2. `npm run log -- done pull "rows 5x5@75"` — within one proactive tick, the
   rules engine sees it (no R2 fires next morning), AND the chat coach cites
   the 75kg from Verified stats. One write, both surfaces know.
3. Hand-editing `next_session` is impossible — the field doesn't exist.
   Complete a Push session; the computed next session advances correctly,
   verified against the program definition.
4. Grep the assembled system prompt (debug endpoint): every number in it
   appears in the Verified stats block. Digest sections contain zero digits.

## Out of scope — do not build even if easy
Push notifications & pg_cron proactive (Phase 4). Conversational set logging
and programming logic (Phase 3). Additional personalities (Phase 1, may run
before or parallel — its own brief). Wearables, voice, avatars. Calorie or
macro tracking, nutrition advice, and daily weigh-ins — weight logging is
weekly cadence only, and the reminder lives in Phase 4's R6, not here. Any
UI beyond repointing the existing chat screen. Multi-user onboarding flows
(schema supports it; product doesn't yet).

## Done when
All four acceptance tests pass, the two duplicated stat implementations are
deleted, and the home Mac's stub runs against Supabase state for three
consecutive days without a fabricated claim or a missed/duplicate nudge.
