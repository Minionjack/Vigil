# Supabase setup — Phase 2

Everything Phase 2 needs is already written (`supabase/migrations/0001_init.sql`,
`supabase/functions/chat/`, `supabase/functions/nightly-digest/`,
`scripts/migrate-to-supabase.ts`) but **none of it has run against a real
project** — there wasn't one when it was written. This is the exact sequence
to make it real. Nothing here has been executed; follow it once, in order,
and hand results back for the next steps that need them.

## 1. Create the project
- [supabase.com](https://supabase.com) → New Project. Region: whichever is
  closest to you (affects latency, not correctness).
- Note the **Project URL** and, from Project Settings → API: the **anon
  public key** and the **service_role key** (service_role bypasses RLS —
  treat it like a root password, never ship it in the app bundle).

## 2. Auth
- Authentication → Providers → enable **Email**. Leave Apple off for now
  (deferred — needs the paid Apple Developer account, per `ROADMAP.md`'s
  own week-6 timeline, not part of this phase).
- Authentication → Settings → decide on email confirmation (off is fine
  for a single-user dev setup; on before any real beta user per Phase 5).

## 3. Apply the schema
Install the Supabase CLI if you don't have it (`brew install supabase/tap/supabase`),
then from the repo root:
```
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```
This applies `supabase/migrations/0001_init.sql` — `profiles`, `events`,
`memory_digests`, RLS policies. Verify in the dashboard's Table Editor
that all three tables exist and RLS shows as enabled (green) on each.

## 4. Create your user + profile row
- Sign up once through Supabase Auth (either the dashboard's "Add user" or
  by hitting your own future sign-up flow) to get a real `auth.users` row
  and its `id`.
- Insert your `profiles` row (SQL editor, replace the placeholders):
  ```sql
  insert into public.profiles (user_id, name, goal, training_days, usual_session_time, timezone, personality)
  values ('<your-auth-user-id>', 'Jack', 'Lose 8 kg by 30 September 2026 and bench 100 kg',
          '{Monday,Wednesday,Friday}', '18:30', 'Asia/Dubai', 'drill-sergeant');
  ```

## 5. Secrets for the edge functions
```
supabase secrets set ANTHROPIC_API_KEY=<the same key already in server/.env>
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically
into edge functions by the platform — you don't set those yourself.

## 6. Deploy the edge functions
```
supabase functions deploy chat
supabase functions deploy nightly-digest
```
**Likely friction point, flagged in advance:** both functions import from
`../../../packages/core/src/index.ts` — a relative path reaching outside
`supabase/functions/`. Supabase's bundler traces imports from each
function's own directory; if this specific cross-directory relative
import doesn't bundle cleanly, the fallback is an import map
(`supabase/functions/import_map.json` pointing an alias at
`../../packages/core/src/index.ts`) or vendoring `packages/core`'s source
directly into `supabase/functions/_shared/`. Whichever it needs will only
be visible once a real `deploy` is attempted — I don't have Deno in this
environment to test it first.

## 7. Schedule nightly-digest
Supabase supports two ways; pick one:
- **Scheduled Edge Functions** (dashboard, Edge Functions → nightly-digest
  → Schedule) — simplest, no SQL.
- **pg_cron**, if you'd rather keep it in the database (this is also how
  Phase 4's proactive checks will eventually run, so setting it up now
  isn't wasted):
  ```sql
  select cron.schedule(
    'nightly-digest',
    '0 3 * * *', -- 03:00 UTC daily; adjust for your timezone
    $$ select net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/nightly-digest',
      headers := jsonb_build_object('Authorization', 'Bearer <service_role_key>')
    ) $$
  );
  ```

## 8. Run the migration script
Imports `journal.jsonl` + `state.json` sessions as the first `events` rows
(timestamps preserved) — the experiment's data becomes the seed corpus,
not something left behind.
```
cd scripts
SUPABASE_URL=<project-url> \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
MIGRATION_USER_ID=<your-auth-user-id> \
npm run migrate-to-supabase
```
It prints how many events it prepared and inserted. Spot-check the
`events` table afterward — row count should roughly match
`journal.jsonl`'s line count plus `state.json`'s session count.

## 9. Point the app at it
- `the-vigil/config.ts`: replace the hardcoded LAN IP with the Supabase
  project URL and the edge function path (e.g.
  `https://<project-ref>.supabase.co/functions/v1`).
- The app will need an actual sign-in screen to obtain a session token for
  the `Authorization` header `supabase/functions/chat` expects — not built
  yet; flag this back and it's a small, contained addition once you're at
  this step, not a re-architecture.

## 10. Verify against BRIEF-PHASE2.md's four acceptance tests
Once 1-9 are done, the four tests in `BRIEF-PHASE2.md` become runnable for
the first time — that's the real finish line for this phase, not this
setup doc.
