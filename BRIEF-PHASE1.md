# Milestone 1 — Personality & Feel

> **UNFROZEN 2026-08-07** by explicit override of DECISION-GATE.md's Red
> verdict (recorded 2026-07-25, not revised — see the Override entry
> there). Originally gated on green, or yellow after a successful second
> iteration; proceeding anyway was a conscious decision, not a changed
> result. May run before or parallel to Phase 2 — it touches prompts and
> UI only, no backend.

**Goal:** Three distinct coaches — Drill Sergeant, Mentor, Hype — each of
which passes the Milestone 0 acceptance test *in its own voice*. Success =
a blind reader of three transcripts can tell which coach is which in under
three messages, and none of them ever states an uncomputed number.

## Why this shape
The personality prompts ARE the product (CLAUDE.md). But the anti-fabrication
rules are NOT personality — they're physics. If each personality file carries
its own copy of the never-derive rules, they will drift exactly like
`computeSessionStats` did.

That drift isn't hypothetical — it already happened, this month. `drill-
sergeant.md` and `proactive-extension.md` each carry their own independently
maintained copy of the "never derive, only phrase" preamble, and the
goal-arithmetic and future-weekday fixes were added only to
`proactive-extension.md`, never mirrored back into `drill-sergeant.md`. So
the extraction below pulls grounding content out of *both* files, not just
the personality file — a narrower fix would refactor around the exact drift
it's meant to prevent.

So: one shared preamble, three voices layered on top.

## Build exactly this

### 1. Prompt architecture refactor
- `coach-prompts/core-rules.md` — extracted from **both** `drill-sergeant.md`
  and `proactive-extension.md`: the never-derive constitution, Verified-
  stats-only numbers, word caps, the no-future-dates rule, R5 acknowledgment
  behavior. Personality-neutral, and surface-neutral — chat and proactive
  read the same file.
- `coach-prompts/personalities/{drill-sergeant,mentor,hype}.md` — voice,
  values, how they push, how they praise, how they handle excuses. NO
  factual-grounding rules in these files; assembly always prepends
  core-rules.md.
- `proactive-extension.md` shrinks to what's genuinely proactive-specific:
  outbound-only format (one message, the word cap), no-questions-into-the-
  void, per-rule tone calibration (R1–R5). Its grounding content moves into
  core-rules.md in the same PR — it does not keep a parallel copy of
  anything core-rules.md now owns.
- Prompt assembly (server + proactive) updated to: core-rules + personality
  + (proactive-extension, when outbound) + Verified stats + rendered state.
  One test asserting core-rules is present in **both** assembled prompts —
  chat and proactive — not just across the three personalities.

**Execution note:** the split is sentence-level, not section-level. The
current `drill-sergeant.md` interleaves voice and grounding within single
bullets — e.g. "Call out patterns — but only counts that exist... must
match the Verified stats block exactly" is one sentence doing both jobs.
Cutting by section will leave grounding clauses stranded in the personality
files; each bullet needs to be read and split on its own.

### 2. The two new voices
- **Mentor** — long-game, reflective, connects today's choice to the pattern.
  Pushes with questions, not orders. Failure mode to design against:
  becoming a therapist. It still closes with a concrete ask every time.
- **Hype** — high energy, celebration-forward, treats every session like a
  main event. Failure mode: sycophancy. It must still call out skips —
  disappointment-in-your-corner, not cheerleading through failure.
- Each personality file includes 3 few-shot exchanges covering: a skip
  excuse, a PR, a return after absence.

### 3. Picker UI (the-vigil app)
- First-launch screen: three cards (name, one-line ethos, static 2D
  portrait — commissioned or generated once, stored as assets; no runtime
  image generation). Selection persisted locally; changeable in a minimal
  settings row. The chat header reflects the chosen coach.

## Acceptance test
1. Run the Milestone 0 three-message test against each personality. Each
   must: use my name + profile fact in the greeting, push back on the work
   excuse citing the logged precedent, and lock in the concrete alternative
   — in a voice unmistakably its own.
2. Blind test: generate the same three-exchange transcript per coach, strip
   names, have someone (or a fresh Claude session) attribute them. 3/3.
3. Fabrication regression: run each personality against the r3 fixture
   dry-run. Every number and date traces to the fixture. Hype is the risk
   case — enthusiasm invites invented specifics.

## Out of scope — do not build even if easy
Voice audio, animated avatars, 3D anything, per-personality rule changes
(rules are shared physics), personality switching mid-conversation logic
beyond "picker sets it", more than three personalities.

## Done when
All three acceptance tests pass on my phone, core-rules.md is the single
source of grounding rules for both surfaces, neither drill-sergeant.md nor
proactive-extension.md carries a duplicate copy of any of them, and
drill-sergeant.md is strictly smaller than it was (voice only).
