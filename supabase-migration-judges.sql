-- Migration: allow the three festival judges to cast votes from the /judge
-- page.
--
-- The judges sign in with a frontend-only password (see src/lib/judges.ts),
-- not a Supabase auth session, so they reach the votes table as the `anon`
-- role. The Google-auth migration restricts inserts to authenticated users
-- voting under their own auth.uid(), which would block judges. This adds a
-- second, narrower INSERT policy that permits inserts only for the known
-- fixed judge user_ids.
--
-- Keep the ids below in sync with JUDGES in src/lib/judges.ts.
--
-- Run this in the Supabase SQL Editor. Idempotent — safe to run more than
-- once.

alter table public.votes enable row level security;

drop policy if exists "Judges cast votes" on public.votes;

create policy "Judges cast votes"
  on public.votes
  for insert
  to anon, authenticated
  with check (
    user_id::text in (
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333'
    )
  );

-- Schema cache reload so PostgREST picks up the new policy immediately.
notify pgrst, 'reload schema';
