-- db/configurations.sql
create extension if not exists pgcrypto;

create table if not exists public.configurations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  data jsonb not null,
  modified_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists configurations_user_name_uidx
  on public.configurations (user_id, name);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists configurations_set_updated_at on public.configurations;
create trigger configurations_set_updated_at
before update on public.configurations
for each row execute procedure public.set_updated_at();

alter table public.configurations enable row level security;

drop policy if exists configurations_select_own on public.configurations;
create policy configurations_select_own
on public.configurations for select
using (auth.uid() = user_id);

drop policy if exists configurations_insert_own on public.configurations;
create policy configurations_insert_own
on public.configurations for insert
with check (auth.uid() = user_id);

drop policy if exists configurations_update_own on public.configurations;
create policy configurations_update_own
on public.configurations for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists configurations_delete_own on public.configurations;
create policy configurations_delete_own
on public.configurations for delete
using (auth.uid() = user_id);
