# The Vigil

AI personal trainer app. The core bet, unchanged since the first commit:
people pay for an AI that **initiates, remembers, and holds them
accountable** — not one that generates workouts on request. Concretely,
that means a coach that texts first: "For two weeks, SGT VIGIL messages
me unprompted at the moments a real coach would — and I measure whether
it changes what I do" (`BRIEF-PROACTIVE.md`). A rules engine decides
*when* to speak (session due, no-show, pattern of skips, week at risk);
Claude decides *what* to say, constrained to facts the code has actually
computed from logged data — nothing hand-authored ever enters a prompt as
if it were verified.

## Current status

This is not a finished product. It's a working prototype that has
already run its first real test and gotten an honest answer, not the one
hoped for.

**Milestone 0.5** — a throwaway two-week experiment — asked SGT VIGIL to
message a single real user (me) unprompted, at the moments a coach would,
and measured whether it changed what he actually did. The verdict,
recorded in [`DECISION-GATE.md`](DECISION-GATE.md) exactly as computed
against the gate written *before* the window opened: **Red**. The act
rate on nudges was genuinely good (67%), but the one metric that mattered
most — did the training type he kept skipping actually get done — came
in at 1 completed session across the entire two-week window. Per the
gate's own rule, that's "thesis wrong, stop building."

On 2026-08-07, that stop was explicitly overridden — not reversed, not
reinterpreted. The Red read-out still stands, unedited, on the data
collected. The override is a separate, dated, reasoned entry in the same
file: a judgment that the experiment itself was hobbled (cron silent for
a real stretch, logging that lagged training by days, a gate denominator
that didn't cleanly match the program's cadence) rather than that the
underlying thesis is wrong. Phase 1 (personality system) and Phase 2a
(shared core package) are built and verified on the strength of that
override. Phase 2b (a live Supabase backend) is written but has never
been deployed — see [`SUPABASE-SETUP.md`](SUPABASE-SETUP.md).

If you're evaluating this repo: the Red verdict and the override are
both real, both intentional, and both left in the historical record on
purpose. Nothing here is trying to look further along than it is.

## Repo structure

- **`the-vigil/`** — the Expo/React Native client. Chat UI, personality
  picker, the only thing a user actually touches.
- **`server/`** — Node/Express proxy for the Anthropic API. Assembles the
  system prompt server-side; the client stays dumb by design.
- **`proactive/`** — the Milestone 0.5 stub: a deterministic rules engine,
  a cron entrypoint, ntfy delivery, and the journal the decision gate was
  scored against. Still running.
- **`packages/core/`** — shared, unit-tested logic (stats, dates, next-
  session, personality resolution, digest generation) imported by both
  `server` and `proactive` — the single source of truth for anything
  computed from logged data.
- **`supabase/`** — the Phase 2 schema, RLS policies, and edge functions.
  Written and internally consistent; never deployed against a live
  project.
- **`coach-prompts/`** — the personality prompts and the shared grounding
  rules. Treated as seriously as code; this is most of the actual product.
- **`scripts/`** — one-off tooling, currently the Supabase migration
  script for importing the experiment's `journal.jsonl`/`state.json` as
  the first rows of a real event log.
- **`marketing/`** — a landing page and pitch deck from the initial
  commit. Not wired to anything that runs.

## Setup

**Chat + proactive stub (working today, no Supabase needed):**
```
npm install                     # root workspace: packages/core, server, proactive, scripts
cd the-vigil && npm install     # separate install — not an npm workspace member (see CLAUDE.md)
```
Add `ANTHROPIC_API_KEY` to `server/.env` (copy `server/.env.example`),
then `cd server && npm run dev`. Point `the-vigil/config.ts`'s
`SERVER_URL` at your machine's LAN IP and run the app with
`cd the-vigil && npm start` (Expo Go on a real phone — see `CLAUDE.md`'s
verification rules, not the simulator).

**Tests / typecheck / lint**, per package: `npm test`,
`npm run typecheck`, `npm run lint`. `the-vigil` additionally has
`npm run doctor` (`expo-doctor`) and a Playwright E2E suite
(`the-vigil/e2e/`) that drives the Expo **web** build specifically —
it does not cover Expo Go, see `CLAUDE.md`.

**Supabase (Phase 2b, not live yet):** the full schema, edge functions,
and migration script already exist but have never run against a real
project. Follow [`SUPABASE-SETUP.md`](SUPABASE-SETUP.md) start to finish
rather than duplicating those steps here.
