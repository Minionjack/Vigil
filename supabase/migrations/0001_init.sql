-- Phase 2 initial schema: one event log, one source of truth for both
-- surfaces (chat and proactive). Written against BRIEF-PHASE2.md §1.
--
-- NOT applied to any live project — there isn't one yet. Run this with
-- `supabase db push` (or paste into the SQL editor) once the project
-- exists. See SUPABASE-SETUP.md for the full sequence.

-- Every table is keyed by user_id from day one — single user today, but
-- schema'd for multi-user per BRIEF-PHASE2.md so this isn't painful later.
-- Auth is email-only for now (Apple Sign-In deferred until the paid Apple
-- Developer account exists, per ROADMAP.md's own week-6 timeline) — that's
-- a Supabase Auth provider setting, not a schema decision, so nothing
-- below hardcodes an auth method.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  goal text not null,
  training_days text[] not null default '{}',
  usual_session_time time not null,
  timezone text not null,
  personality text not null default 'drill-sergeant'
    check (personality in ('drill-sergeant', 'mentor', 'hype')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'The only hand-editable table. Everything else — session history, next
   scheduled session, streaks, weight — is derived from events, never
   stored redundantly here. This is deliberate: next_session used to be a
   hand-maintained field on this kind of table and regressed twice.';

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ts timestamptz not null default now(),
  kind text not null check (kind in (
    'session_completed',
    'session_skipped',
    'weight_logged',
    'nudge_fired',
    'nudge_outcome',
    'note',
    'program_changed',
    'correction'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.events is
  'Append-only. Corrections are new events (kind=correction, payload
   references the id of the event they amend) — never an UPDATE to an
   existing row. "Current program" is the payload of the most recent
   program_changed event, not a separate mutable table, for the same
   reason next_session is computed rather than stored: one append-only
   log, nothing to drift out of sync with itself.';

create index if not exists events_user_id_ts_idx on public.events (user_id, ts desc);
create index if not exists events_user_id_kind_idx on public.events (user_id, kind);

create table if not exists public.memory_digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  digest text not null,
  model text not null,
  created_at timestamptz not null default now()
);

comment on table public.memory_digests is
  'Labeled impressions, never facts (BRIEF-PHASE2.md §4). Append-only like
   events — a bad digest is superseded by a new row for a corrected/re-run
   period, never edited in place.';

create index if not exists memory_digests_user_id_period_idx on public.memory_digests (user_id, period_start desc);

-- Row-level security, on from the start — "even solo" per BRIEF-PHASE2.md.

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.memory_digests enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);
-- No delete policy: account deletion is Phase 5's tombstone + hard-delete
-- job, not a bare DELETE available to the app role.

create policy "events_select_own" on public.events
  for select using (auth.uid() = user_id);
create policy "events_insert_own" on public.events
  for insert with check (auth.uid() = user_id);
-- Deliberately no update or delete policy on events: append-only per
-- BRIEF-PHASE2.md §1. A correction is a new row, not a mutation, and RLS
-- enforces that at the database level, not just by convention in the app.

create policy "memory_digests_select_own" on public.memory_digests
  for select using (auth.uid() = user_id);
create policy "memory_digests_insert_own" on public.memory_digests
  for insert with check (auth.uid() = user_id);
-- Same reasoning: append-only, no update/delete policy.
