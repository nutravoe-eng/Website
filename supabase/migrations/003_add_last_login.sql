-- ============================================================
-- Nutravoe – Add last_login_at to public.users
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

alter table public.users
  add column if not exists last_login_at timestamptz;
