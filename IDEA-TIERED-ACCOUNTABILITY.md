# Idea — Tiered Accountability Intensity

Dated 2026-07-25. Written the same day DECISION-GATE.md returned Red.

**Provenance, stated plainly:** this is a design change proposed *after*
reading an unwelcome verdict, not a correction to it. DECISION-GATE.md's
Red stands as written, on the data collected, for the system as tested.
Nothing below reopens that. This document exists so the idea doesn't get
lost, and so whoever reads it later — including me — can see exactly when
and why it was proposed, rather than mistaking it for something that was
tested and passed.

## The idea

Milestone 0.5 tested one voice at one fixed intensity: drill-sergeant,
full accountability, from day one, uniformly across all session types.
The proposal is a **tiered system**, level 1 through level 5, where the
coach's intensity and the rigidity of the schedule scale with something —
readiness, self-reported preference, or demonstrated consistency — rather
than being uniform from the first message.

Rough shape, undesigned in detail:

- **Level 1** — low pressure, any movement counts, no fixed schedule.
  Closer to "did you move your body today" than "did you complete Push
  per the program."
- **Level 3** — a defined program, moderate accountability, nudges but no
  streak-guard tone.
- **Level 5** — what got built and tested: drill sergeant, tight schedule,
  full R1–R4 nudge stack, zero slack.
- Graduation between levels: undefined. Time-based? Consistency-based
  (N sessions at current level before offering the next)? Self-selected?
  This needs real design before anything gets built, not assumed.

## Why it's a real idea, not just a convenient one

Worth being honest that this idea surfaced in a conversation where earlier
framings ("any session should count," "we only tested one voice") were
also proposed and were correctly pushed back on as attempts to soften the
Red verdict rather than learn from it. This one is different in kind: it
doesn't ask to reinterpret what already happened, and it doesn't erase the
finding — R2's 50% act rate under maximum intensity, paired with legs
still failing, suggests intensity alone isn't the lever, and a system that
never varies intensity can't tell that apart from "intensity was too high
for this specific avoidance." That's a real gap in what Milestone 0.5 was
capable of measuring, not a reason to distrust what it did measure.

## Why it's still just a hypothesis

The instinct for reaching for it *right now*, same-day as a Red verdict,
is suspect on its face — it's the reading that keeps the project alive
without contradicting the log, which is exactly the shape rationalization
takes. The idea may be correct. It is currently unfalsified in either
direction. Nothing here is evidence it works; it's a proposal for how one
might find out.

## What this does NOT do

- Does not unfreeze Phase 1, 2, 3, 4, or 5. All five remain gated exactly
  as DECISION-GATE.md and their own brief headers say. Red = dead stands.
- Is not itself gated on anything, because it isn't a build item yet — it's
  a hypothesis waiting on a test design.

## What a legitimate next step would look like, if one is ever taken

Not "build Phase 1's three personalities and see." A cleaner test of *this
specific* idea would need:

1. A gate written cold, before any data exists, the same way
   DECISION-GATE.md was — thresholds set with no stake in the answer.
2. A defined graduation mechanism (see above), not "some tiers, vaguely."
3. A real multi-week window, run and logged with the same honesty
   Milestone 0.5's journal was held to — including on days the answer
   is unflattering.
4. A specific question the test is capable of answering — likely:
   *does starting at low intensity and graduating produce more
   legs-equivalent sessions than starting at full intensity cold?* —
   stated precisely enough that a result could actually contradict it.

None of that has to happen soon, or at all. This document's only job is
to hold the idea honestly until someone decides it's worth designing for
real.
