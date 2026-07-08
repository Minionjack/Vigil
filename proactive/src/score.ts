import path from "node:path";
import { readJournal } from "./deliver.js";
import type { FiredEntry, OutcomeEntry, RuleId } from "./types.js";

// Prints per-rule fired counts and the act rate (nudges followed by a logged
// session within the acted-on window) — the decision-gate metric from
// BRIEF-PROACTIVE.md's two-week protocol.
function main() {
  const journalPath = path.resolve(import.meta.dirname, "..", "journal.jsonl");
  const journal = readJournal(journalPath);

  const fired = journal.filter((e): e is FiredEntry => e.kind === "fired");
  const outcomes = journal.filter((e): e is OutcomeEntry => e.kind === "outcome");
  const outcomeByFiredAt = new Map(outcomes.map((o) => [o.fired_at, o]));

  if (fired.length === 0) {
    console.log("No messages logged yet.");
    return;
  }

  const rules: RuleId[] = ["R1", "R2", "R3", "R4"];
  let totalResolved = 0;
  let totalActed = 0;

  for (const rule of rules) {
    const ruleFired = fired.filter((f) => f.rule === rule);
    if (ruleFired.length === 0) continue;

    let acted = 0;
    let ignored = 0;
    let pending = 0;
    for (const f of ruleFired) {
      const outcome = outcomeByFiredAt.get(f.timestamp);
      if (!outcome) pending++;
      else if (outcome.acted) acted++;
      else ignored++;
    }
    totalResolved += acted + ignored;
    totalActed += acted;

    console.log(`${rule}: ${ruleFired.length} sent — ${acted} acted, ${ignored} ignored, ${pending} pending`);
  }

  console.log("---");
  console.log(`Total sent: ${fired.length}`);
  if (totalResolved > 0) {
    console.log(`Act rate (resolved only): ${Math.round((totalActed / totalResolved) * 100)}% (${totalActed}/${totalResolved})`);
  } else {
    console.log("Act rate: no resolved outcomes yet.");
  }
}

main();
