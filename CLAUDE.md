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
