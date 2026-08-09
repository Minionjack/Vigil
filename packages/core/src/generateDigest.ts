import Anthropic from "@anthropic-ai/sdk";
import { buildDigestPrompt } from "./digest.js";
import type { DigestEvent } from "./digest.js";

const MODEL = "claude-sonnet-4-6";

let anthropic: Anthropic | null = null;

function client(): Anthropic {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("Missing ANTHROPIC_API_KEY.");
    }
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

export async function generateDigest(events: DigestEvent[], periodStart: string, periodEnd: string): Promise<string> {
  const system = buildDigestPrompt(events, periodStart, periodEnd);

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 256,
    system,
    messages: [{ role: "user", content: "Write the digest now." }],
  });

  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
