-- Migration: persist playback + voting state in a tiny app_state table so a
-- voter or hall refresh always lands on the current reel, even if the admin
-- tab has been reloaded between broadcasts.
--
-- Run after the Google-auth migration. Idempotent.

create table if not exists public.app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS: anyone with the anon key can read and write. Same trust model as the
-- existing realtime broadcast channels (admin is gated by the frontend
-- password, not by Postgres). Tighten later if you add proper admin auth.
alter table public.app_state enable row level security;

drop policy if exists "Read app state" on public.app_state;
create policy "Read app state"
  on public.app_state
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Write app state" on public.app_state;
create policy "Write app state"
  on public.app_state
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Make sure realtime emits change events for this table.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_state'
  ) then
    alter publication supabase_realtime add table public.app_state;
  end if;
end $$;

notify pgrst, 'reload schema';
