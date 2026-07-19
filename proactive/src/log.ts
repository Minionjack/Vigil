import path from "node:path";
import { appendJournal, readJournal } from "./deliver.js";
import { findUnresolvedNudge } from "./outcome.js";
import { dateStringInTz } from "./rules.js";
import { loadState, saveState } from "./state.js";

// Usage:
//   npm run log -- done pull "rows 5x5@72.5"
//   npm run log -- skip legs "work dinner"
//   npm run log -- done push "shoulders" --date=2026-07-17   (backfill a past date)
function main() {
  const rawArgs = process.argv.slice(2);
  const dateArg = rawArgs.find((a) => a.startsWith("--date="));
  const [action, type, ...noteWords] = rawArgs.filter((a) => !a.startsWith("--date="));
  const note = noteWords.join(" ");

  if ((action !== "done" && action !== "skip") || !type) {
    console.error('Usage: npm run log -- done <type> "<note>"');
    console.error('       npm run log -- skip <type> "<excuse>"');
    console.error('       npm run log -- done <type> "<note>" --date=YYYY-MM-DD   (backfill)');
    process.exitCode = 1;
    return;
  }

  const backfillDate = dateArg?.slice("--date=".length);
  if (backfillDate && !/^\d{4}-\d{2}-\d{2}$/.test(backfillDate)) {
    console.error(`Invalid --date value "${backfillDate}" — expected YYYY-MM-DD.`);
    process.exitCode = 1;
    return;
  }

  const statePath = path.resolve(import.meta.dirname, "..", "state.json");
  const journalPath = path.resolve(import.meta.dirname, "..", "journal.jsonl");
  const state = loadState(statePath);
  const now = new Date();
  const date = backfillDate ?? dateStringInTz(now, state.client.timezone);

  const capitalizedType = type[0].toUpperCase() + type.slice(1);

  if (action === "done") {
    state.sessions.unshift({ date, type: capitalizedType, status: "completed", note });
  } else {
    state.sessions.unshift({ date, type: capitalizedType, status: "skipped", excuse: note });
  }

  saveState(statePath, state);
  console.log(`Logged: ${date} ${capitalizedType} — ${action}${note ? ` ("${note}")` : ""}`);

  if (backfillDate) {
    // A backfilled entry isn't tied to "now" in any real-time sense, so it
    // can't correctly resolve a nudge via findUnresolvedNudge's now-relative
    // window — that would risk crediting today's live nudge for a session
    // that actually happened on a different day.
    console.log("Backfilled entry — skipping outcome resolution (resolve same-day nudges without --date instead).");
    return;
  }

  // If a recent nudge is still waiting on an outcome, this log resolves it —
  // this is what the act-rate score at the end of the experiment reads from.
  const journal = readJournal(journalPath);
  const unresolved = findUnresolvedNudge(journal, now, state.client.timezone);
  if (unresolved) {
    appendJournal(journalPath, {
      kind: "outcome",
      timestamp: now.toISOString(),
      rule: unresolved.rule,
      fired_at: unresolved.timestamp,
      acted: action === "done",
      note: `${action} ${capitalizedType}${note ? ` — ${note}` : ""}`,
    });
    console.log(`Resolved ${unresolved.rule} nudge (fired ${unresolved.timestamp}) as ${action === "done" ? "acted" : "ignored"}.`);
  }
}

main();
