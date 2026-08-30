// VENDORED from packages/core/src/generateDigest.ts — three mechanical
// changes from the original: the Anthropic SDK import uses the npm:
// specifier Deno requires (matching chat/index.ts's existing convention
// and pinned version), ./digest.js -> ./digest.ts, and every
// process.env.X becomes Deno.env.get("X") (kept as the same plain
// double-read source uses, deliberately not hoisted into a local
// variable, so this rewrite stays a token substitution the vendoring
// drift check can verify — see scripts/check-vendor-drift.ts). See
// _shared/core/README.md for why this copy exists instead of importing
// packages/core directly.
import Anthropic from "npm:@anthropic-ai/sdk@0.110.0";
import { buildDigestPrompt } from "./digest.ts";
import type { DigestEvent } from "./digest.ts";

const MODEL = "claude-sonnet-4-6";

let anthropic: Anthropic | null = null;

function client(): Anthropic {
  if (!anthropic) {
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      throw new Error("Missing ANTHROPIC_API_KEY.");
    }
    anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
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
