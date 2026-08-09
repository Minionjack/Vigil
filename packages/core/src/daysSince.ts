import { daysBetween } from "./dateTz.js";
import type { CoreSession } from "./stats.js";

/**
 * Days since the most recent COMPLETED session of `type`, or null if none
 * exists. Closes the still-open inference gap from the original status
 * audit — before this, nothing computed "days since," so a prompt asking
 * for that context invited the model to subtract two dates itself, the
 * same class of arithmetic the countdown ban already exists to prevent.
 * (Not the same gap as the future-weekday one — that was closed separately
 * by computeNextScheduledSession, commit 0c6a9e6.)
 *
 * Returns null (not a negative number) if the most recent completion is
 * after `today` by this calculation. That can genuinely happen — a caller
 * computing `today` from a different clock/timezone reference than the one
 * the session date was logged against (e.g. a UTC calendar date late in
 * the day for a client east of UTC) can see a session dated "tomorrow"
 * relative to its own `today`. Rendering "-1 days ago" would be a wrong
 * fact stated as a verified one, which is the one thing this block exists
 * to never do — silence is the safe failure mode, not a nonsense number.
 */
export function daysSince(sessions: CoreSession[], type: string, today: string): number | null {
  const completedDates = sessions.filter((s) => s.type === type && s.status === "completed").map((s) => s.date);
  if (completedDates.length === 0) return null;
  const mostRecent = completedDates.reduce((latest, d) => (d > latest ? d : latest));
  const days = daysBetween(mostRecent, today);
  return days < 0 ? null : days;
}
