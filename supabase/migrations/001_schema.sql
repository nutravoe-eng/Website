-- ============================================================
-- Nutravoe – Full Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";   -- for future full-text product search

-- ────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ────────────────────────────────────────────────────────────
create type subscription_style as enum ('spread', 'bulk', 'flexible');
create type subscription_status as enum ('active', 'paused', 'cancelled', 'expired');
create type order_status as enum ('pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled');
create type payment_method as enum ('razorpay', 'upi', 'wallet', 'whatsapp_cod', 'cod');
create type payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type wallet_tx_type as enum ('credit', 'debit');
create type wallet_tx_reason as enum (
  'top_up', 'order_payment', 'order_refund', 'cancellation_refund',
  'admin_adjustment', 'referral_bonus'
);
create type refund_destination as enum ('wallet', 'original_payment_method');
create type day_of_week as enum ('mon','tue','wed','thu','fri','sat','sun');
create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

-- ────────────────────────────────────────────────────────────
-- USERS  (mirrors auth.users)
-- ────────────────────────────────────────────────────────────
create table public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text unique not null,
  full_name     text,
  phone         text,
  avatar_url    text,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

-- Auto-create public.users row when a new auth.users row is inserted
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ────────────────────────────────────────────────────────────
-- DELIVERY HUBS
-- ────────────────────────────────────────────────────────────
create table public.delivery_hubs (
  id             uuid primary key default uuid_generate_v4(),
  slug           text unique not null,          -- e.g. 'domlur'
  name           text not null,                 -- e.g. 'Domlur Kitchen'
  address        text,
  lat            double precision not null,
  lng            double precision not null,
  free_radius_km numeric(5,2) default 10,
  delivery_fee   numeric(8,2) default 60,
  is_active      boolean default true,
  created_at     timestamptz default now() not null
);

-- Seed hub
insert into public.delivery_hubs (slug, name, address, lat, lng)
values (
  'domlur',
  'Domlur Kitchen',
  'Victoria II Apartment, 314/8 Patel Ram Reddy Rd, Domlur, Bengaluru 560071',
  12.9616,
  77.6382
);

