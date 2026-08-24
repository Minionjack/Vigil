import { test, expect } from "vitest";
import { suggestNextSession, type Program, type ProgressionEvent } from "./progression.js";

const BENCH_PROGRAM: Program = {
  name: "Push/Pull/Legs",
  exercises: [{ exercise: "Bench press", sessionType: "Push", targetReps: 6, targetSets: 4, category: "upper", seedWeight_kg: 80 }],
};

function completed(date: string, type: string, exercises: { exercise: string; weight_kg: number; reps: number; sets?: number; rpe?: number }[]): ProgressionEvent {
  return { occurred_at: `${date}T12:00:00Z`, kind: "session_completed", payload: { type, exercises } };
}

// 2026-07-06 is a Monday (established across the fixtures/tests in this repo).

test("no logged history for the exercise, but the session type is active -> seed at the program's starting weight", () => {
  const events: ProgressionEvent[] = [completed("2026-07-18", "Push", [{ exercise: "Incline DB press", weight_kg: 30, reps: 10, rpe: 7 }])];
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, events, "2026-07-20");
  expect(suggestion.action).toBe("seed");
  expect(suggestion.suggestedWeight_kg).toBe(80);
  expect(suggestion.lastWeight_kg).toBeNull();
});

test("hit target at RPE <= 8 -> progresses by 2.5kg for an upper-body lift", () => {
  const events: ProgressionEvent[] = [completed("2026-07-13", "Push", [{ exercise: "Bench press", weight_kg: 80, reps: 6, rpe: 7 }])];
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, events, "2026-07-20");
  expect(suggestion.action).toBe("progress");
  expect(suggestion.suggestedWeight_kg).toBe(82.5);
  expect(suggestion.lastWeight_kg).toBe(80);
});

test("missed target (RPE 9) -> repeats the same weight, does not progress", () => {
  const events: ProgressionEvent[] = [completed("2026-07-13", "Push", [{ exercise: "Bench press", weight_kg: 80, reps: 6, rpe: 9 }])];
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, events, "2026-07-20");
  expect(suggestion.action).toBe("repeat");
  expect(suggestion.suggestedWeight_kg).toBe(80);
  expect(suggestion.flagForCoach).toBe(false);
});

test("missing RPE can't confirm an easy hit -> treated as a miss (repeat), not a silent guess", () => {
  const events: ProgressionEvent[] = [completed("2026-07-13", "Push", [{ exercise: "Bench press", weight_kg: 80, reps: 6 }])];
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, events, "2026-07-20");
  expect(suggestion.action).toBe("repeat");
  expect(suggestion.suggestedWeight_kg).toBe(80);
});

test("two consecutive misses -> deloads 10%, rounded to the nearest 2.5kg, and flags the coach", () => {
  const events: ProgressionEvent[] = [
    completed("2026-07-06", "Push", [{ exercise: "Bench press", weight_kg: 77.5, reps: 6, rpe: 9 }]),
    completed("2026-07-13", "Push", [{ exercise: "Bench press", weight_kg: 77.5, reps: 6, rpe: 9 }]),
  ];
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, events, "2026-07-20");
  expect(suggestion.action).toBe("deload");
  expect(suggestion.suggestedWeight_kg).toBe(70); // 77.5 * 0.9 = 69.75 -> rounds to 70
  expect(suggestion.flagForCoach).toBe(true);
});

test("a repeat later cleared by a hit progresses instead of deloading — the miss-streak resets on any hit", () => {
  const events: ProgressionEvent[] = [
    completed("2026-06-29", "Push", [{ exercise: "Bench press", weight_kg: 80, reps: 6, rpe: 9 }]), // miss 1
    completed("2026-07-03", "Push", [{ exercise: "Bench press", weight_kg: 80, reps: 6, rpe: 9 }]), // miss 2 — would deload if last
    completed("2026-07-06", "Push", [{ exercise: "Bench press", weight_kg: 80, reps: 6, rpe: 7 }]), // hit — clears the streak
  ];
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, events, "2026-07-13");
  expect(suggestion.action).toBe("progress");
  expect(suggestion.suggestedWeight_kg).toBe(82.5);
});

test("session type dormant >= 14 days -> restarts at the last completed load, no phantom progression", () => {
  const events: ProgressionEvent[] = [completed("2026-07-01", "Push", [{ exercise: "Bench press", weight_kg: 77.5, reps: 6, rpe: 7 }])];
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, events, "2026-08-01"); // 31 days later
  expect(suggestion.action).toBe("restart");
  expect(suggestion.suggestedWeight_kg).toBe(77.5);
});

test("session type never logged -> restarts at the program's seed weight", () => {
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, [], "2026-07-20");
  expect(suggestion.action).toBe("restart");
  expect(suggestion.suggestedWeight_kg).toBe(80);
});

test("an override resets the baseline to the athlete's chosen weight — a human decision, not a data point to judge", () => {
  const events: ProgressionEvent[] = [
    completed("2026-07-06", "Push", [{ exercise: "Bench press", weight_kg: 77.5, reps: 6, rpe: 9 }]),
    {
      occurred_at: "2026-07-13T12:00:00Z",
      kind: "override",
      payload: { exercise: "Bench press", sessionType: "Push", programSuggestedWeight_kg: 77.5, athleteChosenWeight_kg: 85 },
    },
  ];
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, events, "2026-07-20");
  expect(suggestion.action).toBe("repeat");
  expect(suggestion.suggestedWeight_kg).toBe(85);
  expect(suggestion.lastWeight_kg).toBe(85);
});

test("old-shape session_completed rows (no exercises array) are skipped rather than crashing", () => {
  const oldShapeRow: ProgressionEvent = { occurred_at: "2026-07-06T12:00:00Z", kind: "session_completed", payload: { type: "Push", note: "chest day, felt good" } };
  const events: ProgressionEvent[] = [oldShapeRow, completed("2026-07-13", "Push", [{ exercise: "Bench press", weight_kg: 80, reps: 6, rpe: 7 }])];
  expect(() => suggestNextSession(BENCH_PROGRAM, events, "2026-07-20")).not.toThrow();
  const [suggestion] = suggestNextSession(BENCH_PROGRAM, events, "2026-07-20");
  expect(suggestion.action).toBe("progress");
  expect(suggestion.suggestedWeight_kg).toBe(82.5);
});
