# Vendored copies, not the real source

These files are copies of the equivalent files in `packages/core/src/` —
`dateTz.ts`, `stats.ts`, `personality.ts`, `digest.ts`, `generateDigest.ts`,
`progression.ts`, `trends.ts`, `logging.ts` (all since Phase 3), and
`nextSession.ts` (added after chat's prompt assembly was found to be
missing a rendered "Next scheduled session" line — proactive already
had one, chat never did, so the model was inferring a future weekday
with nothing to back it, a real violation caught by testing). `rules.ts`
was added in Phase 4 (item 1) when `evaluateRules`/`computeAcknowledgment`
moved from `proactive/src/` into `packages/core/src/` — the pg_cron
edge function (`supabase/functions/proactive-check`) needs the identical
rule evaluation `proactive/`'s local CLI does, not a second copy. `food.ts`
was added in Milestone 3.5 (food logging) for the same reason `stats.ts`
is here — chat's edge function needs `computeFoodStats`/`renderFoodLog`.
This is a deliberate, documented exception to this repo's "no duplicate
truth" rule (`CLAUDE.md`), not an oversight.

## Why

`packages/core` is written for Node/tsx: every internal import uses a
`.js` extension pointing at a `.ts` file (`import ... from "./dateTz.js"`),
which is the standard NodeNext/tsx resolution convention. Supabase's edge
function bundler runs on Deno and does not perform that `.js` → `.ts`
resolution — a real deploy against `../../../packages/core/src/index.ts`
fails with `Module not found ".../dateTz.js"` for every internal import.
An import-map alias was tried first (to keep a single source of truth)
and rejected: Deno's scope-based path resolution against the bundler's
synthetic `/tmp/user_fn_.../source/` root didn't resolve the way the
relative paths implied, and iterating against a live remote bundler to
find the right incantation wasn't worth it over just vendoring the files
actually needed. `daysSince.ts` still isn't copied — nothing here imports
it — but `nextSession.ts` now is (see above).

## What's actually different from the originals

Only two kinds of change, both mechanical:
- `./x.js` → `./x.ts` in internal imports (Deno resolves `.ts` directly).
- `generateDigest.ts`: the bare `@anthropic-ai/sdk` import becomes the
  `npm:@anthropic-ai/sdk@0.110.0` specifier Deno requires (matching the
  version already pinned in `chat/index.ts`), and `process.env.X` becomes
  `Deno.env.get("X")` — the Deno-native env API, not Node's `process.env`.

Everything else — logic, comments, exported names — is copied verbatim.

## Keeping this in sync

If `packages/core/src/{dateTz,stats,personality,digest,generateDigest,
progression,trends,logging,nextSession,rules,food}.ts` changes, the corresponding
file here needs the same change manually re-applied (just the two
mechanical rewrites above — everything except `generateDigest.ts` only
needed the import-extension rewrite, since none of the others touch
Node-only APIs). There's no build step that does this automatically. If a change
here ever needs to diverge in actual logic (not just the Deno-compat
rewrites), that's a sign this vendoring approach has outgrown itself and
the import-map alias is worth another, more careful attempt.
