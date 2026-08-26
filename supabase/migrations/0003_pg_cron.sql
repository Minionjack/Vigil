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
--
-- The pre-existing 'nightly-digest' job's command was found to carry the
-- real service_role key in plaintext (visible to anyone who can query
-- cron.job) — a leftover from when nightly-digest still verified JWTs.
-- Investigated before assuming it was benign: single Supabase org
-- member, no other account with access, the exposed key matched the
-- project's own already-legitimate service_role key rather than
-- something foreign — no sign of external access, most likely dashboard
-- drift from early project setup. Fixed live (not via a migration, since
-- the job predates any migration) by re-scheduling 'nightly-digest' with
-- the same no-header pattern as proactive-check, now that
-- --no-verify-jwt makes the header unnecessary entirely — no secret
-- anywhere in cron.job at all, simpler than routing it through Vault.

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
