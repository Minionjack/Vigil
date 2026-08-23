// VENDORED from packages/core/src/personality.ts — verbatim, no changes
// needed (no internal imports). See _shared/core/README.md for why this
// copy exists instead of importing packages/core directly.
export type PersonalityId = "drill-sergeant" | "mentor" | "hype";

export const KNOWN_PERSONALITIES: readonly PersonalityId[] = ["drill-sergeant", "mentor", "hype"];

/**
 * Single source of truth for valid personality ids, shared by server and
 * proactive. This used to be an independently maintained copy in each
 * (plus a third copy of the literal union in proactive/src/types.ts) —
 * the same two-copies-drift shape BRIEF-PHASE1.md names as the reason
 * core-rules.md got pulled out of the per-surface prompt files. Falls
 * back to "drill-sergeant" for anything unrecognized rather than
 * throwing, on both surfaces.
 */
export function resolvePersonality(personality: string | undefined | null): PersonalityId {
  return KNOWN_PERSONALITIES.includes(personality as PersonalityId) ? (personality as PersonalityId) : "drill-sergeant";
}
