const DAY_MS = 24 * 60 * 60 * 1000;

export function dateStringInTz(date: Date, tz: string): string {
  return date.toLocaleDateString("en-CA", { timeZone: tz });
}

export function minutesSinceMidnightInTz(date: Date, tz: string): number {
  const time = date.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  const [h, m] = time.split(":").map(Number);
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

export function daysBetween(fromDateStr: string, toDateStr: string): number {
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
