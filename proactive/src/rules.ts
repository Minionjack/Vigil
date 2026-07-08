import type { Acknowledgment, FiredLogEntry, RuleFired, State } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function dateStringInTz(date: Date, tz: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

export function minutesSinceMidnightInTz(date: Date, tz: string): number {
  const time = date.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// dateStr is an already tz-local calendar date, so anchoring at UTC noon and
// reading the weekday back in UTC avoids re-applying any timezone offset.
export function weekdayOfDateString(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const from = new Date(`${fromDateStr}T12:00:00Z`).getTime();
  const to = new Date(`${toDateStr}T12:00:00Z`).getTime();
  return Math.round((to - from) / DAY_MS);
}

// Stable per-week bucket key: the Monday that starts dateStr's week.
export function mondayOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function hasSessionOn(state: State, dateStr: string): boolean {
  return state.sessions.some((s) => s.date === dateStr);
}

function isTrainingDay(state: State, weekday: string): boolean {
  return state.client.training_days.includes(weekday);
}

function withinAllowedWindow(state: State, minutesNow: number): boolean {
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
export function evaluateRules(state: State, now: Date, firedLog: FiredLogEntry[]): RuleFired | null {
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
export function computeAcknowledgment(state: State, firedLog: FiredLogEntry[]): Acknowledgment | null {
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
