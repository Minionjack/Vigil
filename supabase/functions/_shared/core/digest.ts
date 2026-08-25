// VENDORED from packages/core/src/digest.ts — verbatim, no changes needed
// (no internal imports). See _shared/core/README.md for why this copy
// exists instead of importing packages/core directly.
export interface DigestEvent {
  occurred_at: string; // ISO timestamp — when the event actually happened, not when it was logged
  kind: string; // e.g. "session_completed", "session_skipped", "note", "nudge_fired", "nudge_outcome"
  payload: Record<string, unknown>;
}

/**
 * The digest prompt is the highest fabrication risk in the roadmap: an LLM
 * writing summaries that later re-enter prompts as if they were ground
 * truth is patterns_noted industrialized (LESSONS.md). It receives ONLY
 * raw events for the period — no pre-computed stats — and is explicitly
 * forbidden from stating anything numeric. Numbers always come fresher and
 * truer from the separately computed Verified stats block; this digest is
 * read alongside that block, never instead of it.
 *
 * Round 3 of prompt-tuning on this exact failure mode (see core-rules.md's
 * "Memory digests" section) found that "no numbers/dates" alone wasn't
 * the real boundary: a digest with zero digits still let a later reader
 * (chat's coach prompt) reattach a real event's timing and a fabricated
 * excuse to a date it was never told, because the digest's own prose
 * described *when-relative-to-the-period* something happened ("opened
 * with...", "leaving it ambiguous whether it landed") — hedged language
 * that still reads as a citable specific once combined with the period's
 * real start/end dates rendered alongside it. The constraint below is
 * structural instead of enumerating fact-types: no specific event,
 * session type, or outcome gets reattached to a moment in time at all,
 * hedged or not.
 */
export function buildDigestPrompt(events: DigestEvent[], periodStart: string, periodEnd: string): string {
  const eventLines = events.map((e) => `- ${e.occurred_at} [${e.kind}] ${JSON.stringify(e.payload)}`).join("\n");

  return `You are summarizing a client's raw activity log for a coaching memory system, covering ${periodStart} to ${periodEnd}.

## Non-negotiable constraint
You are FORBIDDEN from stating any number, count, streak, date, day name, or "X of Y" claim, in digits or in words. You are ALSO FORBIDDEN from naming a specific session type (Push/Pull/Legs) or reattaching any outcome — a nudge landing or not, a session happening or not, an excuse being given — to a specific day, even in hedged or uncertain language. "Leaving it ambiguous whether the nudge landed" is exactly the pattern to avoid, not a safe way to phrase it: hedging doesn't stop it from reading as a citable specific once a real date sits next to it. Those specifics are always available fresher and truer from Verified stats and the raw event log, injected alongside this digest — your job is qualitative texture only: the general mood of the period, the tone excuses tend to take, what stood out behaviorally as a whole. If you find yourself about to describe a specific event, session type, or when something happened, stop and describe the general pattern instead — nothing you write here should read as something a later reader could quote back as if verified.

## Raw events for this period
${eventLines || "(no events logged this period)"}

## Output
Write 2-4 sentences of qualitative impression only — no numbers, dates, day names, session types, or specific-day outcome claims, in digits or spelled out, hedged or not. This will be injected into a coach's prompt under a header that already labels it an LLM-written impression, not fact — you don't need to caveat that yourself, just don't write anything specific enough to be mistaken for one.`;
}
