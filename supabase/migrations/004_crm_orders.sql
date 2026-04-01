-- ============================================================
-- Nutravoe – CRM & Order Type Enhancements
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ORDER TYPE ENUM + COLUMN
-- ────────────────────────────────────────────────────────────
create type order_type as enum ('one_time', 'subscription');

alter table public.orders
  add column if not exists order_type order_type not null default 'one_time';

-- ────────────────────────────────────────────────────────────
-- 2. ADMIN NOTES ON ORDERS
--    Separate from customer-facing `notes` column
-- ────────────────────────────────────────────────────────────
alter table public.orders
  add column if not exists admin_notes text;

-- ────────────────────────────────────────────────────────────
-- 3. BOWL CUSTOMIZATIONS ON ORDER ITEMS
--    Stores removed/added ingredients per item
--    Shape: { "removed": ["onion","tomato"], "added": ["extra paneer"] }
-- ────────────────────────────────────────────────────────────
alter table public.order_items
  add column if not exists customizations jsonb;

-- ────────────────────────────────────────────────────────────
-- 4. SUBSCRIPTION PAYMENT TRACKING
--    Subscriptions are prepaid upfront → wallet credited
-- ────────────────────────────────────────────────────────────
alter table public.subscriptions
  add column if not exists total_amount_rs  numeric(10,2),
  add column if not exists payment_status   payment_status default 'pending',
  add column if not exists payment_reference text,
  add column if not exists admin_notes      text;

-- ────────────────────────────────────────────────────────────
-- 5. ADMIN FLAG ON USERS
-- ────────────────────────────────────────────────────────────
alter table public.users
  add column if not exists is_admin boolean not null default false;

-- ────────────────────────────────────────────────────────────
-- 6. RLS POLICIES FOR ADMIN
--    Admin users (is_admin = true) can read and update all rows.
--    All admin API routes use the service-role client which bypasses
--    RLS entirely — these policies exist as a secondary safety net
--    for any queries that go through the anon/user client.
-- ────────────────────────────────────────────────────────────

-- Helper function: returns true if the calling user is an admin
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select coalesce(
    (select is_admin from public.users where id = auth.uid()),
    false
  );
$$;

-- Orders: admin can read and update all
create policy "orders: admin select all"
  on public.orders for select
  using (public.is_admin());

create policy "orders: admin update all"
  on public.orders for update
  using (public.is_admin());

-- Order items: admin can read all
create policy "order_items: admin select all"
  on public.order_items for select
  using (public.is_admin());

-- Subscriptions: admin can read and update all
create policy "subscriptions: admin select all"
  on public.subscriptions for select
  using (public.is_admin());

create policy "subscriptions: admin update all"
  on public.subscriptions for update
  using (public.is_admin());

-- Subscription day configs: admin can read all
create policy "day_configs: admin select all"
  on public.subscription_day_configs for select
  using (public.is_admin());

-- Users: admin can read all (needed for CRM customer lookup)
create policy "users: admin select all"
  on public.users for select
  using (public.is_admin());

-- Addresses: admin can read all (needed for delivery manifest)
create policy "addresses: admin select all"
  on public.addresses for select
  using (public.is_admin());

-- Wallet transactions: admin can read all
create policy "wallet_tx: admin select all"
  on public.wallet_transactions for select
  using (public.is_admin());

-- Cancellations: admin can read all
create policy "cancellations: admin select all"
  on public.cancellations for select
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────
-- 7. USEFUL INDEXES FOR CRM QUERIES
-- ────────────────────────────────────────────────────────────
create index if not exists idx_orders_order_type      on public.orders(order_type);
create index if not exists idx_orders_payment_status  on public.orders(payment_status);
create index if not exists idx_orders_status          on public.orders(status);
create index if not exists idx_subscriptions_status   on public.subscriptions(status);
create index if not exists idx_subscriptions_payment  on public.subscriptions(payment_status);
