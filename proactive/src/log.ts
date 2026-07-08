import path from "node:path";
import { appendJournal, readJournal } from "./deliver.js";
import { findUnresolvedNudge } from "./outcome.js";
import { dateStringInTz } from "./rules.js";
import { loadState, saveState } from "./state.js";

// Usage:
//   npm run log -- done pull "rows 5x5@72.5"
//   npm run log -- skip legs "work dinner"
function main() {
  const [action, type, ...noteWords] = process.argv.slice(2);
  const note = noteWords.join(" ");

  if ((action !== "done" && action !== "skip") || !type) {
    console.error('Usage: npm run log -- done <type> "<note>"');
    console.error('       npm run log -- skip <type> "<excuse>"');
    process.exitCode = 1;
    return;
  }

  const statePath = path.resolve(import.meta.dirname, "..", "state.json");
  const journalPath = path.resolve(import.meta.dirname, "..", "journal.jsonl");
  const state = loadState(statePath);
  const now = new Date();
  const today = dateStringInTz(now, state.client.timezone);

  const capitalizedType = type[0].toUpperCase() + type.slice(1);

  if (action === "done") {
    state.sessions.unshift({ date: today, type: capitalizedType, status: "completed", note });
  } else {
    state.sessions.unshift({ date: today, type: capitalizedType, status: "skipped", excuse: note });
  }

  saveState(statePath, state);
  console.log(`Logged: ${today} ${capitalizedType} — ${action}${note ? ` ("${note}")` : ""}`);

  // If a recent nudge is still waiting on an outcome, this log resolves it —
  // this is what the act-rate score at the end of the experiment reads from.
  const journal = readJournal(journalPath);
  const unresolved = findUnresolvedNudge(journal, now);
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