-- ────────────────────────────────────────────────────────────
-- ADDRESSES
-- ────────────────────────────────────────────────────────────
create table public.addresses (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references public.users(id) on delete cascade,
  label          text,                           -- 'Home', 'Work', etc.
  line1          text not null,
  line2          text,
  city           text not null,
  state          text,
  pincode        text not null,
  lat            double precision,
  lng            double precision,
  nearest_hub_id uuid references public.delivery_hubs(id),
  distance_km    numeric(6,2),
  delivery_fee   numeric(8,2),
  is_default     boolean default false,
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

-- ────────────────────────────────────────────────────────────
-- SUBSCRIPTION PLANS  (catalogue)
-- ────────────────────────────────────────────────────────────
create table public.subscription_plans (
  id             uuid primary key default uuid_generate_v4(),
  slug           text unique not null,
  name           text not null,
  description    text,
  price_per_bowl numeric(8,2) not null,
  min_bowls      int default 1,
  is_active      boolean default true,
  created_at     timestamptz default now() not null
);

insert into public.subscription_plans (slug, name, price_per_bowl, min_bowls) values
  ('standard', 'Standard Bowl',  199, 1),
  ('premium',  'Premium Bowl',   249, 1),
  ('bulk5',    'Bulk 5-Pack',    185, 5),
  ('bulk10',   'Bulk 10-Pack',   175, 10);

-- ────────────────────────────────────────────────────────────
-- SUBSCRIPTIONS
-- ────────────────────────────────────────────────────────────
create table public.subscriptions (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references public.users(id) on delete cascade,
  plan_id              uuid references public.subscription_plans(id),
  style                subscription_style not null,
  status               subscription_status default 'active' not null,
  -- scheduling
  start_date           date not null,
  end_date             date,
  delivery_time_slot   text,                        -- '7:00 AM – 8:00 AM'
  -- bulk-specific
  bulk_bowls           int,
  bulk_delivery_date   date,
  -- flexible-specific
  wallet_balance_rs    numeric(10,2) default 0,
  -- billing
  delivery_address_id  uuid references public.addresses(id),
  delivery_fee         numeric(8,2) default 0,
  -- meta
  notes                text,
  created_at           timestamptz default now() not null,
  updated_at           timestamptz default now() not null
);

-- One active subscription per user at any time
create unique index one_active_sub_per_user
  on public.subscriptions(user_id)
  where status = 'active';

-- ────────────────────────────────────────────────────────────
-- SUBSCRIPTION DAY CONFIGS  (spread-across-week schedules)
-- ────────────────────────────────────────────────────────────
create table public.subscription_day_configs (
  id              uuid primary key default uuid_generate_v4(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  day_of_week     day_of_week not null,
  bowl_slug       text not null,
  quantity        int default 1 not null,
  created_at      timestamptz default now() not null,
  unique (subscription_id, day_of_week)
);

-- ────────────────────────────────────────────────────────────
-- WALLET ACCOUNTS
-- ────────────────────────────────────────────────────────────
create table public.wallet_accounts (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid unique not null references public.users(id) on delete cascade,
  balance_rs      numeric(10,2) default 0 not null check (balance_rs >= 0),
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

-- ────────────────────────────────────────────────────────────
-- WALLET TRANSACTIONS
-- ────────────────────────────────────────────────────────────
create table public.wallet_transactions (
  id              uuid primary key default uuid_generate_v4(),
  wallet_id       uuid not null references public.wallet_accounts(id) on delete cascade,
  user_id         uuid not null references public.users(id),
  type            wallet_tx_type not null,
  reason          wallet_tx_reason not null,
  amount_rs       numeric(10,2) not null check (amount_rs > 0),
  balance_after   numeric(10,2) not null,
  reference_id    uuid,                  -- order_id or cancellation_id
  note            text,
  created_at      timestamptz default now() not null
);

-- Auto-create wallet when user is created
create or replace function public.handle_new_user_wallet()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.wallet_accounts (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_user_created_wallet on public.users;
create trigger on_user_created_wallet
  after insert on public.users
  for each row execute procedure public.handle_new_user_wallet();

-- ────────────────────────────────────────────────────────────
-- ORDERS
-- ────────────────────────────────────────────────────────────
create table public.orders (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references public.users(id),
  subscription_id      uuid references public.subscriptions(id),
  status               order_status default 'pending' not null,
  -- delivery
  delivery_date        date not null,
  delivery_time_slot   text,
  delivery_address_id  uuid references public.addresses(id),
  delivery_fee         numeric(8,2) default 0,
  -- payment
  subtotal             numeric(10,2) not null,
  total                numeric(10,2) not null,
  payment_method       payment_method,
  payment_status       payment_status default 'pending',
  payment_reference    text,             -- Razorpay payment ID, etc.
  -- meta
  notes                text,
  created_at           timestamptz default now() not null,
  updated_at           timestamptz default now() not null
);

-- ────────────────────────────────────────────────────────────
-- ORDER ITEMS
-- ────────────────────────────────────────────────────────────
create table public.order_items (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  bowl_slug    text not null,
  bowl_name    text not null,
  quantity     int not null default 1,
  unit_price   numeric(8,2) not null,
  total_price  numeric(8,2) not null,
  created_at   timestamptz default now() not null
);

-- ────────────────────────────────────────────────────────────
-- CANCELLATIONS
-- ────────────────────────────────────────────────────────────
create table public.cancellations (
  id                   uuid primary key default uuid_generate_v4(),
  order_id             uuid not null references public.orders(id),
  user_id              uuid not null references public.users(id),
  cancelled_at         timestamptz default now() not null,
  reason               text,
  refund_amount        numeric(10,2) not null,
  refund_destination   refund_destination not null,
  refund_status        text default 'processing',   -- processing, completed, failed
  wallet_tx_id         uuid references public.wallet_transactions(id),
  created_at           timestamptz default now() not null
);

-- ────────────────────────────────────────────────────────────
-- SUPPORT TICKETS
-- ────────────────────────────────────────────────────────────
create table public.support_tickets (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.users(id),
  topic        text not null,
  subject      text,
  message      text not null,
  status       ticket_status default 'open',
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

-- ────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER (reusable)
-- ────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at          before update on public.users          for each row execute procedure public.set_updated_at();
create trigger trg_addresses_updated_at      before update on public.addresses      for each row execute procedure public.set_updated_at();
create trigger trg_subscriptions_updated_at  before update on public.subscriptions  for each row execute procedure public.set_updated_at();
create trigger trg_wallet_updated_at         before update on public.wallet_accounts for each row execute procedure public.set_updated_at();
create trigger trg_orders_updated_at         before update on public.orders          for each row execute procedure public.set_updated_at();
create trigger trg_tickets_updated_at        before update on public.support_tickets for each row execute procedure public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────
alter table public.users                  enable row level security;
alter table public.addresses              enable row level security;
alter table public.subscriptions          enable row level security;
alter table public.subscription_day_configs enable row level security;
alter table public.wallet_accounts        enable row level security;
alter table public.wallet_transactions    enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.cancellations          enable row level security;
alter table public.support_tickets        enable row level security;
alter table public.delivery_hubs          enable row level security;
alter table public.subscription_plans     enable row level security;

-- Public read for catalogue tables
create policy "anyone can view delivery hubs"
  on public.delivery_hubs for select using (true);

create policy "anyone can view subscription plans"
  on public.subscription_plans for select using (true);

-- Users: own row only
create policy "users: select own"  on public.users for select  using (auth.uid() = id);
create policy "users: update own"  on public.users for update  using (auth.uid() = id);

-- Addresses
create policy "addresses: select own"  on public.addresses for select  using (auth.uid() = user_id);
create policy "addresses: insert own"  on public.addresses for insert  with check (auth.uid() = user_id);
create policy "addresses: update own"  on public.addresses for update  using (auth.uid() = user_id);
create policy "addresses: delete own"  on public.addresses for delete  using (auth.uid() = user_id);

-- Subscriptions
create policy "subscriptions: select own"  on public.subscriptions for select  using (auth.uid() = user_id);
create policy "subscriptions: insert own"  on public.subscriptions for insert  with check (auth.uid() = user_id);
create policy "subscriptions: update own"  on public.subscriptions for update  using (auth.uid() = user_id);

-- Subscription day configs
create policy "day_configs: select own"  on public.subscription_day_configs for select
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));
create policy "day_configs: insert own"  on public.subscription_day_configs for insert
  with check (exists (select 1 from public.subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));
create policy "day_configs: update own"  on public.subscription_day_configs for update
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));
create policy "day_configs: delete own"  on public.subscription_day_configs for delete
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));

