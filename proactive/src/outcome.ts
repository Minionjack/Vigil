import type { FiredEntry, JournalEntry, OutcomeEntry } from "./types.js";

export const ACTED_WINDOW_HOURS = 3;

/**
 * Find the most recent delivered nudge that hasn't been resolved with an
 * outcome yet, and is still within the acted-on window. Entries are
 * chronological, so once we hit one older than the window every earlier
 * entry is older still — safe to stop scanning.
 */
export function findUnresolvedNudge(
  journal: JournalEntry[],
  now: Date,
  windowHours: number = ACTED_WINDOW_HOURS
): FiredEntry | null {
  const fired = journal.filter((e): e is FiredEntry => e.kind === "fired");
  const resolved = new Set(
    journal.filter((e): e is OutcomeEntry => e.kind === "outcome").map((e) => e.fired_at)
  );

  for (let i = fired.length - 1; i >= 0; i--) {
    const entry = fired[i];
    const ageMs = now.getTime() - new Date(entry.timestamp).getTime();
    if (ageMs > windowHours * 60 * 60 * 1000) break;
    if (resolved.has(entry.timestamp)) continue;
    return entry;
  }

  return null;
}
