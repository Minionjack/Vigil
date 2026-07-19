# Milestone 5 — Polish & Beta

> **GATED** on Phase 4 done (cloud proactive verified in production for a
> full week). Beta users receive the real product or nothing.

**Goal:** 10–20 strangers on TestFlight living with a coach that texts
first. Success per the roadmap's own bar: 60%+ proactive-message open
rate; users logging 3+ sessions/week by week 4; at least one unprompted
"it called me out and I actually went."

## Why this shape
Everything before this was n=1. Phase 5's entire job is finding out which
parts of the loop were true about *people* and which were true about
*Jack*. That means instrumentation and configurability get built to the
same standard as features — a beta that can't measure itself is a demo.

## Build exactly this

### 1. Onboarding flow
- Profile: name, goal (free text — the coach quotes it back verbatim,
  never computes on it), training days, usual time, timezone (detected,
  confirmable).
- Program setup v1: pick a template (PPL, Upper/Lower, Full-body 3x) with
  editable starting loads — no custom program builder.
- Personality picker (Phase 1's screen, now in the flow) + notification
  permission ask, framed honestly: "This coach texts first. That's the
  point." Decline path exists but the app says plainly what it costs.

### 2. Notification settings — the anti-nag as product surface
- User-configurable: max nudges/day (default 2, ceiling 3), quiet hours,
  per-rule toggles (R3 pattern alerts off-switchable — some people can't
  hear that tone from a robot; better a narrower coach than a muted one).
- A visible "why did I get this?" on every nudge: which rule fired, from
  which logged facts. The Verified-stats discipline becomes user-facing
  transparency — the coach shows its receipts.

### 3. Consistency dashboard
- One screen: current streak, sessions/week vs plan (trailing 4 weeks),
  per-type completion, per-lift top-set trends (Phase 3's line, promoted).
  All computed server-side from events. No gamification beyond the streak
  — badges are Phase Never until users ask.

### 4. Voice input
- On-device STT (iOS dictation API) feeding the existing chat + extraction
  pipeline. No audio leaves the device; no custom models. It's a keyboard
  alternative, not a feature — sweat-hands logging is the use case.

### 5. Beta instrumentation & operations
- Per-user, per-rule: sent / delivered / opened / acted (the score query,
  productionized). Weekly cohort read-out script.
- Feedback: a "flag this message" action on any nudge (annoying / wrong /
  great) writing an event — tone failures become data, exactly like the
  experiment's journal notes did.
- Data honesty for real users: behavioral data and message content are
  sensitive. Privacy note in onboarding, delete-my-account actually
  deletes (the append-only log gets a `user_erased` tombstone + hard
  delete job), no analytics SDKs — our own events are enough.
- TestFlight: 10–20 users, recruited from the Phase-0 interview pool if
  that homework got done. Two cohorts two weeks apart so week-1 fixes
  reach cohort 2.

## Acceptance test
1. A stranger onboards unassisted in under 5 minutes and receives their
   first correctly-personalized nudge within 24h.
2. Every nudge in a sampled week shows its receipts correctly ("why did I
   get this?" traces to real events).
3. A user flags a message — it appears in the weekly read-out with full
   context.
4. Delete-my-account leaves zero rows recoverable by the app role.
5. The beta metrics read-out runs from one script and answers the
   roadmap's three success bars without manual counting.

## Out of scope — do not build even if easy
Android, payments/subscriptions, social features, coach marketplace, 3D
avatars, computer-vision form checks, nutrition, gym detection, outbound
voice — the entire cut list stays cut until beta proves the loop.

## Done when
Two cohorts complete four weeks, the read-out answers all three success
bars with real numbers, and the decision that follows — build toward
launch, iterate, or stop — is written down the way DECISION-GATE.md was:
before anyone's pride has a stake in the answer.
