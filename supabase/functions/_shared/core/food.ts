// VENDORED from packages/core/src/food.ts — only change is the import
// extension (./dateTz.js -> ./dateTz.ts, Deno-correct). See
// _shared/core/README.md for why this copy exists instead of importing
// packages/core directly.
import { daysBetween } from "./dateTz.ts";

// Milestone 3.5, Part B — food logging. Deliberately the smallest
// possible computation: a count and a list of verbatim, dated entries,
// nothing else. No calorie/macro/protein field is ever *computed* in
// this file or this package — this app never estimates nutrition
// itself (core-rules.md, DECISIONS.md). A stored calorie estimate can
// exist, but only as data handed in from outside (Gemini, per the
// "Food logging gains external calorie estimation" decision in
// DECISIONS.md) with mandatory provenance — see
// validateFoodEstimateProvenance below.

export interface FoodEvent {
  occurred_at: string; // ISO
  payload: { text: string; items?: string[]; calories_est?: number; source?: string; estimated_at?: string };
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
  caloriesEst?: number;
  source?: string;
}

export interface FoodStats {
  windowDays: number;
  count: number;
  entries: FoodEntry[]; // within the window, most recent first
  totalCaloriesEst: number; // sum over entries that have an estimate only
  entriesWithEstimate: number;
  entriesWithoutEstimate: number; // rendered explicitly — a total that
  // silently ignores unestimated meals reads as more complete than it is
}

export interface FoodEstimateProvenance {
  calories_est: number;
  source: string;
  estimated_at: string; // ISO
}

/**
 * "Provenance is mandatory on any stored calorie estimate" — all three
 * fields or none. Fails loudly rather than writing a partial or
 * defaulted estimate: a caller that has a calorie number but no source,
 * or a source but no timestamp, has a bug, not a valid partial state.
 */
export function validateFoodEstimateProvenance(fields: {
  calories_est?: number;
  source?: string;
  estimated_at?: string;
}): FoodEstimateProvenance | undefined {
  const { calories_est, source, estimated_at } = fields;
  const presentCount = [calories_est !== undefined, source !== undefined && source !== "", estimated_at !== undefined && estimated_at !== ""].filter(
    Boolean
  ).length;

  if (presentCount === 0) return undefined;
  if (presentCount < 3) {
    throw new Error(
      `Incomplete calorie-estimate provenance: calories_est, source, and estimated_at must all be present together, or none at all (got ${presentCount}/3).`
    );
  }
  return { calories_est: calories_est!, source: source!, estimated_at: estimated_at! };
}

/**
 * Pure, mirrors computeSessionStats's shape: a window of raw events in,
 * a count and dated verbatim entries out. Excludes future-dated entries
 * (a backfill mistake or clock skew) the same way session stats never
 * counts a not-yet-happened session.
 */
export function computeFoodStats(events: FoodEvent[], today: string, windowDays: number): FoodStats {
  const entries = events
    .map((e) => {
      const { text, calories_est, source } = e.payload;
      // A read-time defensive check, not the enforcement point: an
      // incomplete triple (bypassing validateFoodEstimateProvenance,
      // which runs at write time) is treated as no estimate rather than
      // thrown on here — one corrupt historical row should never crash
      // an otherwise-fine render.
      const hasCompleteEstimate = calories_est !== undefined && source !== undefined && source !== "";
      return {
        date: e.occurred_at.slice(0, 10),
        text,
        daysAgo: daysBetween(e.occurred_at.slice(0, 10), today),
        ...(hasCompleteEstimate ? { caloriesEst: calories_est, source } : {}),
      };
    })
    .filter((e) => e.daysAgo >= 0 && e.daysAgo <= windowDays)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const withEstimate = entries.filter((e) => e.caloriesEst !== undefined);
  const totalCaloriesEst = withEstimate.reduce((sum, e) => sum + (e.caloriesEst ?? 0), 0);

  return {
    windowDays,
    count: entries.length,
    entries,
    totalCaloriesEst,
    entriesWithEstimate: withEstimate.length,
    entriesWithoutEstimate: entries.length - withEstimate.length,
  };
}

/**
 * The rendered block — reminders baked into the header itself, same way
 * renderVerifiedStats's zero-completion line carries its own constraint
 * inline rather than trusting a separate rule to be remembered at the
 * point of use. A stored estimate (external, provenance-checked — see
 * DECISIONS.md) may be cited, always hedged and attributed; the model
 * still never produces one itself.
 */
export function renderFoodLog(stats: FoodStats): string {
  const header = `## Food log (last ${stats.windowDays} days) — descriptive only: never estimate calories/macros/nutrition yourself; you may cite a *stored* estimate below, always hedged and attributed to its source, never as a figure you computed. Never judge or praise a meal, never raise this unprompted.`;

  if (stats.count === 0) {
    return `${header}\nNo food logged in the last ${stats.windowDays} days.`;
  }

  const lines = stats.entries
    .map((e) => {
      const relative = e.daysAgo === 0 ? "today" : e.daysAgo === 1 ? "yesterday" : `${e.daysAgo} days ago`;
      const estimateNote = e.caloriesEst !== undefined ? ` — about ${e.caloriesEst} kcal, estimated via ${e.source}, not verified` : "";
      return `- ${e.date} (${relative}): "${e.text}"${estimateNote}`;
    })
    .join("\n");

  const summaryLine =
    stats.entriesWithEstimate > 0
      ? `\nEstimated total: ~${stats.totalCaloriesEst} kcal across ${stats.entriesWithEstimate} of ${stats.count} ${stats.count === 1 ? "entry" : "entries"}${
          stats.entriesWithoutEstimate > 0 ? ` (${stats.entriesWithoutEstimate} with no stored estimate)` : ""
        }.`
      : "";

  return `${header}\n${stats.count} ${stats.count === 1 ? "entry" : "entries"} logged in the last ${stats.windowDays} days:\n${lines}${summaryLine}`;
}
