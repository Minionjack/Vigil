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

## Try it right now

No install beyond the free **Expo Go** app (App Store / Play Store).
Open this on the phone that has Expo Go, or scan its QR from
[expo.dev](https://expo.dev/accounts/theworldfromjack/projects/the-vigil/updates/4c395d28-c247-4652-8c7f-58c471edd870):

**https://expo.dev/accounts/theworldfromjack/projects/the-vigil/updates/4c395d28-c247-4652-8c7f-58c471edd870**

That page shows a QR and an "Open in Expo Go" link — no Apple account,
no App Store review, no local server to run. It talks to the real,
live backend (see below), so anything logged through it is real data,
not a fixture. It's Expo Go, not a real app icon on the home screen, and
it stops matching the running code the moment `the-vigil/`'s native
dependencies change without a fresh `eas update` publish (see
"Publishing an update" below) — fine for using/demoing the app, not a
substitute for a real build once that's warranted.

## Current status

The honest history first, because it's real project history, not just
a caveat: **Milestone 0.5** — a throwaway two-week experiment — asked SGT
VIGIL to message a single real user (me) unprompted, at the moments a
coach would, and measured whether it changed what he actually did. The
verdict, recorded in [`DECISION-GATE.md`](DECISION-GATE.md) exactly as
computed against the gate written *before* the window opened: **Red**.
The act rate on nudges was genuinely good (67%), but the one metric that
mattered most — did the training type he kept skipping actually get
done — came in at 1 completed session across the entire two-week window.
Per the gate's own rule, that's "thesis wrong, stop building."

On 2026-08-07, that stop was explicitly overridden — not reversed, not
reinterpreted. The Red read-out still stands, unedited, on the data
collected. The override is a separate, dated, reasoned entry in the same
file: a judgment that the experiment itself was hobbled (cron silent for
a real stretch, logging that lagged training by days, a gate denominator
that didn't cleanly match the program's cadence) rather than that the
underlying thesis is wrong.

Since that override, built and **live against a real Supabase project**
(this section is the part that goes stale fastest — if it disagrees with
`ROADMAP.md`/`BRIEF-PHASE*.md`, trust a fresh look at the code and
`git log` over this paragraph):

- **Phase 1** — three personalities (Drill Sergeant, Mentor, Hype), each
  with its own voice in `coach-prompts/personalities/`.
- **Phase 2** — real memory. Auth, `profiles`, an append-only `events`
  log, and a nightly digest job all live on Supabase; the chat and
  history screens read/write the deployed edge functions, not a local
  file. `server/` (the original Node/Express proxy) is **orphaned** —
  nothing points at it anymore.
- **Phase 3** — conversational workout logging (say what you lifted, it's
  echoed back for confirmation before it's ever written), a progressive-
  overload engine that computes next week's weights, and a History screen
  in the app.
- **Phase 4 (item 1 only)** — the proactive nudge engine moved off a
  laptop cron job and into `pg_cron` + a Supabase edge function. Real
  push notifications are still gated on buying an Apple Developer
  account, not done yet; nudges currently deliver via ntfy as a stopgap.
- **Milestone 3.5** — food logging (say what you ate, stored verbatim,
  cited back as plain data — never a calorie estimate, never a judgment,
  by design — see `DECISIONS.md`) and a sharpened Drill Sergeant register
  for training specifically.

If you're evaluating this repo: the Red verdict and the override are
both real, both intentional, and both left in the historical record on
purpose. Nothing here is trying to look further along than it is —
including this README, which is why the try-it-now link above is the
fastest way to check what's actually true right now against what's
written here.

## Repo structure

- **`the-vigil/`** — the Expo/React Native client. Chat, History screen,
  personality picker. Points at the live Supabase project
  (`the-vigil/config.ts`), not a local server.
- **`supabase/`** — the live backend: schema (`migrations/`), RLS
  policies, and the deployed edge functions (`functions/chat`,
  `functions/history`, `functions/nightly-digest`,
  `functions/proactive-check`). `functions/_shared/core/` holds vendored,
  Deno-compatible copies of `packages/core` — see its own `README.md` for
  why they're copies and not imports.
- **`packages/core/`** — shared, unit-tested logic (stats, dates,
  next-session, progression, food, the proactive rules engine, logging
  extraction/confidence gates) imported by both the edge functions
  (vendored) and `proactive/`'s local CLI. The single source of truth for
  anything computed from logged data.
- **`proactive/`** — now mainly the `npm run log` CLI (a second write
  path into the same event log the app itself writes to) and the local
  cron job kept running in parallel with the cloud one until Phase 4's
  own three-consecutive-verified-days bar is met.
- **`coach-prompts/`** — the personality prompts and the shared grounding
  rules (`core-rules.md`). Treated as seriously as code; this is most of
  the actual product.
- **`scripts/`** — one-off tooling: the original Supabase migration
  script, dev-account creation, edge-prompt generation
  (`generate-edge-prompts.ts` — re-run after any `coach-prompts/*.md`
  edit, its output is a build artifact).
- **`server/`** — orphaned. Kept for history, not imported by anything
  live.
- **`marketing/`** — a landing page and pitch deck from the initial
  commit. Not wired to anything that runs.

## For continuing engineering work

The try-it-now link above needs nothing. Actually changing code needs:

1. **Repo + npm**: `npm install` at the root (workspace: `packages/core`,
   `proactive`, `scripts`); `cd the-vigil && npm install` separately (not
   a workspace member — see `CLAUDE.md`).
2. **Supabase access**: the project is live on the Free plan — ask Jack
   to add you as an organization member (Supabase dashboard →
   organization settings → members) rather than sharing raw keys.
   `server/.env.example` lists what a working `server/.env` needs
   (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`,
   `ANTHROPIC_API_KEY`, etc.) — real values come from the Supabase
   dashboard once you have access, never committed.
3. **Deploying a change**: `supabase functions deploy <name>` per
   function (see each `supabase/functions/*/index.ts`'s own header
   comment for its specific auth/trigger notes — `proactive-check` and
   `nightly-digest` deploy with `--no-verify-jwt`, `chat`/`history` don't).
   Schema changes go through `supabase/migrations/000N_*.sql` +
   `supabase db push`.
4. **Publishing an update** (so the try-it-now link reflects new code):
   from `the-vigil/`, `npx eas-cli@latest update --branch preview
   --message "..."` (needs `EXPO_TOKEN` — ask Jack for one from
   [expo.dev account settings](https://expo.dev/accounts/theworldfromjack/settings/access-tokens),
   or your own if added to the Expo project).

**Tests / typecheck / lint**, per package: `npm test`,
`npm run typecheck`, `npm run lint` — `CLAUDE.md`'s "no green, no done"
rule applies everywhere, no exceptions. `the-vigil` additionally has
`npm run doctor` (`expo-doctor`); its Playwright E2E suite
(`the-vigil/e2e/`) drives the Expo **web** build specifically, not Expo
Go — `CLAUDE.md` covers why a real device is the actual bar for any UI
change, and Playwright doesn't substitute for it.

**Where to read next**, roughly in the order they'd matter to someone
picking this up: `CLAUDE.md` (conventions this repo actually enforces),
`ROADMAP.md` + the relevant `BRIEF-PHASE*.md` (what each phase was
supposed to build and its acceptance tests), `DECISIONS.md` (deliberate
scope/product calls that reverse or diverge from a brief), `LESSONS.md`
(recurring bug patterns this project keeps re-learning — worth reading
before adding any new rule that asks the model to state a specific,
checkable fact).
