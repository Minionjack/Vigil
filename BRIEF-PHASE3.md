# Milestone 3 — Workout Logging & Programming

> **GATED** on Phase 2 done (all four acceptance tests passed, one event
> log live). This phase writes to that log and computes from it — without
> Phase 2 it has nowhere to stand.

**Goal:** The full loop — log a session by talking, see history, and the
coach proposes next week's weights from what I actually lifted. Success =
one conversational message logs a structured session, and the following
week's suggested loads are computed (not guessed), explained, and correct.

## Why this shape
Two new fabrication surfaces open here, and both get the same treatment as
every previous one — the model phrases, code decides:

1. **Extraction**: "bench 80x8 rpe 8" — structured event is an LLM parse.
   A silent mis-parse (85 for 80) corrupts the event log — the one thing
   in the system that must never lie. So: extraction is always **echoed
   back for confirmation before writing**. No confirmed echo, no event.
2. **Progression**: next week's weights are the model's most tempting
   invention yet. They are therefore computed by a deterministic function;
   Claude only explains them.

## Build exactly this

### 1. Conversational logging (chat surface)
- Intent detection in the chat flow: messages that look like set logs get
  routed to an extraction call (separate, small, structured-output prompt —
  not the coach personality) returning `{exercise, weight, reps, sets?,
  rpe?, type?}` with an explicit `confidence` per field.
- The coach echoes the parse in its own voice: "Logging: bench 4x8 @ 80,
  RPE 8, under Push. Confirm?" — one tap / "yes" writes the
  `session_completed` (or appends sets to today's open session). Anything
  ambiguous or low-confidence is asked about, never assumed.
- `npm run log` CLI stays. Two writers, one log.

### 2. History screen (the-vigil app)
- Reverse-chron session list from `events`: date, type, sets summary,
  done/skipped badge, excuse text on skips. Tap → session detail.
- One trend element only: per-lift top-set weight over time (simple line,
  computed server-side). No dashboard sprawl — that's Phase 5.

### 3. Progressive overload engine (packages/core)
- `suggestNextSession(program, events)` — pure, unit-tested. v1 rules,
  deliberately dumb and legible:
  - All target reps hit at RPE ≤ 8 → +2.5kg next time (upper), +5kg (lower).
  - RPE 9–10 or missed reps → repeat load.
  - Two consecutive repeats without progress → deload 10%, flag for the
    coach to address.
  - Session type skipped ≥2 weeks → restart that lift at last completed
    load, no phantom progression.
- Output feeds the Verified stats block as `Suggested next: bench 82.5
  (last: 80 @ RPE 9 — repeat was due, but 07-03 cleared it)` — the coach
  cites and motivates, never adjusts the number.
- The coach may DISAGREE in voice ("I'd have given you more") but the
  logged suggestion is the function's. If the athlete overrides, that's an
  event (`kind: override`) — data, not drift.

## Acceptance test
1. Text "did push tonight — bench 82.5 for 4x6, last set rpe 9, incline
   30s x10x3" → coach echoes the parse → confirm → event lands in the log
   with correct payload; proactive rules see it (no R2 tomorrow).
2. Text something ambiguous ("did some pressing, felt heavy") → coach asks,
   does not write.
3. History screen shows the session; the bench trend line includes it.
4. Next Push's R1 nudge and the chat coach both quote the SAME computed
   next-session load, and it matches a hand-check of the v1 rules.

## Out of scope — do not build even if easy
Nutrition anything, exercise database/autocomplete beyond what extraction
needs, program *builder* UI (program is still a definition in the profile),
percentage-based/periodized programming (v1 rules only), voice input
(Phase 5), photos/video.

## Done when
All four acceptance tests pass, the event log contains zero unconfirmed
LLM-written entries, and I've used conversational logging as my primary
method for one full training week without touching the CLI.
