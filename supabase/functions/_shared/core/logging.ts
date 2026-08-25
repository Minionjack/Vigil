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

export interface ExerciseLog {
  exercise: string;
  weight_kg: number;
  reps: number;
  sets: number;
  rpe?: number;
}

export interface PendingLogProposal {
  type: string;
  exercises: ExerciseLog[];
}

/**
 * Same threshold `applyConfidenceGate` (chat/index.ts) already gates the
 * initial extraction on — shared here so `applyCorrectionPatch` below
 * gates against the identical number rather than a second, driftable copy.
 */
export const CONFIDENCE_THRESHOLD = 0.7;

/**
 * What a correction message actually changes — every field optional and
 * absent by default. The model's only job is identifying which fields the
 * athlete's correction addresses; it never restates the full proposal.
 * `confidence` only carries entries for fields actually present above.
 */
export interface CorrectionPatch {
  type?: string;
  type_confidence?: number;
  exercise?: string;
  weight_kg?: number;
  reps?: number;
  sets?: number;
  rpe?: number;
  confidence?: Partial<Record<"exercise" | "weight_kg" | "reps", number>>;
}

/**
 * Merges a correction patch into an existing pendingLog — in code, field
 * by field. Fixes the bug found in the Phase 3 audit: the old flow asked
 * the model to reconstruct the whole proposal from a "keep everything else"
 * instruction, and it silently dropped fields nobody re-stated (RPE
 * vanished on a weight-only correction, reproduced 4/4). Merging a partial
 * object into an existing one has exactly one correct answer — the same
 * reason string equality moved into code earlier tonight — so code owns
 * it: any field absent from `patch` is left untouched, never guessed at
 * or "remembered" by a model.
 */
export function applyCorrectionPatch(
  pendingLog: PendingLogProposal,
  patch: CorrectionPatch
): { updated: PendingLogProposal | null; unclearFields: string[] } {
  const unclear: string[] = [];

  let type = pendingLog.type;
  if (patch.type !== undefined) {
    if ((patch.type_confidence ?? 0) < CONFIDENCE_THRESHOLD) {
      unclear.push("which session this was (Push/Pull/Legs)");
    } else {
      type = patch.type;
    }
  }

  const touchesExercise =
    patch.exercise !== undefined ||
    patch.weight_kg !== undefined ||
    patch.reps !== undefined ||
    patch.sets !== undefined ||
    patch.rpe !== undefined;

  let exercises = pendingLog.exercises;
  if (touchesExercise) {
    let targetIndex = -1;
    if (pendingLog.exercises.length === 1) {
      targetIndex = 0;
    } else if (patch.exercise) {
      targetIndex = pendingLog.exercises.findIndex((e) => e.exercise.toLowerCase() === patch.exercise!.toLowerCase());
    }

    if (targetIndex === -1) {
      unclear.push("which exercise this correction is about");
    } else {
      const target = { ...pendingLog.exercises[targetIndex] };
      const confidence = patch.confidence ?? {};

      if (patch.exercise !== undefined && pendingLog.exercises.length === 1) {
        if ((confidence.exercise ?? 1) < CONFIDENCE_THRESHOLD) unclear.push("the exercise name");
        else target.exercise = patch.exercise;
      }
      if (patch.weight_kg !== undefined) {
        if ((confidence.weight_kg ?? 1) < CONFIDENCE_THRESHOLD) unclear.push("the corrected weight");
        else target.weight_kg = patch.weight_kg;
      }
      if (patch.reps !== undefined) {
        if ((confidence.reps ?? 1) < CONFIDENCE_THRESHOLD) unclear.push("the corrected reps");
        else target.reps = patch.reps;
      }
      // sets/rpe aren't confidence-gated on the initial extraction either
      // (applyConfidenceGate, chat/index.ts) — same asymmetry here.
      if (patch.sets !== undefined) target.sets = patch.sets;
      if (patch.rpe !== undefined) target.rpe = patch.rpe;

      exercises = pendingLog.exercises.map((e, i) => (i === targetIndex ? target : e));
    }
  }

  if (unclear.length > 0) {
    return { updated: null, unclearFields: unclear };
  }
  return { updated: { type, exercises }, unclearFields: [] };
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
