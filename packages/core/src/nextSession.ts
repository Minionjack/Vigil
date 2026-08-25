import { addDays, weekdayOfDateString } from "./dateTz.js";

export interface NextScheduledSession {
  date: string; // YYYY-MM-DD
  weekday: string;
}

/**
 * The next day the client is due to train — today counts if it's a
 * training day and nothing's logged for it yet. Computed here (not left
 * for the model to infer from the weekday pattern on past sessions) so a
 * future session's date/weekday is always a rendered fact, never a guess.
 * Surface-agnostic: takes plain training-day names and already-logged
 * dates rather than a surface-specific state shape.
 */
export function computeNextScheduledSession(trainingDays: string[], loggedDates: string[], today: string): NextScheduledSession {
  // < 8, not < 7: a profile with only one training day whose sole
  // occurrence this week is already logged needs the wraparound day
  // (offset 7 = next week's same weekday) to find anything at all —
  // found live when a single-training-day test profile threw here on
  // every request after its one session was logged for the day.
  for (let offset = 0; offset < 8; offset++) {
    const date = offset === 0 ? today : addDays(today, offset);
    const weekday = weekdayOfDateString(date);
    if (!trainingDays.includes(weekday)) continue;
    if (offset === 0 && loggedDates.includes(date)) continue;
    return { date, weekday };
  }
  throw new Error("No training days configured");
}
