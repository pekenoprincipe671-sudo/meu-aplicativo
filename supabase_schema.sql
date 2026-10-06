-- R_Sejamosluz — Supabase schema
-- Execute este arquivo no SQL Editor do seu projeto Supabase.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  goal text not null default '',
  selected text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_day integer not null default 0 check (completed_day between 0 and 7),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mood text not null default '🙂',
  note text not null,
  entry_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.journal_entries enable row level security;

-- Recria as políticas de forma idempotente.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "progress_select_own" on public.progress;
drop policy if exists "progress_insert_own" on public.progress;
drop policy if exists "progress_update_own" on public.progress;
drop policy if exists "journal_select_own" on public.journal_entries;
drop policy if exists "journal_insert_own" on public.journal_entries;
drop policy if exists "journal_delete_own" on public.journal_entries;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "progress_select_own" on public.progress for select using (user_id = auth.uid());
create policy "progress_insert_own" on public.progress for insert with check (user_id = auth.uid());
create policy "progress_update_own" on public.progress for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "journal_select_own" on public.journal_entries for select using (user_id = auth.uid());
create policy "journal_insert_own" on public.journal_entries for insert with check (user_id = auth.uid());
create policy "journal_delete_own" on public.journal_entries for delete using (user_id = auth.uid());

create index if not exists journal_entries_user_created_idx
  on public.journal_entries(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists progress_set_updated_at on public.progress;
create trigger progress_set_updated_at
before update on public.progress
for each row execute function public.set_updated_at();
