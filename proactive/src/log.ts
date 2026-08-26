import path from "node:path";
import dotenv from "dotenv";
import { appendJournal, readJournal } from "./deliver.js";
import { findUnresolvedNudge } from "./outcome.js";
import { dateStringInTz } from "@vigil/core";
import { loadLiveState, recordSessionEvent, recordFoodEvent, requireEnv } from "./db.js";

dotenv.config({ path: path.resolve(import.meta.dirname, "..", "..", "server", ".env") });

// Rejects shapes the regex alone would let through as a real date, like
// 2026-02-30 — JS Date silently rolls that over to 2026-03-02 rather than
// erroring, which would log (and later render to the coach) a date the
// user never typed with no warning at all.
export function isValidCalendarDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Usage:
//   npm run log -- done pull "rows 5x5@72.5"
//   npm run log -- skip legs "work dinner"
//   npm run log -- done push "shoulders" --date=2026-07-17   (backfill a past date)
//   npm run log -- food "chicken and rice" [--date=YYYY-MM-DD]
async function main() {
  const rawArgs = process.argv.slice(2);
  const dateArg = rawArgs.find((a) => a.startsWith("--date="));
  const [action, ...rest] = rawArgs.filter((a) => !a.startsWith("--date="));

  if (action !== "done" && action !== "skip" && action !== "food") {
    console.error('Usage: npm run log -- done <type> "<note>"');
    console.error('       npm run log -- skip <type> "<excuse>"');
    console.error('       npm run log -- food "<description>" [--date=YYYY-MM-DD]');
    console.error('       npm run log -- done <type> "<note>" --date=YYYY-MM-DD   (backfill)');
    process.exitCode = 1;
    return;
  }

  const backfillDate = dateArg?.slice("--date=".length);
  if (backfillDate && (!/^\d{4}-\d{2}-\d{2}$/.test(backfillDate) || !isValidCalendarDate(backfillDate))) {
    console.error(`Invalid --date value "${backfillDate}" — expected a real calendar date, YYYY-MM-DD.`);
    process.exitCode = 1;
    return;
  }

  const journalPath = path.resolve(import.meta.dirname, "..", "journal.jsonl");
  const userId = requireEnv("PROACTIVE_USER_ID");
  const state = await loadLiveState(userId);
  const now = new Date();
  const date = backfillDate ?? dateStringInTz(now, state.client.timezone);

  if (action === "food") {
    const text = rest.join(" ");
    if (!text) {
      console.error('Usage: npm run log -- food "<description>" [--date=YYYY-MM-DD]');
      process.exitCode = 1;
      return;
    }
    // No "type", no outcome/nudge resolution — food logging doesn't
    // participate in the proactive rules engine at all (core-rules.md's
    // Food section, DECISIONS.md), so there's nothing to resolve here.
    await recordFoodEvent(userId, { date, text });
    console.log(`Logged: ${date} food — "${text}"`);
    return;
  }

  const [type, ...noteWords] = rest;
  const note = noteWords.join(" ");
  if (!type) {
    console.error('Usage: npm run log -- done <type> "<note>"');
    console.error('       npm run log -- skip <type> "<excuse>"');
    process.exitCode = 1;
    return;
  }

  const capitalizedType = type[0].toUpperCase() + type.slice(1);

  await recordSessionEvent(
    userId,
    action === "done"
      ? { date, type: capitalizedType, status: "completed", note }
      : { date, type: capitalizedType, status: "skipped", excuse: note }
  );
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

// Guarded so this module can be imported for testing (isValidCalendarDate)
// without executing the CLI as a side effect of the import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
