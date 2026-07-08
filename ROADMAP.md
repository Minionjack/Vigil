# The Vigil — Roadmap

12 weeks, solo, evenings/weekends. Each phase has a hard deliverable. Do not start a phase early because it "seems easy".

## Milestone 0 (this week)
Expo skeleton + Drill Sergeant chat with fake profile. See BRIEF.md.
**Done when:** the acceptance test in BRIEF.md passes on my phone.

## Phase 1 — Personality & feel (weeks 1–2)
- Tune Drill Sergeant against real use (me, daily).
- Add Mentor and Hype personalities in /coach-prompts, personality picker on first launch.
- Coach portrait per personality (styled 2D, static is fine).
**Done when:** three distinct coaches, each passes the acceptance test in its own voice.

## Phase 2 — Real memory & backend (weeks 3–4)
- Supabase: auth (email + Apple), profile table, append-only event log (workouts, skips, excuses, PRs).
- Move the API proxy to a Supabase edge function.
- Nightly summarization job: compress old events into a memory digest injected into the system prompt.
**Done when:** coach references something I told it last week, from the DB, not chat history.

## Phase 3 — Workout logging & programming (weeks 6–7)
- Conversational set logging ("bench 80x8 rpe 8") → structured extraction → event log.
- History screen. Basic progressive overload: coach suggests next week's weights from logged data.
**Done when:** full loop — log a session, coach adjusts next session, I can see history.

## Phase 4 — Proactive engine (weeks 8–9) ← the product
- EAS dev build + Apple push credentials (buy Apple Developer account ~week 6).
- pg_cron every 15 min → rules engine: session due, skip detected, streak at risk, morning check-in.
- Rules decide WHEN; Claude writes WHAT in the coach's voice. Push via Expo.
- Optional Apple Health read (sleep) for the morning check-in.
**Done when:** app messages me first, and it names the exact thing I did or didn't do.

## Phase 5 — Polish & beta (weeks 10–12)
- Streak/consistency dashboard, voice input (on-device STT), notification settings, onboarding flow.
- TestFlight beta, 10–20 users.
**Beta success:** 60%+ proactive-message open rate; users logging 3+ sessions/week by week 4; at least one unprompted "it called me out and I actually went".

## Cut list (not before beta proves the loop)
3D avatar, computer vision form analysis, nutrition, gym location detection, outbound voice calls, Android polish.
