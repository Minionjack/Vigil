# Paste this into Claude Code

---

Read BRIEF-PROACTIVE.md, coach-prompts/proactive-extension.md and state.example.json in this folder. Build the proactive stub exactly as specified, inside the existing repo as a new top-level folder `./proactive/` (it shares coach-prompts/drill-sergeant.md with the server — import it from there, don't copy it).

Order of work:
1. `proactive/state.json` from the example (copy my real recent sessions in from fake-profile.json's structure — I'll correct the data by hand after).
2. `proactive/check.ts` — rules engine per the brief's table, including the 2/day cap and quiet hours. Pure function core (state in → fired rule or null) with unit tests for each rule, because I won't be able to eyeball cron behavior.
3. Claude call assembling drill-sergeant.md + proactive-extension.md + rendered state + fired rule. Reuse the .env key from ./server.
4. ntfy.sh delivery + journal.jsonl append.
5. `npm run log` command per the brief.
6. `npm run check -- --dry-run` that evaluates rules and prints the message WITHOUT delivering — I want to preview a week of hypothetical messages before going live.
7. The crontab line for every 30 min, 06:30–21:30, and exact install instructions for my Mac (including the ntfy iOS app + topic subscription).

Test each rule by feeding fabricated state (e.g. yesterday = training day with no session) through the dry run and show me the actual messages SGT VIGIL generates for R1–R4. If any message is generic, over 50 words, or asks a question into the void, fix the prompt extension, not the code.

---

## During the two weeks
- Log honestly, including skips. A gamed journal kills the experiment.
- Don't tune prompts mid-week. Note irritations in the journal instead; batch changes Sunday.
- If a message genuinely annoys you, that's data — write down WHY (timing? tone? repetition?).
