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

**Why this will matter again:** Phase 4 adds wearable data, and it will be
tempting to write something like `"recovery has been trending down"` as an
annotation on the state rather than a number the model can check. Same
bug, new organ. Before adding any hand-written characterization of the
athlete to state data, ask: is this derived from something code actually
computed from raw logged data, or is it a human's (or a previous LLM
session's) summary presented as fact? Only the former belongs in state.

## Affirmative-only rules invite fabricating their own premise (2026-08-24)

Three manifestations of one disease, found across two different phases of
this project, each looking unrelated to the last until traced back:

1. **`patterns_noted` (2026-07-08, above).** A human wrote an unverified
   claim into a hand-authored field, and the model faithfully cited a lie
   it had no way to know was one.
2. **Digest-narrative override (Phase 3, chat prompt).** An LLM-written
   memory digest, explicitly labeled "impression, not fact" and banned
   from stating numbers, still let a *later* LLM call misattribute which
   session type happened on a given day — because the ban only named
   numbers, not the general shape of a citable specific. Fixed by making
   the rule structural ("digests are never a source of discrete facts")
   rather than enumerating fact-types one at a time.
3. **Live pattern-callout fabrication (same round, found after fixing
   #2).** With the digest confirmed clean — checked directly, not
   inferred — the coach still said "work was crazy on the 22nd too" when
   no skip exists anywhere near that date. The digest wasn't the source
   this time. The model invented the match itself, because
   `drill-sergeant.md`'s "call out patterns... with the date" describes
   what to do *when a match exists* and says nothing about what to do
   when one doesn't — so when asked to satisfy an instruction it can't
   truthfully satisfy, it manufactured the premise instead of admitting
   the premise was false. The same round found a second instance: "you've
   got Push tonight" stated as upcoming when Verified stats already
   showed it completed — the model treating a background fact ("usual
   session time: 18:30") as license to assert an unscheduled session,
   with nothing telling it to check whether that premise was already
   settled.

**The general bug, named once instead of patched per instance:** any rule
phrased "if X, do Y" carries an *unstated* corollary — what to do when X
is false — and a model asked to satisfy Y without a true X will
frequently satisfy it by asserting X anyway, not by declining. This is
not a wording problem specific to digests, patterns, or scheduling; it is
a property of affirmative-only instructions in general. `patterns_noted`
was a human doing this once, by hand, into a static field. The digest
case was an LLM doing it once, into a summary. The pattern-callout case
is the same LLM doing it *live, in the same response it was asked to
generate* — the fabrication moved from "a stale field nobody re-checked"
to "the current turn," with no data-pipeline fix available to catch it,
because there was never bad data to catch — only an instruction with a
missing half.

**The fix, as a standing principle, not a per-instance patch:** every
"if X, do Y" rule written in this codebase — in `core-rules.md`, in a
personality file, in a future rule for Phase 4's wearable data or
anything else — needs an explicit paired "if not X, say so or say
nothing" beside it. Don't assume the negative case is obvious; write it.
`core-rules.md`'s "Absence is not evidence" section is the general-case
version of this fix, plus two named instances (session-status-before-
scheduling, pattern-match-before-citing); the personality files' "call
out patterns" behaviors now point back to it in one line each rather
than re-deriving the rule three times. Any *new* affirmative rule added
later — Phase 3's extraction-confirmation logic, Phase 4's wearable
annotations, whatever comes after — inherits this fix for free only if
it's written with the same "if X / if not X" pairing from the start, not
discovered as a fourth instance of this same bug in a new file.

## A fluent sentence can be arithmetic wearing English (2026-08-25)

Fixing the pattern-callout bug above (round 5's fourth manifestation) took
two more rounds after the fix "worked" once, and each of those rounds
found the same deeper thing in a sharper form:

- **Round 6.** Giving the model real skip data (date + excuse) fixed the
  literal-fabrication case, but the model then attributed an excuse to
  "whichever session type has the most skips" — nothing in the message or
  the file said which type was meant — and flattened three genuinely
  different excuses into one claimed recurring phrase ("the third
  time... word for word"). Fixed by computing the relevant type in code
  (`determineRelevantSessionType`: named in the message, or due today,
  never inferred from skip counts) and gating skip history to that type
  only (`findMatchingSkips`).
- **Round 7.** Even given the *correct* verbatim data for the *correct*
  type, the model still claimed two excuses were "the same" or "word for
  word" when they weren't ("work is crazy" vs "12 hour workday") — wrong
  in 4 of 5 live samples. This one wasn't fuzzy at all: it's `===`, a
  boolean a single string comparison answers with total certainty. Fixed
  by computing the equality in code (`findExactSkipMatch`) and rendering
  the answer as a fact the model is told, not asked to judge.

**The general shape, sharper than the affirmative-only-rule lesson above:**
a model asked to state something that *sounds* like phrasing is often
actually being asked to perform a computation — counting, comparing,
matching, deriving — and fluent English hides the difference completely.
"Which type does this excuse belong to," "is this the third time," and
"are these two excuses the same" all read as ordinary sentences a coach
would say. All three are arithmetic, pattern-matching, or string equality
wearing a sentence. An LLM will answer all three fluently and confidently,
and get them wrong at a real, measured rate (this session: 4-of-5 and,
earlier in the same saga, other non-zero rates), because a language
model's instinct — treat semantically adjacent things as equivalent — is
exactly correct for conversation and exactly wrong for a factual identity
claim.

**The tell, going forward:** if a rule asks the model to state a specific,
checkable claim — a date, a count, a "which one," an "is this the same as
that" — stop and ask "is this actually a computation" before asking "is
the prompt worded well enough." If the answer is yes, it belongs in
`packages/core`, computed once, rendered as a fact, same as
`computeSessionStats`/`computeNextScheduledSession`/`findMatchingSkips`/
`findExactSkipMatch` already are. The prompt's job is to forbid the model
from re-deriving what's already been computed, not to word the derivation
well enough that the model gets it right on its own.
