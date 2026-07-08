import dotenv from "dotenv";
import path from "node:path";
import { appendJournal, deliverNtfy, readJournal } from "./deliver.js";
import { generateMessage } from "./message.js";
import { computeAcknowledgment, dateStringInTz, evaluateRules } from "./rules.js";
import { loadState } from "./state.js";
import type { FiredEntry, FiredLogEntry } from "./types.js";

// Reuse the API key from ../server/.env
dotenv.config({ path: path.resolve(import.meta.dirname, "..", "..", "server", ".env") });

function parseArgs(argv: string[]) {
  const args = { dryRun: false, now: undefined as string | undefined, state: undefined as string | undefined };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--now=")) args.now = arg.slice("--now=".length);
    else if (arg.startsWith("--state=")) args.state = arg.slice("--state=".length);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const statePath = path.resolve(args.state ?? path.join(import.meta.dirname, "..", "state.json"));
  const journalPath = path.resolve(import.meta.dirname, "..", "journal.jsonl");

  const state = loadState(statePath);
  const now = args.now ? new Date(args.now) : new Date();

  const journal = readJournal(journalPath);
  const firedEntries = journal.filter((entry): entry is FiredEntry => entry.kind === "fired");
  const firedLog: FiredLogEntry[] = firedEntries.map((entry) => ({
    date: dateStringInTz(new Date(entry.timestamp), state.client.timezone),
    rule: entry.rule,
  }));

  const fired = evaluateRules(state, now, firedLog);
  if (!fired) {
    console.log(`[${now.toISOString()}] No rule fired.`);
    return;
  }

  const ack = computeAcknowledgment(state, firedLog);
  const message = await generateMessage(state, now, fired, ack);
  const wordCount = message.split(/\s+/).filter(Boolean).length;

  console.log(`[${fired.rule}] ${fired.reason}`);
  if (ack) console.log(`(acknowledging ${ack.type} on ${ack.date})`);
  console.log(`"${message}"`);
  console.log(`(${wordCount} words)`);
  if (wordCount > 50) {
    console.warn("WARNING: over the 50-word cap — tune coach-prompts/proactive-extension.md, not this script.");
  }

  if (args.dryRun) {
    console.log("(dry run — not delivered, not journaled)");
    return;
  }

  await deliverNtfy(state.journal_config.delivery.topic, message);
  appendJournal(journalPath, {
    kind: "fired",
    timestamp: now.toISOString(),
    rule: fired.rule,
    message_text: message,
    delivered: true,
  });
  console.log("Delivered and journaled.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