-- Wallet
create policy "wallet: select own"  on public.wallet_accounts for select  using (auth.uid() = user_id);
create policy "wallet: update own"  on public.wallet_accounts for update  using (auth.uid() = user_id);

create policy "wallet_tx: select own"  on public.wallet_transactions for select  using (auth.uid() = user_id);
create policy "wallet_tx: insert own"  on public.wallet_transactions for insert  with check (auth.uid() = user_id);

-- Orders
create policy "orders: select own"  on public.orders for select  using (auth.uid() = user_id);
create policy "orders: insert own"  on public.orders for insert  with check (auth.uid() = user_id);
create policy "orders: update own"  on public.orders for update  using (auth.uid() = user_id);

-- Order items
create policy "order_items: select own"
  on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "order_items: insert own"
  on public.order_items for insert
  with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Cancellations
create policy "cancellations: select own"  on public.cancellations for select  using (auth.uid() = user_id);
create policy "cancellations: insert own"  on public.cancellations for insert  with check (auth.uid() = user_id);

-- Support tickets
create policy "tickets: select own"  on public.support_tickets for select  using (auth.uid() = user_id);
create policy "tickets: insert own"  on public.support_tickets for insert  with check (auth.uid() = user_id);
create policy "tickets: update own"  on public.support_tickets for update  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- USEFUL INDEXES
-- ────────────────────────────────────────────────────────────
create index idx_subscriptions_user  on public.subscriptions(user_id);
create index idx_orders_user         on public.orders(user_id);
create index idx_orders_date         on public.orders(delivery_date);
create index idx_wallet_tx_wallet    on public.wallet_transactions(wallet_id);
create index idx_addresses_user      on public.addresses(user_id);
