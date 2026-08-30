# Decisions

A record of deliberate product/scope decisions that reverse or diverge
from a written brief, so the reasoning survives past the moment it was
made. `LESSONS.md` records bugs and what they taught; this records
choices — not the same thing.

## Food logging reverses "nutrition anything" out-of-scope (Milestone 3.5)

`BRIEF-PHASE3.md` and `BRIEF-PHASE5.md` both list "nutrition anything" as
out of scope. Milestone 3.5 reverses that, deliberately and narrowly: for
food *logging* only — Jack saying what he ate, stored verbatim, cited
back as data. Not calorie counting, not macro tracking, not meal
planning, not nutrition advice, not targets of any kind. Those stay out
of scope exactly as written; only the logging half moved.

Why: the coach already logs and cites qualitative facts (excuses, notes)
without that being "nutrition tracking" in the sense the original
out-of-scope line was written to prevent (a diet/calorie product). Food
logging is closer in kind to session logging — a fact about what
happened — than to the nutrition-app territory the brief was fencing
off. If a future version wants real nutritional numbers, they come from
a real lookup API with confirm-before-write, never model estimation —
that's a separate brief with its own decision, not an extension of this
one.

## Food gets a deliberately different register than training (Milestone 3.5)

The drill sergeant's register was sharpened for training in the same
milestone this decision was made. Food logging does **not** inherit that
sharpening — it uses a flat, neutral, descriptive register regardless of
which personality is active, enforced in `core-rules.md` (grounding, not
personality) rather than left to each personality file to remember.

Why: training accountability and food commentary are not the same
product. An always-watching system that comments critically on eating,
against a deadline, is a well-documented path toward a worse relationship
with food — and unlike a fabricated weekday or an invented pattern, that
failure is invisible until it's already happened; there's no test that
catches it the way `npm test` catches a wrong date. So the two-register
split is treated as a permanent product decision, not a limitation to be
tuned away once the coach "knows the user better" — sharpening the food
register later is explicitly not on the table without a fresh, deliberate
decision of its own, recorded here the same way.

## Vendoring drift gets a checker, not a generator (vendoring drift check)

`packages/core/src/*.ts` → `supabase/functions/_shared/core/*.ts` stays a
hand-copied file, verified after the fact by `scripts/check-vendor-drift.ts`
(`npm run check:vendor`), rather than a build step that generates the
vendored copy from source and makes drift structurally impossible.

Why: a generator was a real option — the three known rewrites are narrow
enough that regenerating instead of diffing would have been about the
same amount of code — and rejected for two reasons, not skipped. First,
Supabase edge functions have no build pipeline here; the generated file
would still need to be a committed, real file in
`supabase/functions/_shared/core/`, exactly like today, so a generator
depends on a human remembering to run it after touching `packages/core`
just as much as the checker depends on a human remembering to run
`check:vendor` — against this repo's actual biggest risk (no CI, nothing
enforced), the two approaches offer equal protection. Second, the
vendoring headers carry hand-written, per-file rationale (why
`generateDigest.ts`'s env read stays an unhoisted double-read, which
rewrite applied to which file and why) that a pure generator would either
flatten to boilerplate or require a separate per-file notes manifest to
preserve — real added machinery the checker doesn't need. A generator's
one genuine advantage — preventing hand-transcription typos during the
copy step — is already caught by the checker on the very next run, just
one command later rather than prevented outright. Revisit this if the
vendored file count or rewrite count grows past what fits on one screen,
or if the header prose stops carrying real per-file content and becomes
boilerplate anyway — at that point the generator's tradeoffs invert.
