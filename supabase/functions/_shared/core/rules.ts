// VENDORED from packages/core/src/rules.ts — only change is the import
// extension (./dateTz.js -> ./dateTz.ts, Deno-correct). See
// _shared/core/README.md for why this copy exists instead of importing
// packages/core directly.
import { addDays, dateStringInTz, daysBetween, minutesSinceMidnightInTz, mondayOfWeek, weekdayOfDateString } from "./dateTz.ts";

// Moved here from proactive/src/rules.ts (Phase 4, item 1) — the same
// migration dateTz's helpers already went through: this logic is no
// longer proactive-local, since the pg_cron edge function
// (supabase/functions/proactive-check) needs the identical rule
// evaluation, not a second copy. proactive/src/check.ts now imports
// evaluateRules/computeAcknowledgment from here.

export type RuleId = "R1" | "R2" | "R3" | "R4";

export interface FiredLogEntry {
  date: string; // tz-local YYYY-MM-DD the message fired on
  rule: RuleId;
}

export interface Acknowledgment {
  date: string;
  type: string;
}

export interface RuleFired {
  rule: RuleId;
  reason: string;
  patternType?: string;
}

/**
 * The narrowest shape evaluateRules/computeAcknowledgment actually read —
 * deliberately not proactive's full State (personality, current_program,
 * suggestions, delivery config), so any caller's richer state object
 * (proactive's State, a future edge-function-local shape) satisfies this
 * structurally without a cast.
 */
export interface RulesState {
  client: {
    training_days: string[];
    timezone: string;
    usual_session_time: string; // "HH:MM"
  };
  sessions: { date: string; status: "completed" | "skipped"; type: string }[];
  journal_config: {
    max_messages_per_day: number;
    quiet_hours: { before: string; after: string };
  };
}

const WEEK_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function hasSessionOn(state: RulesState, dateStr: string): boolean {
  return state.sessions.some((s) => s.date === dateStr);
}

function isTrainingDay(state: RulesState, weekday: string): boolean {
  return state.client.training_days.includes(weekday);
}

function withinAllowedWindow(state: RulesState, minutesNow: number): boolean {
  const before = minutesFromHHMM(state.journal_config.quiet_hours.before);
  const after = minutesFromHHMM(state.journal_config.quiet_hours.after);
  return minutesNow >= before && minutesNow <= after;
}

function lastTrainingDayName(trainingDays: string[]): string {
  return [...trainingDays].sort((a, b) => WEEK_ORDER.indexOf(b) - WEEK_ORDER.indexOf(a))[0];
}

/**
 * Pure rules engine: given the current state, the current instant, and the
 * historical log of when rules have already fired, decide which single rule
 * (if any) should fire right now. Rules decide WHEN; message generation
 * decides WHAT TO SAY.
 *
 * Priority when multiple rules are simultaneously eligible: R2 (time-bound to
 * the morning after) > R1 (time-bound to today's session window) > R4 (last
 * chance to save the week) > R3 (weekly catch-all, least time-sensitive).
 */
export function evaluateRules(state: RulesState, now: Date, firedLog: FiredLogEntry[]): RuleFired | null {
  const tz = state.client.timezone;
  const today = dateStringInTz(now, tz);
  const yesterday = addDays(today, -1);
  const minutesNow = minutesSinceMidnightInTz(now, tz);

  if (!withinAllowedWindow(state, minutesNow)) return null;

  const firedToday = firedLog.filter((f) => f.date === today);
  if (firedToday.length >= state.journal_config.max_messages_per_day) return null;

  const firedTodayRules = new Set(firedToday.map((f) => f.rule));
  const thisWeekKey = mondayOfWeek(today);
  const firedThisWeekRules = new Set(
    firedLog.filter((f) => mondayOfWeek(f.date) === thisWeekKey).map((f) => f.rule)
  );

  // R2 — no-show follow-up
  const yesterdayWeekday = weekdayOfDateString(yesterday);
  if (isTrainingDay(state, yesterdayWeekday) && !hasSessionOn(state, yesterday) && !firedTodayRules.has("R2")) {
    return { rule: "R2", reason: `${yesterdayWeekday} (${yesterday}) was a training day with nothing logged.` };
  }

  // R1 — pre-session nudge
  const todayWeekday = weekdayOfDateString(today);
  const nudgeThreshold = minutesFromHHMM(state.client.usual_session_time) - 45;
  if (
    isTrainingDay(state, todayWeekday) &&
    !hasSessionOn(state, today) &&
    minutesNow >= nudgeThreshold &&
    !firedTodayRules.has("R1")
  ) {
    return { rule: "R1", reason: `Today (${todayWeekday}) is a training day, nothing logged yet, within the nudge window.` };
  }

  // R4 — streak guard (last training day of the week onward)
  const scheduledThisWeek = state.client.training_days.length;
  const completedThisWeek = state.sessions.filter(
    (s) => s.status === "completed" && mondayOfWeek(s.date) === thisWeekKey
  ).length;
  const lastDay = lastTrainingDayName(state.client.training_days);
  const isOnOrAfterLastTrainingDay = WEEK_ORDER.indexOf(todayWeekday) >= WEEK_ORDER.indexOf(lastDay);
  if (
    isOnOrAfterLastTrainingDay &&
    completedThisWeek < scheduledThisWeek &&
    !firedThisWeekRules.has("R4")
  ) {
    return {
      rule: "R4",
      reason: `${completedThisWeek}/${scheduledThisWeek} sessions completed this week and it's ${todayWeekday}, the last scheduled day.`,
    };
  }

  // R3 — pattern alert (same session type skipped 2+ times in trailing 21 days)
  const skipCounts = new Map<string, number>();
  for (const s of state.sessions) {
    const age = daysBetween(s.date, today);
    if (age < 0 || age > 21) continue;
    if (s.status !== "skipped") continue;
    skipCounts.set(s.type, (skipCounts.get(s.type) ?? 0) + 1);
  }
  const patternType = [...skipCounts.entries()].find(([, count]) => count >= 2)?.[0];
  if (patternType && !firedThisWeekRules.has("R3")) {
    return { rule: "R3", reason: `${patternType} skipped ${skipCounts.get(patternType)} times in the trailing 21 days.`, patternType };
  }

  return null;
}

/**
 * R5 modifier: if the most recent R1 nudge was followed by a completed
 * session on that same date, and no message has gone out since, the next
 * message should open by acknowledging it. Once any later message has fired,
 * we assume that message already carried the acknowledgment.
 */
export function computeAcknowledgment(state: RulesState, firedLog: FiredLogEntry[]): Acknowledgment | null {
  const r1Fires = firedLog.filter((f) => f.rule === "R1").sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const fire of r1Fires) {
    const session = state.sessions.find((s) => s.date === fire.date);
    if (session?.status !== "completed") continue;

    const acknowledgedAlready = firedLog.some((f) => f.date > fire.date);
    if (!acknowledgedAlready) {
      return { date: fire.date, type: session.type };
    }
  }

  return null;
}
