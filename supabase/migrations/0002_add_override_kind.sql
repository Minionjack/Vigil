-- Adds `override` to events.kind: an athlete-initiated correction to a
-- computed progression suggestion (BRIEF-PHASE3.md — "that's an event,
-- not drift"). Written through the same confirm-before-write chat flow
-- as a session log, just with kind='override' and a different payload
-- shape (see packages/core/src/progression.ts's ProgressionEvent/
-- exerciseHistory for the exact shape it expects:
-- { exercise, sessionType, programSuggestedWeight_kg, athleteChosenWeight_kg, reason? }).
--
-- Constraint name verified live against the deployed project before
-- writing this (`select conname from pg_constraint where conrelid =
-- 'public.events'::regclass and contype = 'c'`) — confirmed as
-- `events_kind_check`, Postgres's default <table>_<column>_check naming
-- for the unnamed inline CHECK in 0001_init.sql. This is also the first
-- migration since 0001, so it's the first precedent for an ALTER on this
-- table — matching Postgres's own naming rather than inventing a
-- different one.

alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check (kind in (
  'session_completed',
  'session_skipped',
  'weight_logged',
  'nudge_fired',
  'nudge_outcome',
  'note',
  'program_changed',
  'correction',
  'override'
));
