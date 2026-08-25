import type { PersonalityId, ExerciseSuggestion, RuleId } from "@vigil/core";

export interface Session {
  date: string; // YYYY-MM-DD
  type: string;
  status: "completed" | "skipped";
  note?: string;
  excuse?: string;
}

export interface State {
  client: {
    name: string;
    goal: string;
    training_days: string[];
    usual_session_time: string; // "HH:MM"
    timezone: string;
    personality?: PersonalityId; // defaults to drill-sergeant if unset
  };
  current_program: {
    name: string;
    next_session: {
      type: string;
      planned: string[];
      fallback_30min?: string[];
    };
  };
  sessions: Session[];
  journal_config: {
    max_messages_per_day: number;
    quiet_hours: { before: string; after: string };
    delivery: { method: string; topic: string };
  };
  // Phase 3's progression engine's output — optional so every existing
  // fixture (fixtures/r1-4.json) and hand-built State literal in tests
  // stays valid without it. renderState() skips the suggested-next-
  // session line entirely when this is absent rather than guessing.
  suggestions?: ExerciseSuggestion[];
}

export interface FiredEntry {
  kind: "fired";
  timestamp: string; // ISO
  rule: RuleId;
  message_text: string;
  delivered: boolean;
}

export interface OutcomeEntry {
  kind: "outcome";
  timestamp: string; // ISO, when the outcome was logged
  rule: RuleId; // which nudge this resolves
  fired_at: string; // timestamp of the FiredEntry being resolved
  acted: boolean;
  note?: string;
}

export type JournalEntry = FiredEntry | OutcomeEntry;
