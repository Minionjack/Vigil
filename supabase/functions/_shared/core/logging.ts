// VENDORED from packages/core/src/logging.ts — verbatim, no changes
// needed (no internal imports). See _shared/core/README.md for why this
// copy exists instead of importing packages/core directly.
//
// Two small, pure routing/classification gates for BRIEF-PHASE3.md's
// conversational logging flow. Neither of these decides WHAT was logged
// — that's still an LLM extraction call, confirmed before it's ever
// written (see supabase/functions/chat/index.ts). These only decide
// WHETHER to spend that call, and whether a reply counts as a yes/no —
// code-decided routing, same discipline as everything else in this
// package.

const SET_NOTATION = /\b\d+\s*x\s*\d+\b/i; // "4x6", "4 x 6"
const WEIGHT_MENTION = /\b\d+(\.\d+)?\s*kg\b/i;
const RPE_MENTION = /\brpe\s*\d+(\.\d+)?\b/i;
// Prefix match (no trailing \b) so "pressing", "benching", "curls" etc.
// still match — a real conjugation of a lift name is exactly the kind of
// message this needs to catch, not just the bare infinitive.
const LIFT_KEYWORD = /\b(bench|squat|deadlift|press|row|curl|pull-?up|chin-?up|lunge|fly|flies|extension|raise|shrug)\w*/i;

/**
 * Routing gate only — deliberately permissive. A lift-name mention or
 * rep notation is enough to route to extraction, even with no numbers
 * yet ("did some pressing, felt heavy" should route and come back
 * low-confidence, prompting a clarifying question — not be silently
 * treated as ordinary chat). The known tradeoff: a casual mention
 * ("how's my bench doing?") can also route and correctly come back with
 * nothing to extract. That's an extra small API call, not a data
 * integrity risk — nothing gets written without the confidence gate and
 * an explicit confirmation regardless. Real phrasing variety will likely
 * want this tuned; that tuning needs real usage, not guesswork now.
 */
export function looksLikeSetLog(text: string): boolean {
  return LIFT_KEYWORD.test(text) || SET_NOTATION.test(text) || (WEIGHT_MENTION.test(text) && RPE_MENTION.test(text));
}

export type ConfirmationClassification = "confirm" | "deny" | "unclear";

const CONFIRM_START = /^(yes|yep|yeah|yup|confirm|correct|that.?s right|sounds good|do it|log it|ok|okay)\b/i;
const DENY_START = /^(no|nope|nah|wrong|incorrect|cancel|don.?t|that.?s wrong)\b/i;

/**
 * Classifies a reply to a pending log proposal. "unclear" is the safe
 * default — anything that isn't a clean yes/no is treated as a
 * correction, re-running extraction seeded with the prior proposal,
 * rather than guessed as one or the other.
 */
export function classifyConfirmation(text: string): ConfirmationClassification {
  const trimmed = text.trim();
  if (CONFIRM_START.test(trimmed)) return "confirm";
  if (DENY_START.test(trimmed)) return "deny";
  return "unclear";
}
