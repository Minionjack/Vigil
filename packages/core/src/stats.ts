import { daysBetween } from "./dateTz.js";

export interface CoreSession {
  date: string; // YYYY-MM-DD
  type: string;
  status: "completed" | "skipped";
  excuse?: string;
}

export interface TypeStats {
  completed: number;
  skipped: number;
  skipEntries: { date: string; excuse: string }[];
  daysSinceLastCompleted: number | null;
}

export interface WeightEntry {
  date: string; // YYYY-MM-DD
  weight_kg: number;
}

/**
 * The only numbers a generated message may cite as a count, streak,
 * "X of Y", or "N days since" claim. Prevents inventing a plateau or trend
 * for a session type with zero completed entries — the exact shape of the
 * patterns_noted bug (see LESSONS.md). Single implementation shared by
 * chat and proactive — this used to exist twice, with incompatible shapes
 * and an implicit-vs-explicit timezone inconsistency in the weekday helper
 * each surface paired it with.
 */
export function computeSessionStats(sessions: CoreSession[], today: string): Record<string, TypeStats> {
  const stats: Record<string, TypeStats> = {};
  const lastCompletedDate: Record<string, string> = {};

  for (const s of sessions) {
    if (!stats[s.type]) stats[s.type] = { completed: 0, skipped: 0, skipEntries: [], daysSinceLastCompleted: null };
    if (s.status === "skipped") {
      stats[s.type].skipped += 1;
      stats[s.type].skipEntries.push({ date: s.date, excuse: s.excuse ?? "no excuse given" });
    } else {
      stats[s.type].completed += 1;
      if (!lastCompletedDate[s.type] || s.date > lastCompletedDate[s.type]) {
        lastCompletedDate[s.type] = s.date;
      }
    }
  }

  // Single pass over the (small) set of distinct types, not the full
  // session list again per type — daysSince() is the standalone version
  // of this same lookup, kept for one-off external callers, but this hot
  // path (called on every prompt build) tracks the latest completed date
  // inline above instead of re-scanning all sessions once per type.
  for (const type of Object.keys(stats)) {
    if (lastCompletedDate[type]) {
      const days = daysBetween(lastCompletedDate[type], today);
      stats[type].daysSinceLastCompleted = days < 0 ? null : days;
    }
  }

  return stats;
}

/**
 * Renders the Verified stats block. `latestWeight` is a number and a date,
 * never a rate — no pace or projection is computed here or anywhere in
 * this package (BRIEF-PHASE2.md's explicit rule). Pass `null` when no
 * weigh-in has ever been logged; the absence is stated plainly, the same
 * way a session type with zero completions is, rather than omitted.
 */
export function renderVerifiedStats(stats: Record<string, TypeStats>, latestWeight: WeightEntry | null = null): string {
  const sessionLines = Object.entries(stats).map(([type, s]) => {
    if (s.completed === 0 && s.skipped > 0) {
      const dates = s.skipEntries.map((e) => `${e.date} ("${e.excuse}")`).join(", ");
      return `- ${type}: 0 completed, ${s.skipped} skipped in logged history (${dates}). No ${type.toLowerCase()} performance data exists — never reference progress, plateaus, or numbers for this type; state plainly that none has been logged.`;
    }
    const skipNote = s.skipped > 0 ? `${s.skipped} skipped` : "never skipped";
    const since = s.daysSinceLastCompleted;
    const sinceNote = since === null ? "" : since === 0 ? ", last completed today" : `, last completed ${since} day${since === 1 ? "" : "s"} ago`;
    return `- ${type}: ${s.completed} completed, ${skipNote}${sinceNote}, in logged history.`;
  });

  const weightLine =
    latestWeight === null
      ? "- Weight: none logged yet. State plainly that no weigh-in exists; never estimate one."
      : `- Weight: last logged ${latestWeight.weight_kg}kg on ${latestWeight.date}. This is a point-in-time number, not a trend — never state a rate, a change, or a projection from it.`;

  return [...sessionLines, weightLine].join("\n");
}

/**
 * The literal skip history for one session type — date and verbatim
 * excuse, no similarity scoring. This is the only data a "this has
 * happened before" claim may cite from (see core-rules.md's Absence
 * section): matching an excuse to a type, deciding something is "the
 * third time," and treating distinct excuses as one recurring phrase are
 * derivation (fuzzy matching, counting, comparison) — the same class of
 * task computeSessionStats/computeNextScheduledSession already took out
 * of the model's hands. Code returns the exact list; it never summarizes,
 * dedupes, or flags similarity — that stays out of scope on purpose.
 */
export function findMatchingSkips(sessions: CoreSession[], type: string): { date: string; excuse: string }[] {
  return sessions
    .filter((s) => s.type === type && s.status === "skipped")
    .map((s) => ({ date: s.date, excuse: s.excuse ?? "no excuse given" }));
}

const SESSION_TYPES = ["Push", "Pull", "Legs"];

/**
 * Which session type an excuse/message is actually about — never left for
 * the model to guess from "whichever type has the most skips." A type is
 * relevant only if the athlete named it, or a rendered fact says it's due
 * today. Neither present means neither is stated: return undefined and let
 * the prompt say so explicitly rather than attributing a message to any
 * type at all.
 */
export function determineRelevantSessionType(message: string, dueTodayType: string | undefined): string | undefined {
  const named = SESSION_TYPES.find((t) => new RegExp(`\\b${t}\\b`, "i").test(message));
  return named ?? dueTodayType;
}

/**
 * Whether today's excuse text is literally identical to a prior skip's
 * excuse — exact string equality (trim + case-fold only), not similarity.
 * "Same excuse" / "word for word" is not a judgment call: it's `===`, and
 * an LLM asked to eyeball two semantically-adjacent strings ("work is
 * crazy" vs "12 hour workday") will confidently call them the same when
 * they aren't. Compute the boolean, render it as a fact, and the model
 * never gets to guess at it.
 */
export function findExactSkipMatch(
  entries: { date: string; excuse: string }[],
  currentText: string | null
): { date: string; excuse: string } | null {
  if (!currentText) return null;
  const normalize = (s: string) => s.trim().toLowerCase();
  const target = normalize(currentText);
  return entries.find((e) => normalize(e.excuse) === target) ?? null;
}
