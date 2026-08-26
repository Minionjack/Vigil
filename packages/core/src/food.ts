import { daysBetween } from "./dateTz.js";

// Milestone 3.5, Part B — food logging. Deliberately the smallest
// possible computation: a count and a list of verbatim, dated entries,
// nothing else. No calorie/macro/protein field exists anywhere in this
// file or this package — the "never estimate nutrition" rule in
// core-rules.md is backed by there being no number to compute, not by a
// rule that could be forgotten. See DECISIONS.md for why food logging
// exists at all and why its register is deliberately not the training
// coach's.

export interface FoodEvent {
  occurred_at: string; // ISO
  payload: { text: string; items?: string[] };
}

export interface FoodEntry {
  date: string; // YYYY-MM-DD
  text: string;
  daysAgo: number; // 0 = today, 1 = yesterday, etc. — computed here so
  // the model never has to derive "today" vs "yesterday" from comparing
  // two raw date strings itself. Found live: without this, the model
  // said "yesterday" for an entry dated the exact same day it was told
  // was "today" — a relative-date computation left unrendered, same
  // disease as every other "computation wearing a sentence" bug found
  // tonight (see LESSONS.md), just in a feature built the same night.
}

export interface FoodStats {
  windowDays: number;
  count: number;
  entries: FoodEntry[]; // within the window, most recent first
}

/**
 * Pure, mirrors computeSessionStats's shape: a window of raw events in,
 * a count and dated verbatim entries out. Excludes future-dated entries
 * (a backfill mistake or clock skew) the same way session stats never
 * counts a not-yet-happened session.
 */
export function computeFoodStats(events: FoodEvent[], today: string, windowDays: number): FoodStats {
  const entries = events
    .map((e) => ({ date: e.occurred_at.slice(0, 10), text: e.payload.text, daysAgo: daysBetween(e.occurred_at.slice(0, 10), today) }))
    .filter((e) => e.daysAgo >= 0 && e.daysAgo <= windowDays)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return { windowDays, count: entries.length, entries };
}

/**
 * The rendered block — reminders baked into the header itself, same way
 * renderVerifiedStats's zero-completion line carries its own constraint
 * inline rather than trusting a separate rule to be remembered at the
 * point of use.
 */
export function renderFoodLog(stats: FoodStats): string {
  const header = `## Food log (last ${stats.windowDays} days) — descriptive only: never estimate calories/macros/nutrition from this, never judge or praise a meal, never raise this unprompted`;

  if (stats.count === 0) {
    return `${header}\nNo food logged in the last ${stats.windowDays} days.`;
  }

  const lines = stats.entries
    .map((e) => {
      const relative = e.daysAgo === 0 ? "today" : e.daysAgo === 1 ? "yesterday" : `${e.daysAgo} days ago`;
      return `- ${e.date} (${relative}): "${e.text}"`;
    })
    .join("\n");
  return `${header}\n${stats.count} ${stats.count === 1 ? "entry" : "entries"} logged in the last ${stats.windowDays} days:\n${lines}`;
}
