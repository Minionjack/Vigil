import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, expect } from "vitest";
import { appendJournal, readJournal } from "./deliver.js";

function tempJournalPath(): string {
  return path.join(os.tmpdir(), `vigil-journal-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

test("readJournal returns an empty array when the file doesn't exist", () => {
  expect(readJournal(tempJournalPath())).toEqual([]);
});

test("readJournal round-trips entries written by appendJournal", () => {
  const p = tempJournalPath();
  try {
    appendJournal(p, { kind: "fired", timestamp: "2026-07-13T14:00:00Z", rule: "R1", message_text: "test", delivered: true });
    appendJournal(p, { kind: "outcome", timestamp: "2026-07-13T15:00:00Z", rule: "R1", fired_at: "2026-07-13T14:00:00Z", acted: true });
    const entries = readJournal(p);
    expect(entries.length).toBe(2);
    expect(entries[0].kind).toBe("fired");
    expect(entries[1].kind).toBe("outcome");
  } finally {
    fs.rmSync(p, { force: true });
  }
});

test("readJournal skips a corrupted line instead of throwing, and keeps the entries around it", () => {
  const p = tempJournalPath();
  try {
    const goodBefore = JSON.stringify({ kind: "fired", timestamp: "2026-07-13T14:00:00Z", rule: "R1", message_text: "a", delivered: true });
    const goodAfter = JSON.stringify({ kind: "fired", timestamp: "2026-07-14T14:00:00Z", rule: "R2", message_text: "b", delivered: true });
    fs.writeFileSync(p, `${goodBefore}\n{not valid json at all\n${goodAfter}\n`);

    const entries = readJournal(p);
    expect(entries.length).toBe(2);
    expect((entries[0] as { message_text: string }).message_text).toBe("a");
    expect((entries[1] as { message_text: string }).message_text).toBe("b");
  } finally {
    fs.rmSync(p, { force: true });
  }
});
