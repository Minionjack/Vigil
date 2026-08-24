# Idea — Behavioral Intelligence / Intervention Learning

Dated 2026-08-24. Written the same day test 2, 3, and 4 of
`BRIEF-PHASE2.md`'s acceptance criteria were verified live against the
real Supabase project, with test 1 (the only one needing elapsed time)
freshly clocked to resolve around 2026-08-31.

**Provenance, stated plainly:** an external AI-generated review of this
repo (fed the GitHub file tree and briefs, not the actual runtime data)
proposed a "Phase 6 — Behavioural Intelligence" and "Phase 7 — Vigil
Agent," arguing the real product isn't an AI fitness coach but a general
"behavioral operating system" that learns which interventions work for a
given person and eventually expands into work/life domains beyond
fitness. The user's own reaction to that review is most of this
document's substance — this is a write-up of an idea the user pushed
back on in real time, not one either of us is proposing to build.

## The idea, as pitched

Track every proactive nudge as an experiment: trigger, intervention
type, timing, channel, outcome. Over time, derive a per-user response
profile — which tone, timing, and framing actually changes behavior for
*this* person — and let that profile drive intervention selection
(including which personality speaks, chosen by the system rather than
picked by the user). Longer-term, extend the same engine past fitness
into work/life domains (calendar, tasks, sleep, general commitments),
with fitness as just the first "skill" the behavior engine applies.

## Why it's a real idea in principle

The core distinction this repo already draws — code decides what's
true, the model only phrases it — is exactly the discipline a
"behavioral memory" layer would need to stay honest. `computeSessionStats`
already counts skip patterns by session type; counting skip patterns by
*stated reason* ("3 of 4 skips cited work") is a small, real extension
of the same idea, not a new category of risk, **provided the reason is
a controlled vocabulary chosen at logging time** (e.g. `--reason=work`
as a fixed enum), not a free-text excuse string classified after the
fact by an LLM pass. That second version reintroduces exactly the
inference problem the first one avoids — a judgment call about what the
user *meant*, dressed as a count. Any future work on this idea should
treat that distinction as load-bearing, not incidental.

`BRIEF-PHASE5.md` already proposes surfacing which rule fired and which
logged facts caused a given nudge ("why am I getting this"). Making that
a first-class, legible UI feature — not just a debug log — is a
reasonable elaboration of existing scope, not part of what's parked
here.

## Why it's not ready, and won't be for a long time

The concrete numbers an intervention-outcome model would need to be
credible — "72% action rate for nudges sent 17:00–18:00," "direct
challenge: 64% success vs. question-based: 41%" — require enough
independent trials per condition to mean anything. Milestone 0.5's
entire two-week experiment produced on the order of a dozen nudges
total, scored across four different rules. A "response profile" derived
from that isn't a soft or early version of a real finding — at that N,
there is no version of that claim that isn't noise wearing a percentage
sign. This is `INVARIANTS.md`'s own core objection (the model must never
state a fabricated statistic) recurring one level up: an unverified
behavioral claim, presented with false confidence, just relocated from
"the coach says a number in a chat message" to "the roadmap assumes a
model that doesn't exist yet." Same failure shape, larger blast radius,
because here it would be the premise for two entire future phases rather
than one wrong sentence.

The "AI chooses your coach's personality, not you" variant fails for the
identical reason (no data to support the choice being better than
random) and adds a second problem on top: a personality that silently
changes based on an inference the user can't see or verify cuts against
the transparency this project has otherwise prioritized ("why am I
getting this" as a planned feature, not an afterthought).

Worth naming directly: the review that proposed this scored the
project's own "Validation" at 6/10, correctly noting the core
behavioral thesis is still unproven — then proposed Phase 6 and 7 built
on top of that same unproven core, in the same document. That's not a
vision for *after* validation. It's a vision that quietly assumes
validation already happened.

## What this does NOT do

- Does not add anything to `ROADMAP.md`. Phase 3, 4, and 5 remain the
  actual next phases, in order, exactly as scoped.
- Does not change how any current nudge, rule, or personality is
  selected — everything stays rule-based and user-chosen, as built.
- Is not gated on anything, because it isn't a build item — it's a
  hypothesis with a clearly-stated reason it can't be tested yet.

## What a legitimate next step would look like, if one is ever taken

Not "add outcome tracking and see what the numbers say" after a few more
weeks — a few more weeks doesn't fix a sample-size problem this
fundamental. A real version of this would need:

1. Enough independent trials per (trigger × intervention-type ×
   timing) cell to say anything statistically — almost certainly
   requiring either a much longer single-user window (months, not
   weeks) or multiple users, which reopens the multi-user questions
   `BRIEF-PHASE2.md` already deferred.
2. A pre-registered hypothesis and threshold, written cold, the same
   way `DECISION-GATE.md` and `IDEA-TIERED-ACCOUNTABILITY.md`'s proposed
   test both insist on — decided before the data exists, not fitted to
   it afterward.
3. The controlled-vocabulary discipline described above applied
   everywhere behavioral memory touches free text, not just for the
   "cited work" example.
4. A specific, falsifiable question — not "does Vigil get better over
   time" but something with a real chance of coming back "no."

None of that has to happen soon, or at all. This document's only job is
to hold the idea honestly, and hold the reason it's parked just as
clearly as the idea itself, until someone decides it's worth designing
for real.
