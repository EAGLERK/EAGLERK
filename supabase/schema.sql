-- MyMoney: one row of app data per signed-in user.
-- Run this once in the Supabase SQL editor (or via `supabase db push`).
-- Row-level security makes the database itself refuse any read or write of another user's row,
-- so a bug in the app cannot leak data between accounts.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  -- Bumped by a trigger on every update; the app uses it to detect edits made on another device.
  version    bigint      not null default 1,
  updated_at timestamptz not null default now(),
  constraint user_data_is_object check (jsonb_typeof(data) = 'object'),
  constraint user_data_size check (pg_column_size(data) < 5000000)
);

alter table public.user_data enable row level security;

-- Nothing is readable by default; only a signed-in user may touch their own row.
revoke all on public.user_data from anon, authenticated;
grant select, insert, update, delete on public.user_data to authenticated;

drop policy if exists "user_data select own" on public.user_data;
drop policy if exists "user_data insert own" on public.user_data;
drop policy if exists "user_data update own" on public.user_data;
drop policy if exists "user_data delete own" on public.user_data;

create policy "user_data select own" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_data insert own" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_data update own" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_data delete own" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Keeps version and updated_at honest and stops a client from re-pointing the row at another user.
create or replace function public.user_data_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id    := old.user_id;
  new.version    := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before update on public.user_data
  for each row execute function public.user_data_touch();

-- Lets a user erase their own account and everything under it (the row above cascades).
-- Supabase's client library cannot delete an auth user, so this runs with elevated rights
-- but only ever for the caller's own id.
create or replace function public.delete_my_account() returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
