-- Add user_name column to the votes table so the admin voter list can show
-- each voter's display name instead of just their anonymous user_id.
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- Safe to run multiple times: IF NOT EXISTS makes it idempotent.

alter table public.votes
  add column if not exists user_name text;

-- Tell PostgREST to refresh its schema cache so the Supabase JS client
-- picks up the new column without a project restart.
notify pgrst, 'reload schema';
