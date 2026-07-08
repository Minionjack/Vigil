# Milestone 0.5 — Proactive Stub ("the app texts first")

**Goal:** For two weeks, SGT VIGIL messages me unprompted at the moments a real coach would — and I measure whether it changes what I do. This is a throwaway harness to test the product thesis before building Phase 2/4 infrastructure.

**Explicitly throwaway.** No Supabase, no push notifications, no EAS build, no new app screens. A Node script + cron on my laptop + delivery via the cheapest channel that reaches my phone.

## Architecture

```
cron (laptop) → check.ts → reads state.json → rules engine →
  if a rule fires → Claude writes the message (proactive prompt) → deliver → log to journal.jsonl
```

### 1. State file — `state.json`
Single source of truth, edited by me (or via a tiny `log` command). Schema in `state.example.json`. Tracks: training days + usual time, sessions (date, type, completed/skipped, excuse if skipped), current program's next session, and goal.

### 2. Logging command — `npm run log`
Interactive one-liner so updating state costs me 10 seconds, because if logging is annoying the experiment dies:
- `npm run log done pull "rows 5x5@72.5"` → appends a completed session
- `npm run log skip legs "work dinner"` → appends a skip + excuse
Nothing fancier. No parsing of natural language needed here.

### 3. Rules engine — deterministic, checked on every cron run
Rules decide WHEN. Claude decides WHAT TO SAY. Never let the LLM decide whether to message.

| # | Rule | Fires when | Max frequency |
|---|------|-----------|---------------|
| R1 | Pre-session nudge | Today is a training day, no session logged yet, current time ≥ (usual_time − 45min) | once/day |
| R2 | No-show follow-up | Yesterday was a training day and no session was logged for it | once/day, next morning |
| R3 | Pattern alert | Same session type skipped ≥2 times in trailing 21 days | once/week |
| R4 | Streak guard | Completed sessions this week < scheduled and it's the last training day of the week | once/week |
| R5 | Respect (anti-nag) | If R1 fired and I completed the session → next message must open by acknowledging it | modifier, not a message |

Hard cap: **max 2 proactive messages per day.** A coach who spams gets muted; the anti-nag rule is as much a part of the thesis as the nudge.

### 4. Message generation
Call Claude with: `coach-prompts/drill-sergeant.md` + `coach-prompts/proactive-extension.md` + current state.json rendered readable + which rule fired + today's date/time. Output: ONE message, ≤50 words. No conversation — this is outbound only for now. If I want to reply, I open the app (the existing chat proxy can read the same state.json so both stay consistent).

### 5. Delivery
Cheapest thing that produces a real notification on my phone. In order of preference:
1. **ntfy.sh** — free, no account, `curl -d "message" ntfy.sh/my-secret-topic`, native iOS app with push. Recommended.
2. Email to self (worse: no urgency).
Pick 1 unless there's a blocker.

### 6. Journal — `journal.jsonl`
Every fired message appends: `{timestamp, rule, message_text, delivered}`. I append the outcome manually each evening (or via `npm run log`): `{acted: true/false, note}`. This file IS the experiment result.

## Cron schedule
Every 30 min between 06:30 and 21:30. The rules make it quiet; the schedule just gives them chances to fire. (Laptop asleep = missed checks — acceptable for a stub. Note misses in the journal if relevant.)

## The experiment protocol (2 weeks)
- Weeks of 13 Jul and 20 Jul. No rule changes mid-week; tune prompts only between weeks.
- Score at the end: (a) messages sent per rule, (b) act rate — % of R1/R2 messages followed by a completed session same day or next, (c) the one metric that matters: **did legs day happen ≥2 of 2 weeks**, (d) subjective: did any message annoy me enough to want it gone.
- Decision gate: act rate meaningfully above my recent baseline (legs 1 of 3) → green-light Phase 2 (real memory) then Phase 4 (real push). Flat → the thesis needs rethinking before any infra gets built.

## Out of scope
Two-way conversation from notifications, wearable data, multiple personalities, any UI. Do not build.
