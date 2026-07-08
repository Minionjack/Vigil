export type RuleId = "R1" | "R2" | "R3" | "R4";

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
}

export interface FiredLogEntry {
  date: string; // tz-local YYYY-MM-DD the message fired on
  rule: RuleId;
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

export interface Acknowledgment {
  date: string;
  type: string;
}

export interface RuleFired {
  rule: RuleId;
  reason: string;
  patternType?: string;
}
