import dotenv from "dotenv";
import path from "node:path";
import { appendJournal, deliverNtfy, readJournal } from "./deliver.js";
import { generateMessage } from "./message.js";
import { dateStringInTz } from "@vigil/core";
import { computeAcknowledgment, evaluateRules } from "./rules.js";
import { loadState } from "./state.js";
import type { Acknowledgment, FiredEntry, FiredLogEntry, RuleFired, State } from "./types.js";

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

export interface CheckDeps {
  generateMessage: (state: State, now: Date, fired: RuleFired, ack: Acknowledgment | null) => Promise<string>;
  deliverNtfy: (topic: string, message: string) => Promise<void>;
  appendJournal: (journalPath: string, entry: FiredEntry) => void;
}

const realDeps: CheckDeps = { generateMessage, deliverNtfy, appendJournal };

export interface CheckResult {
  fired: RuleFired | null;
  ack: Acknowledgment | null;
  message: string | null;
  delivered: boolean;
  journaled: boolean;
}

/**
 * The actual orchestration this whole file exists for: given a state, the
 * current instant, and the fired-rule history, decide whether to speak,
 * generate the message, and (unless dry-run) deliver + journal it. Kept
 * separate from main()'s argv/file-path/console-output concerns and given
 * an injectable deps object specifically so this can be unit-tested
 * without hitting the real network or filesystem — this was the single
 * highest-risk untested path in the repo per the architecture-hardening
 * audit: the actual cron entrypoint had zero automated coverage, and a
 * real incident (the tsx path silently breaking after a workspace
 * migration) was only ever caught by manually simulating a tick.
 */
export async function runCheck(
  state: State,
  now: Date,
  firedLog: FiredLogEntry[],
  journalPath: string,
  dryRun: boolean,
  deps: CheckDeps = realDeps
): Promise<CheckResult> {
  const fired = evaluateRules(state, now, firedLog);
  if (!fired) {
    return { fired: null, ack: null, message: null, delivered: false, journaled: false };
  }

  const ack = computeAcknowledgment(state, firedLog);
  const message = await deps.generateMessage(state, now, fired, ack);

  if (dryRun) {
    return { fired, ack, message, delivered: false, journaled: false };
  }

  await deps.deliverNtfy(state.journal_config.delivery.topic, message);
  deps.appendJournal(journalPath, {
    kind: "fired",
    timestamp: now.toISOString(),
    rule: fired.rule,
    message_text: message,
    delivered: true,
  });

  return { fired, ack, message, delivered: true, journaled: true };
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

  const result = await runCheck(state, now, firedLog, journalPath, args.dryRun);

  if (!result.fired) {
    console.log(`[${now.toISOString()}] No rule fired.`);
    return;
  }

  const wordCount = result.message!.split(/\s+/).filter(Boolean).length;

  console.log(`[${result.fired.rule}] ${result.fired.reason}`);
  if (result.ack) console.log(`(acknowledging ${result.ack.type} on ${result.ack.date})`);
  console.log(`"${result.message}"`);
  console.log(`(${wordCount} words)`);
  if (wordCount > 50) {
    console.warn("WARNING: over the 50-word cap — tune coach-prompts/proactive-extension.md, not this script.");
  }

  if (!result.delivered) {
    console.log("(dry run — not delivered, not journaled)");
    return;
  }

  console.log("Delivered and journaled.");
}

// Guarded so this module can be imported for testing (runCheck) without
// executing the CLI as a side effect of the import — same pattern as
// log.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
