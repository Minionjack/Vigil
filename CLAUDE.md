# The Vigil — Project Conventions

AI personal trainer app. The core bet: people pay for an AI that **initiates, remembers, and holds them accountable** — not one that generates workouts.

## Stack
- **App:** React Native + Expo (managed workflow, Expo Router, TypeScript)
- **Backend:** Supabase (auth, Postgres, edge functions, pg_cron) — NOT wired up yet in Milestone 0; use a local Node proxy for the Anthropic API
- **AI:** Claude API (`claude-sonnet-4-6` for chat). API key lives ONLY server-side, never in the app bundle.

## Rules
- TypeScript everywhere, strict mode on.
- Keep the chat screen dumb: all coach logic (system prompt assembly, memory injection) happens server-side in the proxy.
- Coach personality prompts live in `/coach-prompts/` as markdown — they are the product; treat edits to them as seriously as code.
- Test on a real phone via Expo Go, not just the simulator.
- No premature abstraction. Milestone 0 is one screen, one personality, fake data.

## Current milestone
**Milestone 0** — see BRIEF.md. Expo skeleton + working Drill Sergeant chat with fake profile injected. Nothing else.

## What NOT to build yet
Auth, onboarding, Supabase, push notifications, voice, avatars, workout logging, real memory. All later phases (see ROADMAP.md).

## Architectural constitution

### Truth hierarchy
1. Raw events are the historical source of truth.
2. Derived facts (counts, streaks, "days since", next-session) are
   computed deterministically from raw events, in packages/core, and
   nowhere else.
3. LLM-written memory (digests) is a labeled impression layer, never a
   factual source — if a raw event, a computed fact, and a digest ever
   conflict, the raw event wins, unconditionally.

### The AI boundary
The AI may: phrase, explain, motivate, ask questions, interpret
qualitative notes.
The AI may not: invent numbers, calculate statistics, infer dates not
provided, claim a streak not computed, or decide whether a deterministic
rule fired.

If a value can be calculated deterministically from logged data, it is
calculated in code — never inferred by the model. This line is sacred.

### Event integrity
Every event distinguishes `occurred_at` (when the thing actually
happened) from `recorded_at` (when it was logged). These are not the
same field. Backfilled/late-logged events are expected, not exceptional
— the schema must hold both timestamps honestly rather than collapsing
them into one.

### No duplicate truth
Business logic that computes a fact about the client exists in exactly
one place: packages/core. The server, the proactive engine, the Expo
client, and any scripts import it — none of them re-derive it.

### Before any change is "done"
`npm test && npm run typecheck && npm run lint` in every affected package,
then review the diff. `typecheck` (`tsc --noEmit`) exists in every package
as of the architecture-hardening audit. A real ESLint config exists too
(`eslint.config.js` at the repo root, `typescript-eslint` recommended
rules) — scoped to `packages/core`, `server`, `proactive`, `scripts`;
`the-vigil` carries its own separate config and install rather than
sharing the root one (not an npm workspace member). `lint` scripts exist
in every package's `package.json`. If the change touched any file in
`packages/core/src/` that's vendored into `supabase/functions/_shared/core/`
(see that directory's `README.md` for the current list), also run
`npm run check:vendor` from the repo root — it diffs the vendored copies
against source (modulo the documented mechanical rewrites) and fails
loudly on anything else, per `scripts/check-vendor-drift.ts`. Nothing
runs any of this automatically — there's no CI in this repo — so it's a
convention to remember, not a gate that stops a bad commit; run it
yourself, every time.
No green, no done.

## the-vigil verification (Expo Go, real device — not Playwright/browser)
Before any UI change is considered done:
1. `npm run doctor && npm run typecheck` — both clean.
2. Reload in Expo Go on a real phone. Check for the red error screen or a
   Metro bundler error before anything else.
3. Wait for an actual screenshot of the real device. Do not mark a UI
   task complete from typecheck passing alone — visual correctness on a
   real phone is the bar, per this file's existing "test on a real phone"
   rule.
Playwright does not cover this app — it drives browsers, not Expo Go.
