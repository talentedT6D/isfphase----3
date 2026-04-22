-- Migration for the ISF voting app.
--
-- 1. Add a `user_name` column so the admin voter list can show each voter's
--    display name instead of only their anonymous user_id.
-- 2. Add an INSERT Row-Level Security policy that allows the anon role to
--    cast votes, including the new column.
-- 3. Ask PostgREST to reload its schema cache so the Supabase JS client
--    picks up the new column without a project restart.
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to run multiple times.

-- 1. Column ---------------------------------------------------------------
alter table public.votes
  add column if not exists user_name text;

-- 2. RLS --------------------------------------------------------------------
-- Make sure RLS is on (it should already be).
alter table public.votes enable row level security;

-- Drop the old policy if it exists under the same name, then recreate it so
-- the WITH CHECK expression is current.
drop policy if exists "Anyone can cast a vote" on public.votes;

create policy "Anyone can cast a vote"
  on public.votes
  for insert
  to anon, authenticated
  with check (true);

-- Allow reads for the admin dashboard and voter "already voted" lookup.
drop policy if exists "Anyone can read votes" on public.votes;

create policy "Anyone can read votes"
  on public.votes
  for select
  to anon, authenticated
  using (true);

-- 3. Schema cache ---------------------------------------------------------
notify pgrst, 'reload schema';
