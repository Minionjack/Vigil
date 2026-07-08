import fs from "node:fs";
import type { JournalEntry } from "./types.js";

export async function deliverNtfy(topic: string, message: string): Promise<void> {
  if (!topic || topic === "REPLACE-WITH-SECRET-TOPIC") {
    throw new Error("Set a real (hard-to-guess) ntfy topic in state.json under journal_config.delivery.topic first.");
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

export function readJournal(journalPath: string): JournalEntry[] {
  if (!fs.existsSync(journalPath)) return [];
  return fs
    .readFileSync(journalPath, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}
