import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { dateStringInTz, resolvePersonality } from "@vigil/core";
import { renderState } from "./state.js";
import type { Acknowledgment, RuleFired, State } from "./types.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const MODEL = "claude-sonnet-4-6";

let anthropic: Anthropic | null = null;

function client(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY. Add it to server/.env (this folder reuses that key).");
    }
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

export function buildSystemPrompt(state: State, now: Date, fired: RuleFired, ack: Acknowledgment | null): string {
  const coreRules = fs.readFileSync(path.join(REPO_ROOT, "coach-prompts", "core-rules.md"), "utf-8").trim();
  const voice = fs
    .readFileSync(
      path.join(REPO_ROOT, "coach-prompts", "personalities", `${resolvePersonality(state.client.personality)}.md`),
      "utf-8"
    )
    .trim();
  const extension = fs.readFileSync(path.join(REPO_ROOT, "coach-prompts", "proactive-extension.md"), "utf-8").trim();
  const today = dateStringInTz(now, state.client.timezone);
  const clientFile = renderState(state, today);

  const ruleLine = `## Rule fired: ${fired.rule}\nReason: ${fired.reason}`;
  const ackLine = ack
    ? `\n\nBefore anything else, acknowledge in one short line that the ${ack.type} session on ${ack.date} got done — you nudged him into it. Then continue with this message's own point.`
    : "";

  return `${coreRules}\n\n${voice}\n\n${extension}\n\n${clientFile}\n\n${ruleLine}${ackLine}`;
}

export async function generateMessage(
  state: State,
  now: Date,
  fired: RuleFired,
  ack: Acknowledgment | null
): Promise<string> {
  const system = buildSystemPrompt(state, now, fired, ack);

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 256,
    system,
    messages: [{ role: "user", content: "Generate the outbound message now." }],
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
