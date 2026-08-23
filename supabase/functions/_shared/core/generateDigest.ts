// VENDORED from packages/core/src/generateDigest.ts — two changes from
// the original: the Anthropic SDK import uses the npm: specifier Deno
// requires (matching chat/index.ts's existing convention and pinned
// version), and ./digest.js -> ./digest.ts. See _shared/core/README.md
// for why this copy exists instead of importing packages/core directly.
import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import { buildDigestPrompt } from "./digest.ts";
import type { DigestEvent } from "./digest.ts";

const MODEL = "claude-sonnet-4-6";

let anthropic: Anthropic | null = null;

function client(): Anthropic {
  if (!anthropic) {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY.");
    }
    anthropic = new Anthropic({ apiKey });
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
