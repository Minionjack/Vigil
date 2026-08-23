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
 */
export function buildDigestPrompt(events: DigestEvent[], periodStart: string, periodEnd: string): string {
  const eventLines = events.map((e) => `- ${e.occurred_at} [${e.kind}] ${JSON.stringify(e.payload)}`).join("\n");

  return `You are summarizing a client's raw activity log for a coaching memory system, covering ${periodStart} to ${periodEnd}.

## Non-negotiable constraint
You are FORBIDDEN from stating any number, count, streak, date, or "X of Y" claim, in digits or in words. Those are always available fresher and truer from a separately computed Verified stats block injected alongside this digest — your job is qualitative texture only: recurring themes in excuses, the tone of notes, what stood out behaviorally about the period. If you find yourself about to write a number, stop and rephrase without it.

## Raw events for this period
${eventLines || "(no events logged this period)"}

## Output
Write 2-4 sentences of qualitative impression. No numbers, no dates, no counts, in digits or spelled out. This will be injected into a coach's prompt under a header that already labels it an LLM-written impression, not fact — you don't need to caveat that yourself, just don't violate the no-numbers rule.`;
}
