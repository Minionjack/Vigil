import { daysBetween } from "./dateTz.js";

export interface ProgramExercise {
  exercise: string; // matched case-insensitively against logged exercise names
  sessionType: string; // "Push" | "Pull" | "Legs" — matches events' payload.type
  targetReps: number;
  targetSets: number;
  category: "upper" | "lower"; // drives +2.5kg vs +5kg on a hit
  seedWeight_kg: number; // used only when no history exists yet for this exercise
}

export interface Program {
  name: string;
  exercises: ProgramExercise[];
}

export interface ProgressionEvent {
  occurred_at: string;
  kind: "session_completed" | "session_skipped" | "override";
  payload: Record<string, unknown>;
}

export type SuggestionAction = "seed" | "progress" | "repeat" | "deload" | "restart";

export interface ExerciseSuggestion {
  exercise: string;
  sessionType: string;
  action: SuggestionAction;
  suggestedWeight_kg: number;
  lastWeight_kg: number | null;
  lastReps: number | null;
  lastRpe: number | null;
  lastDate: string | null;
  reason: string;
  flagForCoach: boolean;
}

interface LoggedSet {
  date: string;
  weight_kg: number;
  reps: number;
  rpe?: number;
}

function round2_5(weight: number): number {
  return Math.round(weight / 2.5) * 2.5;
}

// Every entry an exercise's history can produce, in chronological order —
// either a real logged set, or an override that resets the baseline. Kept
// as a discriminated union rather than two parallel arrays so folding
// through history in date order is a single, simple pass.
type HistoryEntry = { type: "set"; date: string; weight_kg: number; reps: number; rpe?: number } | { type: "override"; date: string; weight_kg: number };

function exerciseHistory(events: ProgressionEvent[], exercise: string): HistoryEntry[] {
  const needle = exercise.trim().toLowerCase();
  const entries: HistoryEntry[] = [];

  for (const e of events) {
    if (e.kind === "session_completed") {
      // Old-shape rows (migrated pre-Phase-3 data, or any future CLI-only
      // write) have no `exercises` array at all — skip them rather than
      // crash. This is the one compatibility rule every new reader of
      // `events` must honor now that the payload shape has two eras.
      const exercises = e.payload.exercises;
      if (!Array.isArray(exercises)) continue;
      for (const ex of exercises) {
        if (typeof ex?.exercise === "string" && ex.exercise.trim().toLowerCase() === needle) {
          entries.push({ type: "set", date: e.occurred_at.slice(0, 10), weight_kg: Number(ex.weight_kg), reps: Number(ex.reps), rpe: ex.rpe === undefined ? undefined : Number(ex.rpe) });
        }
      }
    } else if (e.kind === "override") {
      if (typeof e.payload.exercise === "string" && e.payload.exercise.trim().toLowerCase() === needle) {
        entries.push({ type: "override", date: e.occurred_at.slice(0, 10), weight_kg: Number(e.payload.athleteChosenWeight_kg) });
      }
    }
  }

  return entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function mostRecentTypeActivityDate(events: ProgressionEvent[], sessionType: string): string | null {
  let latest: string | null = null;
  for (const e of events) {
    // An override is a real athlete interaction with this session type too
    // (choosing a weight to resume at) — it counts as activity the same
    // way a completed or skipped session does, or a resumed-but-untested
    // override would look falsely dormant right after being logged.
    const matchesType =
      (e.kind === "session_completed" || e.kind === "session_skipped") && e.payload.type === sessionType
        ? true
        : e.kind === "override" && e.payload.sessionType === sessionType;
    if (matchesType) {
      const date = e.occurred_at.slice(0, 10);
      if (latest === null || date > latest) latest = date;
    }
  }
  return latest;
}

function mostRecentCompletedWeight(history: HistoryEntry[]): LoggedSet | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.type === "set") return { date: entry.date, weight_kg: entry.weight_kg, reps: entry.reps, rpe: entry.rpe };
    // an override with nothing logged after it is the most recent known weight too
    return { date: entry.date, weight_kg: entry.weight_kg, reps: 0, rpe: undefined };
  }
  return null;
}

/**
 * The progressive-overload engine, per BRIEF-PHASE3.md's v1 rules — pure
 * and deterministic, exactly as sacred as the rest of this package: the
 * coach may explain or disagree with a suggestion in voice, but the
 * number itself always comes from here.
 *
 * Precedence, per exercise:
 *   1. This exercise's session type hasn't seen any activity (completed
 *      OR skipped) in >=14 days, or ever -> restart at the last completed
 *      load (or the program's seed weight if there's no history at all).
 *      "No phantom progression" across a real gap in training.
 *   2. No logged history for this specific exercise -> seed.
 *   3. Otherwise, fold chronologically through this exercise's own
 *      history. A hit (reps >= target AND a logged RPE <= 8) progresses
 *      the weight and resets the miss-streak. A miss holds the weight,
 *      unless it's the second miss in a row, which deloads by 10%
 *      (rounded to the nearest 2.5kg) and flags the coach. A missing RPE
 *      can't confirm "<=8", so it's treated as a miss — an explicit
 *      choice, not a silent guess (see progression.test.ts).
 *   An `override` event resets the baseline to the athlete's chosen
 *   weight and clears the miss-streak — a human decision, not a data
 *   point to judge.
 */
