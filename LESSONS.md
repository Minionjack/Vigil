# Lessons

## No hand-authored derived claims in state (2026-07-08)

`fake-profile.json` used to carry a `patterns_noted` field: free-text
"insights" like *"Legs day skipped 2 of last 3 weeks — squat has not
progressed since week 2"*, written by hand and fed to Claude as if it were
verified fact. The problem: it wasn't checked against `recent_sessions` at
all, and it was wrong — there were only two logged legs sessions total
(both skipped), not three, and zero completed legs sessions ever, so there
was no squat progress to have stalled in the first place.

Claude wasn't hallucinating here. It was faithfully citing a lie it had no
way to know was one — which is the correct thing for a model to do with
something presented to it as ground truth. That's actually the important
part: the bug wasn't in the model, it was in the pipeline that fed it.

**The rule going forward: nothing enters a prompt as "fact" unless code
computed it from raw logged data.** See `computeSessionStats()` in
`server/src/systemPrompt.ts` and `proactive/src/state.ts` — both derive
counts straight from `recent_sessions` / `sessions`, unit-tested, and
render the result as a `Verified stats` block the coach prompts are told
they may cite numbers from and nothing else.

Two more instances of the same disease turned up during re-verification,
worth naming because they don't look like the first one on the surface:

- **Clock math**: a proactive nudge said "in 3 hours" when the model was
  never told the current time, only today's date. It invented a duration
  to sound concrete. Fix: never state a countdown, only the fixed session
  time.
- **Weekday inference**: a message attributed a session to "Friday" when
  the logged date was actually a Monday, because the state renderer never
  included a weekday label — the model had to compute one, and got it
  wrong. Fix: compute and render the weekday in code, same as the counts.

General shape of the bug: **whenever a persona is instructed to sound
specific, and the data needed to be specific truthfully isn't actually
present, it will confabulate something plausible to fill the gap.** This
isn't a prompt-wording problem you can patch away with "don't lie" —
the model doesn't know it's lying. The fix is always upstream: either
compute the fact in code and hand it over, or make the absence of the
fact itself the thing the prompt is allowed to say.

**Why this will matter again:** Phase 2 adds wearable data, and it will be
tempting to write something like `"recovery has been trending down"` as an
annotation on the state rather than a number the model can check. Same
bug, new organ. Before adding any hand-written characterization of the
athlete to state data, ask: is this derived from something code actually
computed from raw logged data, or is it a human's (or a previous LLM
session's) summary presented as fact? Only the former belongs in state.
