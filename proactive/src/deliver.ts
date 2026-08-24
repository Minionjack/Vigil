import fs from "node:fs";
import type { JournalEntry } from "./types.js";

export async function deliverNtfy(topic: string, message: string): Promise<void> {
  if (!topic || topic === "REPLACE-WITH-SECRET-TOPIC") {
    throw new Error("Set a real (hard-to-guess) ntfy topic in local-config.json under journal_config.delivery.topic first.");
  }

  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: "POST",
    body: message,
    headers: { Title: "SGT VIGIL" },
  });

  if (!res.ok) {
    throw new Error(`ntfy delivery failed: ${res.status} ${await res.text()}`);
  }
}

export function appendJournal(journalPath: string, entry: JournalEntry): void {
  fs.appendFileSync(journalPath, JSON.stringify(entry) + "\n");
}

/**
 * A single corrupted line (a crashed write, a disk-full truncation, a bad
 * manual edit) used to throw here and disable every future proactive tick
 * until someone noticed and repaired the file by hand — flagged in the
 * original status audit and left open until now. Skips and logs the bad
 * line instead; one damaged entry shouldn't take down the whole journal.
 */
export function readJournal(journalPath: string): JournalEntry[] {
  if (!fs.existsSync(journalPath)) return [];
  const lines = fs
    .readFileSync(journalPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  const entries: JournalEntry[] = [];
  lines.forEach((line, i) => {
    try {
      entries.push(JSON.parse(line));
    } catch (err) {
      console.error(`readJournal: skipping corrupted line ${i + 1} in ${journalPath}: ${(err as Error).message}`);
    }
  });
  return entries;
}
