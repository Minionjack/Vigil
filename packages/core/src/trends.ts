export interface TrendEvent {
  occurred_at: string;
  kind: string;
  payload: Record<string, unknown>;
}

export interface LiftTrendPoint {
  date: string;
  topSetWeight_kg: number;
}

/**
 * Per-lift top-set weight over time, for the History screen's one trend
 * element (BRIEF-PHASE3.md: "no dashboard sprawl"). Groups by exercise
 * name (case-insensitive); a session logging the same exercise more than
 * once contributes its heaviest set as that day's point. Old-shape rows
 * (no `exercises` array — every row migrated before Phase 3, and any
 * future CLI-only write) are skipped rather than crashing, same
 * compatibility rule progression.ts's exerciseHistory follows.
 */
export function computeLiftTrends(events: TrendEvent[]): Record<string, LiftTrendPoint[]> {
  const trends: Record<string, LiftTrendPoint[]> = {};
  // First-seen casing wins as the canonical display name for a given
  // exercise key — without this, "Bench press" logged one session and
  // "bench press" logged another would silently fragment into two
  // separate trend series instead of one.
  const displayNameByKey = new Map<string, string>();

  const completedEvents = events
    .filter((e) => e.kind === "session_completed" && Array.isArray(e.payload.exercises))
    .sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : 0));

  for (const e of completedEvents) {
    const date = e.occurred_at.slice(0, 10);
    const exercises = e.payload.exercises as { exercise?: unknown; weight_kg?: unknown }[];

    const topSetByKey = new Map<string, number>();
    for (const ex of exercises) {
      if (typeof ex?.exercise !== "string" || typeof ex?.weight_kg !== "number") continue;
      const key = ex.exercise.trim().toLowerCase();
      if (!displayNameByKey.has(key)) displayNameByKey.set(key, ex.exercise.trim());
      const existing = topSetByKey.get(key);
      if (existing === undefined || ex.weight_kg > existing) {
        topSetByKey.set(key, ex.weight_kg);
      }
    }

    for (const [key, weight_kg] of topSetByKey) {
      const displayName = displayNameByKey.get(key)!;
      if (!trends[displayName]) trends[displayName] = [];
      trends[displayName].push({ date, topSetWeight_kg: weight_kg });
    }
  }

  return trends;
}
