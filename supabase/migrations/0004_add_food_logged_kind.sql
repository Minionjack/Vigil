-- Adds `food_logged` to events.kind — Milestone 3.5, Part B. Payload:
-- { text: string, items?: string[] }. `text` is always the verbatim
-- message; no calorie/macro/protein field exists in this schema at all,
-- by construction (see DECISIONS.md and core-rules.md's Food section
-- for why). Same ALTER TABLE DROP/ADD CONSTRAINT pattern
-- 0002_add_override_kind.sql already established; constraint name
-- (events_kind_check) already confirmed live in that migration's own
-- comment, not re-verified here since it hasn't changed since.

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
  'override',
  'food_logged'
));
