-- Migration: switch the voter app from self-generated UUIDs to Supabase
-- Google OAuth.
--
-- Run this in the Supabase SQL Editor AFTER you've enabled the Google
-- provider (Authentication -> Providers -> Google) and added your /voter URL
-- to Authentication -> URL Configuration -> Redirect URLs.
--
-- This script is idempotent — safe to run more than once.

-- 0. Inspect the current schema (informational; output appears in the editor).
--    user_id is expected to be either `text` or `uuid`. The policy below
--    casts both sides to text so it works regardless.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'votes';

-- 1. INSERT policy ---------------------------------------------------------
-- Old behaviour: anyone (anon role) could insert any row. That made sense
-- when each browser minted its own random UUID. With Google sign-in, only
-- authenticated users may insert, and only under their own auth.uid().

drop policy if exists "Anyone can cast a vote" on public.votes;
drop policy if exists "Voters insert own vote" on public.votes;

create policy "Voters insert own vote"
  on public.votes
  for insert
  to authenticated
  with check (user_id::text = auth.uid()::text);

-- 2. SELECT policy ---------------------------------------------------------
-- Stays open: the admin dashboard (which uses the anon key behind a
-- frontend-only password gate) needs to read votes for live stats, and
-- voters need to see their own previous votes.

drop policy if exists "Anyone can read votes" on public.votes;

create policy "Anyone can read votes"
  on public.votes
  for select
  to anon, authenticated
  using (true);

-- 3. One-vote-per-(voter, reel) constraint --------------------------------
-- The frontend relies on Postgres returning error code 23505 for duplicate
-- submissions. Add the constraint if it isn't already there.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'votes_user_id_reel_id_key'
       or conname = 'votes_user_reel_unique'
  ) then
    alter table public.votes
      add constraint votes_user_reel_unique unique (user_id, reel_id);
  end if;
end $$;

-- 4. Schema cache ----------------------------------------------------------
notify pgrst, 'reload schema';
