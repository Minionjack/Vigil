-- Phase 4, item 1: pg_cron trigger for proactive-check.
--
-- Originally this migration also scheduled nightly-digest — turned out
-- unnecessary: querying cron.job live (not just grepping the repo, which
-- is what an earlier check that night mistakenly relied on) found a
-- pre-existing job named 'nightly-digest' already running successfully
-- once daily at 03:00 UTC, almost certainly set up directly through the
-- Supabase dashboard's Cron integration at some point rather than
-- through any committed migration — which is exactly why grepping the
-- repo for pg_cron/cron.schedule never found it. Scheduling a second,
-- redundant 'nightly-digest-daily' job here would have produced two
-- memory_digests rows a day; it was created live, found to conflict, and
-- unscheduled again in the same session rather than left in place. This
-- migration only adds what was genuinely missing: proactive-check.
--
-- proactive-check deploys with --no-verify-jwt (a cron-triggered request
-- has no user session to verify) and authenticates its own Postgres
-- access internally via SUPABASE_SERVICE_ROLE_KEY, already set as a
-- project secret. No secret value is embedded here — the call below
-- carries no Authorization header at all, matching --no-verify-jwt.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Every 15 minutes, coarse-gated to 06:00-21:59 the same way the local
-- crontab already was — the rules engine's own quiet-hours check
-- (06:30/21:30) is what actually enforces the precise boundary, this
-- just avoids needless invocations overnight.
select cron.schedule(
  'proactive-check-15min',
  '*/15 6-21 * * *',
  $$
  select net.http_post(
    url := 'https://phuzlutydizylgfsocbx.supabase.co/functions/v1/proactive-check',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);
