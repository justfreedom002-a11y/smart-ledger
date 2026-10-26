-- Smart Ledger schema. Run this in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  role text not null default 'user' check (role in ('admin','user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  code text,
  amount numeric(12,2) check (amount is null or amount >= 0),
  discount numeric(12,2) check (discount is null or discount >= 0),
  record_date date not null default current_date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id),
  action text not null,
  record_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.records enable row level security;
alter table public.audit_logs enable row level security;

-- Helper checks are evaluated using the signed-in user's profile.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_active = true); $$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true); $$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant select on public.profiles to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "active users can read profiles" on public.profiles;
create policy "active users can read profiles" on public.profiles for select to authenticated using (public.is_active_user());
drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "active users read categories" on public.categories;
create policy "active users read categories" on public.categories for select to authenticated using (public.is_active_user());
drop policy if exists "admins insert categories" on public.categories;
create policy "admins insert categories" on public.categories for insert to authenticated with check (public.is_admin());
drop policy if exists "admins update categories" on public.categories;
create policy "admins update categories" on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete categories" on public.categories;
create policy "admins delete categories" on public.categories for delete to authenticated using (public.is_admin());

drop policy if exists "active users read records" on public.records;
create policy "active users read records" on public.records for select to authenticated using (public.is_active_user());
drop policy if exists "active users insert own records" on public.records;
create policy "active users insert own records" on public.records for insert to authenticated with check (public.is_active_user() and created_by = auth.uid());
drop policy if exists "admins update records" on public.records;
create policy "admins update records" on public.records for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admins delete records" on public.records;
create policy "admins delete records" on public.records for delete to authenticated using (public.is_admin());

drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs" on public.audit_logs for select to authenticated using (public.is_admin());
drop policy if exists "active users add audit logs" on public.audit_logs;
create policy "active users add audit logs" on public.audit_logs for insert to authenticated with check (public.is_active_user() and user_id = auth.uid());

-- BOOTSTRAP ADMIN:
-- 1) In Supabase Authentication -> Users, create a user with email admin@smartledger.local and a strong password.
-- 2) Copy that user's UUID, then run this INSERT after replacing YOUR_AUTH_USER_UUID.
-- INSERT INTO public.profiles (id, username, role, is_active)
-- VALUES ('YOUR_AUTH_USER_UUID', 'admin', 'admin', true);
