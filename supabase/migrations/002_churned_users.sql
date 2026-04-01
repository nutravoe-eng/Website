-- ============================================================
-- Nutravoe – Churned Users Table
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists public.churned_users (
  id              uuid primary key default uuid_generate_v4(),
  -- We store user_id as text because the auth.users row will be deleted
  original_user_id  text not null,
  email           text not null,
  phone           text,
  full_name       text,
  deleted_at      timestamptz default now() not null,
  -- 30-day grace period for reactivation requests
  purge_at        timestamptz default (now() + interval '30 days') not null
);

-- Fast lookup by email or phone at sign-in/sign-up time
create index idx_churned_users_email on public.churned_users(lower(email));
create index idx_churned_users_phone on public.churned_users(phone);

-- Only service-role can read/write this table (no RLS policies needed for users)
alter table public.churned_users enable row level security;
-- No public policies — only server-side admin client accesses this table
