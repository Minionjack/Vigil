# Proactive stub — Milestone 0.5

Throwaway harness that tests whether SGT VIGIL messaging you first actually
changes what you do. See `../BRIEF-PROACTIVE.md` for the full spec and the
two-week experiment protocol.

## One-time setup

```
cd proactive
npm install
```

1. **Pick a secret ntfy topic.** Anyone who knows the topic name can read or
   post to it — treat it like a password. A random slug is fine, e.g.
   `jack-vigil-9f2a`.
2. Edit `state.json` → `journal_config.delivery.topic` to that value.
3. Install the **ntfy** app on your iPhone (App Store), open it, tap
   subscribe (`+`), and enter the exact same topic name. Send a test:
   ```
   curl -d "test" https://ntfy.sh/jack-vigil-9f2a
   ```
   You should get a push notification within a few seconds.
4. `state.json` is seeded from your real recent sessions but will drift —
   correct it by hand, or keep it current with `npm run log` (below).

`state.json` and `journal.jsonl` are gitignored: one holds a secret topic
name, the other is your day-to-day behavior log. Neither belongs in git.

## Daily use

```
npm run log -- done pull "rows 5x5@72.5"
npm run log -- skip legs "work dinner"
```

Appends a dated entry to `state.json`. Takes ~10 seconds — if it starts
feeling like a chore, the experiment is at risk; log honestly anyway,
including skips.

## Previewing messages before going live

```
npm run check -- --dry-run
```

Evaluates the rules against `state.json` right now and prints what SGT
VIGIL would say, without delivering or journaling anything.

To rehearse a specific scenario without touching your real state, point it
at a fixture and a fabricated timestamp:

```
npm run check -- --dry-run --now=2026-07-13T17:50:00+04:00 --state=fixtures/r1.json
```

`fixtures/r1.json`–`r4.json` are hand-built scenarios that each trigger
exactly one rule (R1–R4) — useful for tuning
`../coach-prompts/proactive-extension.md` without waiting for a real trigger.

## Running for real

```
npm run check
```

Evaluates the rules, and if one fires, generates the message, delivers it
via ntfy, and appends it to `journal.jsonl`. This is what cron calls.

## Installing the cron job (macOS)

Your `node` is managed by nvm, which cron won't have on its PATH — so the
crontab line needs the absolute path to both `node` and this repo. On this
machine that's:

```
/Users/jackkennedy/.nvm/versions/node/v20.19.3/bin/node
/Users/jackkennedy/dev/vigil-app/proactive
```

(Re-check with `which node` if you ever switch node versions via nvm —
the path is version-pinned and will break silently otherwise.)

1. Open your crontab:
   ```
   crontab -e
   ```
2. Add this line (every 30 min, 06:30–21:30):
   ```
   */30 6-21 * * * cd /Users/jackkennedy/dev/vigil-app/proactive && /Users/jackkennedy/.nvm/versions/node/v20.19.3/bin/node /Users/jackkennedy/dev/vigil-app/node_modules/tsx/dist/cli.mjs src/check.ts >> /Users/jackkennedy/dev/vigil-app/proactive/cron.log 2>&1
   ```
   The `6-21` hour range is a coarse gate — the rules engine's own quiet-hours
   check (06:30/21:30) is what actually enforces the precise boundary. This
   exact command (swap `--dry-run` in to check) has already been verified to
   run cleanly on this machine.

   Note `tsx` is resolved from the **repo root** `node_modules`, not
   `proactive/node_modules` — since `packages/core` was added as an npm
   workspace, `npm install` at the root hoists shared dependencies like
   `tsx` there. A relative `node_modules/tsx/...` path (correct before the
   workspace existed) silently stops resolving after any `npm install` at
   root; this is why the path above is absolute.
3. Save and quit. Confirm it's registered: `crontab -l`.
4. **Grant cron Full Disk Access** if macOS blocks the job silently:
   System Settings → Privacy & Security → Full Disk Access → add
   `/usr/sbin/cron`.
5. Your laptop must be awake for a tick to run — sleep = a missed check.
   Note misses in the journal if they matter for a given day.

To stop the experiment: `crontab -e` and delete the line.

## Files

- `state.json` — current source of truth (gitignored; personal + has the ntfy topic)
- `journal.jsonl` — every message that actually fired, appended by `check.ts` (gitignored)
- `fixtures/` — hand-built scenarios for dry-run rehearsal (safe to commit, no secrets)
- `src/rules.ts` — pure rules engine (state, now, fired-history) → rule or null
- `src/rules.test.ts` — unit tests per rule; run with `npm test`
- `src/message.ts` — assembles the prompt and calls Claude for the one-line message
- `src/deliver.ts` — ntfy POST + journal append
- `src/check.ts` — cron entrypoint (`--dry-run`, `--now=`, `--state=`)
- `src/log.ts` — the `npm run log` command
