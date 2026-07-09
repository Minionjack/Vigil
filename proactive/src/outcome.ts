import { dateStringInTz } from "./rules.js";
import type { FiredEntry, JournalEntry, OutcomeEntry } from "./types.js";

// R1 nudges about a session that's imminent (fires ~45min before), so "acted"
// only counts a session logged shortly after. R2/R3/R4 are not tied to a
// specific upcoming moment, so BRIEF-PROACTIVE.md's "same day" definition of
// acted applies to them instead — see isWithinActedWindow.
export const R1_WINDOW_HOURS = 4;

// No rule's window can stay open past this — R1's is 4h, and R2/R3/R4's
// "until end of the same calendar day" window is at most just under 24h
// (a nudge fired at 00:00:00 local). Entries are chronological, so once an
// entry is older than this, every earlier entry is older still — safe to
// stop scanning.
const MAX_POSSIBLE_WINDOW_MS = 24 * 60 * 60 * 1000;

function isWithinActedWindow(entry: FiredEntry, now: Date, timezone: string): boolean {
  const firedAt = new Date(entry.timestamp);
  if (now.getTime() < firedAt.getTime()) return false;

  if (entry.rule === "R1") {
    const ageMs = now.getTime() - firedAt.getTime();
    return ageMs <= R1_WINDOW_HOURS * 60 * 60 * 1000;
  }

  // R2, R3, R4: eligible any time before midnight local time on the day the
  // nudge fired, per client timezone — not a fixed hour count.
  return dateStringInTz(now, timezone) === dateStringInTz(firedAt, timezone);
}

/**
 * Find the most recent delivered nudge that hasn't been resolved with an
 * outcome yet, and is still within its rule's acted-on window (see
 * isWithinActedWindow).
 */
export function findUnresolvedNudge(journal: JournalEntry[], now: Date, timezone: string): FiredEntry | null {
  const fired = journal.filter((e): e is FiredEntry => e.kind === "fired");
  const resolved = new Set(
    journal.filter((e): e is OutcomeEntry => e.kind === "outcome").map((e) => e.fired_at)
  );

  for (let i = fired.length - 1; i >= 0; i--) {
    const entry = fired[i];
    const ageMs = now.getTime() - new Date(entry.timestamp).getTime();
    if (ageMs > MAX_POSSIBLE_WINDOW_MS) break;
    if (resolved.has(entry.timestamp)) continue;
    if (!isWithinActedWindow(entry, now, timezone)) continue;
    return entry;
  }

  return null;
}