export function suggestNextSession(program: Program, events: ProgressionEvent[], today: string): ExerciseSuggestion[] {
  return program.exercises.map((ex) => {
    const history = exerciseHistory(events, ex.exercise);
    const typeActivity = mostRecentTypeActivityDate(events, ex.sessionType);
    const dormant = typeActivity === null || daysBetween(typeActivity, today) >= 14;

    if (dormant) {
      const last = mostRecentCompletedWeight(history);
      return {
        exercise: ex.exercise,
        sessionType: ex.sessionType,
        action: "restart",
        suggestedWeight_kg: last?.weight_kg ?? ex.seedWeight_kg,
        lastWeight_kg: last?.weight_kg ?? null,
        lastReps: last?.reps ?? null,
        lastRpe: last?.rpe ?? null,
        lastDate: last?.date ?? null,
        reason:
          typeActivity === null
            ? `No ${ex.sessionType} session logged yet — restarting at ${last ? "the last known load" : "the program's starting load"}.`
            : `${ex.sessionType} hasn't been trained in ${daysBetween(typeActivity, today)} days — restarting at the last known load rather than assuming continued progress.`,
        flagForCoach: false,
      };
    }

    if (history.length === 0) {
      return {
        exercise: ex.exercise,
        sessionType: ex.sessionType,
        action: "seed",
        suggestedWeight_kg: ex.seedWeight_kg,
        lastWeight_kg: null,
        lastReps: null,
        lastRpe: null,
        lastDate: null,
        reason: `No history logged for ${ex.exercise} yet — starting at the program's seed weight.`,
        flagForCoach: false,
      };
    }

    let consecutiveMisses = 0;
    let lastSet: LoggedSet | null = null;
    let lastWasOverride = false;
    let overrideWeight = 0;

    for (const entry of history) {
      if (entry.type === "override") {
        consecutiveMisses = 0;
        lastSet = null;
        lastWasOverride = true;
        overrideWeight = entry.weight_kg;
        continue;
      }
      lastWasOverride = false;
      const hit = entry.reps >= ex.targetReps && entry.rpe !== undefined && entry.rpe <= 8;
      consecutiveMisses = hit ? 0 : consecutiveMisses + 1;
      lastSet = { date: entry.date, weight_kg: entry.weight_kg, reps: entry.reps, rpe: entry.rpe };
    }

    if (lastWasOverride) {
      return {
        exercise: ex.exercise,
        sessionType: ex.sessionType,
        action: "repeat",
        suggestedWeight_kg: overrideWeight,
        lastWeight_kg: overrideWeight,
        lastReps: null,
        lastRpe: null,
        lastDate: null,
        reason: `Resuming at your overridden weight for ${ex.exercise} — no result logged at it yet.`,
        flagForCoach: false,
      };
    }

    // lastSet is guaranteed non-null here: history.length > 0 and every
    // branch above either sets lastSet or returns early on an override.
    const last = lastSet!;
    const hit = last.reps >= ex.targetReps && last.rpe !== undefined && last.rpe <= 8;

    if (hit) {
      const increment = ex.category === "upper" ? 2.5 : 5;
      return {
        exercise: ex.exercise,
        sessionType: ex.sessionType,
        action: "progress",
        suggestedWeight_kg: last.weight_kg + increment,
        lastWeight_kg: last.weight_kg,
        lastReps: last.reps,
        lastRpe: last.rpe ?? null,
        lastDate: last.date,
        reason: `${ex.exercise}: hit ${last.reps} reps at RPE ${last.rpe} on ${last.date} — progressing.`,
        flagForCoach: false,
      };
    }

    if (consecutiveMisses >= 2) {
      return {
        exercise: ex.exercise,
        sessionType: ex.sessionType,
        action: "deload",
        suggestedWeight_kg: round2_5(last.weight_kg * 0.9),
        lastWeight_kg: last.weight_kg,
        lastReps: last.reps,
        lastRpe: last.rpe ?? null,
        lastDate: last.date,
        reason: `${ex.exercise}: missed target twice in a row (last on ${last.date}) — deloading 10%.`,
        flagForCoach: true,
      };
    }

    return {
      exercise: ex.exercise,
      sessionType: ex.sessionType,
      action: "repeat",
      suggestedWeight_kg: last.weight_kg,
      lastWeight_kg: last.weight_kg,
      lastReps: last.reps,
      lastRpe: last.rpe ?? null,
      lastDate: last.date,
      reason: last.rpe === undefined
        ? `${ex.exercise}: no RPE logged on ${last.date}, can't confirm it was an easy hit — repeating.`
        : `${ex.exercise}: missed target on ${last.date} (RPE ${last.rpe}) — repeating.`,
      flagForCoach: false,
    };
  });
}

export function renderSuggestedNextSession(suggestions: ExerciseSuggestion[]): string {
  return suggestions
    .map((s) => {
      const last = s.lastWeight_kg === null ? "no prior data" : `last: ${s.lastWeight_kg}kg${s.lastReps ? ` x${s.lastReps}` : ""}${s.lastRpe ? ` @ RPE${s.lastRpe}` : ""} on ${s.lastDate}`;
      return `- ${s.exercise}: suggested next ${s.suggestedWeight_kg}kg (${last} — ${s.reason})`;
    })
    .join("\n");
}
