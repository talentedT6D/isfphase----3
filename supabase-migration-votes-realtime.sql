-- Migration: enable Supabase Realtime for the votes table so the
-- /leaderboard page and the admin voter list update live as new votes
-- arrive. Without this the initial load works but later inserts/updates
-- don't broadcast and the page sits on stale numbers.
--
-- Run this in the Supabase SQL Editor. Idempotent — safe to run more
-- than once.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'votes'
  ) then
    alter publication supabase_realtime add table public.votes;
  end if;
end $$;

-- Schema cache reload so PostgREST picks up the new publication entry.
notify pgrst, 'reload schema';
