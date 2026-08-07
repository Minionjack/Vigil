# Decision gate — proactive experiment (2026-07-13 to 2026-07-26)

Written 2026-07-09, BEFORE the window opened. Not to be edited after 13 Jul.

Baseline: legs completed 1 of last 3 scheduled (~33%).

## Green — build Phase 2 (real memory, real push)
- Legs completed >= 3 of 4 scheduled legs sessions, AND
- Act rate on nudges >= 50% (same-day session after nudge)

## Yellow — iterate tone/timing, run 2 more weeks, no new infra
- Legs 2 of 4, OR act rate 25–50%

## Red — thesis wrong, stop building
- Legs <= 1 of 4 (no better than baseline), OR
- Act rate < 25%, OR
- I mute the notifications at any point (muting = product failure, overrides all numbers)

Scoring counts only nudges fired on/after 2026-07-13. The two 09 Jul nudges
(wrong ntfy topic, never seen) are excluded.

---

## Read-out — 2026-07-25 (day 13 of 14)

**Verdict: RED.**

- Act rate (resolved nudges, `npm run score`, window-filtered to
  ≥2026-07-13): **67% (2/3)** — clears the Green bar (≥50%) on its own.
- Legs: **1** completed session logged in the entire window
  (2026-07-25 — the second-to-last day). No other Legs entry, completed
  or skipped, appears anywhere between 2026-07-13 and 2026-07-26. This
  triggers "Legs <= 1 of 4 (no better than baseline)" verbatim, regardless
  of how the "4" is read.
- Also on record: 2026-07-22 (Wednesday, the established Legs slot every
  prior week) has no session entry at all — a silent gap, not a logged
  skip.
- Red's criteria are OR'd — the Legs trigger alone decides this outcome,
  independent of the act rate being good. Per this gate's own rule: thesis
  wrong, stop building. No Phase 2, no Supabase, no infrastructure work
  follows from this read-out.

**Flag for a future gate, not a correction to this one:** the "4" in the
Legs criteria above doesn't obviously match the program's actual cadence —
a 3-day Push/Pull/Legs rotation yields at most 2 Legs opportunities in a
clean two-week window, not 4. Worth writing a denominator's derivation down
explicitly the next time a gate like this is set, so it doesn't need
reconstructing under pressure after the fact.

---

## Override — 2026-08-07

Phase 1 and Phase 2 are unfrozen by explicit decision, not by a changed
verdict. The Red read-out above stands exactly as recorded on 2026-07-25 —
this is not a reinterpretation of the data, and nothing here claims the
system as tested passed.

The call: proceed anyway, on the judgment that Red reflected a hobbled
experiment more than a disproven thesis — cron dead-silent for a real
stretch early on, logging that lagged training by days, and a Legs
denominator in this gate's own criteria that didn't match the program's
actual cadence (flagged above, on 07-25, before this override existed).
That judgment is not provable from the journal; it is a conscious choice
to build past an unresolved question rather than wait for a cleaner
answer to it. Two other paths were available and were not the one taken:
running the stub two more clean weeks against a fixed setup, or designing
the cold-gated test IDEA-TIERED-ACCOUNTABILITY.md itself calls for before
anything gets built against that idea.

`BRIEF-PHASE1.md` and `BRIEF-PHASE2.md` are updated to reflect this
override in their own headers, dated to match. Their acceptance tests and
"done when" bars are unchanged — an override changes whether building
starts, not what "done" means once it does.
