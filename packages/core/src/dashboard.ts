import { daysBetween, mondayOfWeek, addDays } from "./dateTz.js";
import type { CoreSession } from "./stats.js";

// Phase 5, ungated slice — the consistency dashboard. All three stats
// here are new computations, not reuses of something half-built (no
// "streak" existed anywhere in this package before this file). Per-lift
// trends are NOT here — they reuse the already-built computeLiftTrends
// (trends.ts), which the history endpoint already computes.

export interface WeeklyBreakdown {
  weekStart: string; // Monday, YYYY-MM-DD
  completed: number;
  scheduled: number;
}

export interface DashboardStats {
  currentStreak: number;
  weeklyBreakdown: WeeklyBreakdown[]; // trailing weeksBack weeks, oldest first
  perTypeCompletion: Record<string, { completed: number; skipped: number }>; // within the same trailing window
}

/**
 * Current streak: consecutive *completed* sessions counting backward
 * from the most recent logged one, in log order (not calendar-day
 * order — a rest day between two completed sessions doesn't break it,
 * a skip does). The first skip encountered stops the count; an empty
 * log or a most-recent entry that's a skip both give 0. Stated
 * explicitly here because the brief itself doesn't define "streak" —
 * this is the one definition the dashboard uses, not left ambiguous
 * per caller.
 */
function computeCurrentStreak(sessions: CoreSession[]): number {
  const chronological = [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1)); // most recent first
  let streak = 0;
  for (const s of chronological) {
    if (s.status === "skipped") break;
    streak += 1;
  }
  return streak;
}

function computeWeeklyBreakdown(sessions: CoreSession[], trainingDays: string[], today: string, weeksBack: number): WeeklyBreakdown[] {
  const scheduled = trainingDays.length;
  const currentWeekStart = mondayOfWeek(today);

  const breakdown: WeeklyBreakdown[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekStart = addDays(currentWeekStart, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    const completed = sessions.filter((s) => s.status === "completed" && s.date >= weekStart && s.date <= weekEnd).length;
    breakdown.push({ weekStart, completed, scheduled });
  }
  return breakdown;
}

function computePerTypeCompletion(sessions: CoreSession[], today: string, weeksBack: number): Record<string, { completed: number; skipped: number }> {
  const windowDays = weeksBack * 7;
  const result: Record<string, { completed: number; skipped: number }> = {};
  for (const s of sessions) {
    const age = daysBetween(s.date, today);
    if (age < 0 || age > windowDays) continue;
    if (!result[s.type]) result[s.type] = { completed: 0, skipped: 0 };
    if (s.status === "completed") result[s.type].completed += 1;
    else result[s.type].skipped += 1;
  }
  return result;
}

export function computeDashboardStats(sessions: CoreSession[], trainingDays: string[], today: string, weeksBack: number): DashboardStats {
  return {
    currentStreak: computeCurrentStreak(sessions),
    weeklyBreakdown: computeWeeklyBreakdown(sessions, trainingDays, today, weeksBack),
    perTypeCompletion: computePerTypeCompletion(sessions, today, weeksBack),
  };
}
