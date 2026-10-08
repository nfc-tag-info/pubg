-- Run once in the intended Supabase project. Contains no credentials.
begin;

create or replace function public.valid_squad_data(value jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  p jsonb; m jsonb; idx integer := 0; start_at timestamptz; end_at timestamptz;
  previous_end timestamptz := '-infinity'; names text[] := '{}'; ids text[] := '{}';
begin
  if jsonb_typeof(value->'players') is distinct from 'array'
     or jsonb_array_length(value->'players') <> 4
     or jsonb_typeof(value->'meetings') is distinct from 'array'
     or jsonb_array_length(value->'meetings') not between 1 and 24 then return false; end if;
  for p in select * from jsonb_array_elements(value->'players') loop
    idx := idx + 1;
    if p->>'id' is distinct from 'p' || idx::text
      or jsonb_typeof(p->'nick') is distinct from 'string'
      or length(btrim(p->>'nick')) not between 1 and 18
      or lower(btrim(p->>'nick')) = any(names) then return false; end if;
    names := array_append(names, lower(btrim(p->>'nick')));
  end loop;
  for m in select item from jsonb_array_elements(value->'meetings') as meetings(item) order by (item->>'start')::timestamptz loop
    if jsonb_typeof(m->'id') is distinct from 'string' or length(m->>'id') not between 1 and 64
      or m->>'id' = any(ids)
      or jsonb_typeof(m->'start') is distinct from 'string'
      or jsonb_typeof(m->'end') is distinct from 'string'
      or (m->>'start') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
      or (m->>'end') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
      or jsonb_typeof(m->'place') is distinct from 'string' or length(btrim(m->>'place')) not between 1 and 60
      or jsonb_typeof(m->'note') is distinct from 'string' or length(m->>'note') > 180 then return false; end if;
    ids := array_append(ids, m->>'id');
    start_at := (m->>'start')::timestamptz; end_at := (m->>'end')::timestamptz;
    if end_at <= start_at or start_at < previous_end then return false; end if;
    previous_end := end_at;
    for idx in 1..4 loop
      if coalesce(m->'attendance'->>('p' || idx::text), '') not in ('ready','waiting','absent') then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;

revoke all on function public.valid_squad_data(jsonb) from public, anon, authenticated;
grant execute on function public.valid_squad_data(jsonb) to authenticated;

create table if not exists public.squad_state (
  id text primary key check (id = 'squad'),
  data jsonb not null check (public.valid_squad_data(data)),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.squad_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.squad_state enable row level security;
alter table public.squad_admins enable row level security;
revoke all on public.squad_state from anon, authenticated;
revoke all on public.squad_admins from anon, authenticated;
grant select on public.squad_state to anon, authenticated;
grant update (data) on public.squad_state to authenticated;
grant select on public.squad_admins to authenticated;

drop policy if exists "Read squad" on public.squad_state;
create policy "Read squad" on public.squad_state for select to anon, authenticated using (true);
drop policy if exists "Admins edit squad" on public.squad_state;
create policy "Admins edit squad" on public.squad_state for update to authenticated
  using (exists (select 1 from public.squad_admins where user_id = (select auth.uid())))
  with check (exists (select 1 from public.squad_admins where user_id = (select auth.uid())));
drop policy if exists "Read own admin role" on public.squad_admins;
create policy "Read own admin role" on public.squad_admins for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.bump_squad_version()
returns trigger language plpgsql set search_path = '' as $$
begin new.version := old.version + 1; new.updated_at := now(); return new; end;
$$;
drop trigger if exists squad_version on public.squad_state;
create trigger squad_version before update on public.squad_state for each row execute function public.bump_squad_version();

create or replace function public.save_squad(expected_version bigint, next_data jsonb)
returns setof public.squad_state language plpgsql security invoker set search_path = '' as $$
begin
  return query update public.squad_state set data = next_data
    where id = 'squad' and version = expected_version returning *;
  if not found then raise exception 'State changed or write not permitted' using errcode = '40001'; end if;
end;
$$;
revoke all on function public.save_squad(bigint, jsonb) from public, anon;
grant execute on function public.save_squad(bigint, jsonb) to authenticated;

create or replace function public.squad_clock()
returns timestamptz language sql volatile set search_path = '' as $$ select clock_timestamp(); $$;
revoke all on function public.squad_clock() from public;
grant execute on function public.squad_clock() to anon, authenticated;

-- Realtime is optional: the client also refreshes every 15 seconds while visible.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'squad_state') then
    alter publication supabase_realtime add table public.squad_state;
  end if;
end $$;

-- The Dashboard's optional automatic-RLS event trigger is not a public RPC.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
commit;
