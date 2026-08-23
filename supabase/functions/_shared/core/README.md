# Vendored copies, not the real source

These five files are copies of the equivalent files in `packages/core/src/`
— `dateTz.ts`, `stats.ts`, `personality.ts`, `digest.ts`, `generateDigest.ts`.
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
find the right incantation wasn't worth it over just vendoring the five
files actually needed (neither edge function imports `daysSince.ts` or
`nextSession.ts`, so those aren't copied here).

## What's actually different from the originals

Only two kinds of change, both mechanical:
- `./x.js` → `./x.ts` in internal imports (Deno resolves `.ts` directly).
- `generateDigest.ts`: the bare `@anthropic-ai/sdk` import becomes the
  `npm:@anthropic-ai/sdk@0.110.0` specifier Deno requires (matching the
  version already pinned in `chat/index.ts`), and `process.env.X` becomes
  `Deno.env.get("X")` — the Deno-native env API, not Node's `process.env`.

Everything else — logic, comments, exported names — is copied verbatim.

## Keeping this in sync

If `packages/core/src/{dateTz,stats,personality,digest,generateDigest}.ts`
changes, the corresponding file here needs the same change manually
re-applied (just the two mechanical rewrites above). There's no
build step that does this automatically. If a change here ever needs to
diverge in actual logic (not just the Deno-compat rewrites), that's a
sign this vendoring approach has outgrown itself and the import-map
alias is worth another, more careful attempt.
