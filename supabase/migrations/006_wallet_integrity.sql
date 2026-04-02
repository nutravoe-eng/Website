alter table public.subscriptions
  add column if not exists billing_cycle text not null default 'weekly'
  check (billing_cycle in ('weekly', 'monthly'));

create table if not exists public.wallet_credit_lots (
  id                  uuid primary key default uuid_generate_v4(),
  wallet_id           uuid not null references public.wallet_accounts(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  source_type         text not null check (source_type in ('subscription_payment', 'refund', 'admin_adjustment')),
  source_reference_id uuid,
  amount_rs           numeric(10,2) not null check (amount_rs > 0),
  remaining_amount_rs numeric(10,2) not null check (remaining_amount_rs >= 0 and remaining_amount_rs <= amount_rs),
  expires_at          timestamptz,
  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null
);

insert into public.wallet_credit_lots (
  wallet_id,
  user_id,
  source_type,
  amount_rs,
  remaining_amount_rs,
  expires_at
)
select
  wa.id,
  wa.user_id,
  'admin_adjustment',
  wa.balance_rs,
  wa.balance_rs,
  null
from public.wallet_accounts wa
where wa.balance_rs > 0
  and not exists (
    select 1
    from public.wallet_credit_lots wcl
    where wcl.wallet_id = wa.id
  );

create trigger trg_wallet_credit_lots_updated_at
  before update on public.wallet_credit_lots
  for each row execute procedure public.set_updated_at();

create index if not exists idx_wallet_credit_lots_user on public.wallet_credit_lots(user_id, expires_at, created_at);

create unique index if not exists uq_subscription_delivery_date
  on public.orders(subscription_id, delivery_date)
  where subscription_id is not null;

alter table public.wallet_credit_lots enable row level security;

create policy "wallet_credit_lots: select own"
  on public.wallet_credit_lots for select
  using (auth.uid() = user_id);

create policy "wallet_credit_lots: admin select all"
  on public.wallet_credit_lots for select
  using (public.is_admin());

create or replace function public.refresh_wallet_balance(p_user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(10,2);
begin
  insert into public.wallet_accounts (user_id, balance_rs)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select coalesce(sum(remaining_amount_rs), 0)
  into v_balance
  from public.wallet_credit_lots
  where user_id = p_user_id
    and remaining_amount_rs > 0
    and (expires_at is null or expires_at > now());

  update public.wallet_accounts
  set balance_rs = v_balance
  where user_id = p_user_id;

  return v_balance;
end;
$$;

create or replace function public.credit_wallet_lot(
  p_user_id uuid,
  p_amount_rs numeric,
  p_reason wallet_tx_reason,
  p_reference_id uuid default null,
  p_note text default null,
  p_expires_at timestamptz default null,
  p_source_type text default 'admin_adjustment'
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallet_accounts%rowtype;
  v_balance numeric(10,2);
begin
  if p_amount_rs is null or p_amount_rs <= 0 then
    raise exception 'credit amount must be greater than zero';
  end if;

  insert into public.wallet_accounts (user_id, balance_rs)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  insert into public.wallet_credit_lots (
    wallet_id,
    user_id,
    source_type,
    source_reference_id,
    amount_rs,
    remaining_amount_rs,
    expires_at
  ) values (
    v_wallet.id,
    p_user_id,
    p_source_type,
    p_reference_id,
    p_amount_rs,
    p_amount_rs,
    p_expires_at
  );

  v_balance := public.refresh_wallet_balance(p_user_id);

  insert into public.wallet_transactions (
    wallet_id,
    user_id,
    type,
    reason,
    amount_rs,
    balance_after,
    reference_id,
    note
  ) values (
    v_wallet.id,
    p_user_id,
    'credit',
    p_reason,
    p_amount_rs,
    v_balance,
    p_reference_id,
    p_note
  );

  return v_balance;
end;
$$;

create or replace function public.consume_wallet_balance(
  p_user_id uuid,
  p_amount_rs numeric,
  p_reason wallet_tx_reason,
  p_reference_id uuid default null,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallet_accounts%rowtype;
  v_available numeric(10,2);
  v_remaining numeric(10,2);
  v_lot record;
  v_spent numeric(10,2);
  v_balance numeric(10,2);
begin
  if p_amount_rs is null or p_amount_rs <= 0 then
    raise exception 'debit amount must be greater than zero';
  end if;

  insert into public.wallet_accounts (user_id, balance_rs)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select *
  into v_wallet
  from public.wallet_accounts
  where user_id = p_user_id
  for update;

  v_available := public.refresh_wallet_balance(p_user_id);
  if v_available < p_amount_rs then
    raise exception 'insufficient wallet balance';
  end if;

  v_remaining := p_amount_rs;

  for v_lot in
    select id, remaining_amount_rs
    from public.wallet_credit_lots
    where user_id = p_user_id
      and remaining_amount_rs > 0
      and (expires_at is null or expires_at > now())
    order by expires_at nulls last, created_at asc
    for update
  loop
    exit when v_remaining <= 0;
    v_spent := least(v_lot.remaining_amount_rs, v_remaining);

    update public.wallet_credit_lots
    set remaining_amount_rs = remaining_amount_rs - v_spent
    where id = v_lot.id;

    v_remaining := v_remaining - v_spent;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient wallet balance';
  end if;

  v_balance := public.refresh_wallet_balance(p_user_id);

  insert into public.wallet_transactions (
    wallet_id,
    user_id,
    type,
    reason,
    amount_rs,
    balance_after,
    reference_id,
    note
  ) values (
    v_wallet.id,
    p_user_id,
    'debit',
    p_reason,
    p_amount_rs,
    v_balance,
    p_reference_id,
    p_note
  );

  return v_balance;
end;
$$;

create or replace function public.wallet_expiry_for_cycle(
  p_billing_cycle text,
  p_loaded_at timestamptz default now()
)
returns timestamptz
language sql
immutable
as $$
  select case
    when p_billing_cycle = 'monthly' then p_loaded_at + interval '1 month'
    else p_loaded_at + interval '7 days'
  end;
$$;

create or replace function public.approve_subscription_payment(
  p_subscription_id uuid,
  p_payment_reference text default null,
  p_admin_notes text default null
)
returns table (
  subscription_id uuid,
  credited_amount_rs numeric,
  wallet_balance_rs numeric,
  wallet_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_balance numeric(10,2);
  v_expires_at timestamptz;
  v_note text;
begin
  select id, user_id, total_amount_rs, payment_status, billing_cycle, status
  into v_sub
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'subscription not found';
  end if;

  if v_sub.payment_status = 'paid' then
    raise exception 'subscription payment already approved';
  end if;

  if v_sub.status <> 'active' then
    raise exception 'only active subscriptions can load wallet funds';
  end if;

  if v_sub.total_amount_rs is null or v_sub.total_amount_rs <= 0 then
    raise exception 'subscription has no payable amount';
  end if;

  v_expires_at := public.wallet_expiry_for_cycle(v_sub.billing_cycle, now());
  v_note := format(
    'Subscription payment approved. Funds expire on %s.',
    to_char(v_expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')
  );

  update public.subscriptions
  set payment_status = 'paid',
      payment_reference = coalesce(p_payment_reference, payment_reference),
      admin_notes = coalesce(p_admin_notes, admin_notes)
  where id = p_subscription_id;

  v_balance := public.credit_wallet_lot(
    v_sub.user_id,
    v_sub.total_amount_rs,
    'top_up',
    p_subscription_id,
    v_note,
    v_expires_at,
    'subscription_payment'
  );

  update public.subscriptions
  set wallet_balance_rs = v_balance
  where id = p_subscription_id;

  return query
  select p_subscription_id, v_sub.total_amount_rs, v_balance, v_expires_at;
end;
$$;

create or replace function public.create_subscription_delivery(
  p_subscription_id uuid,
  p_delivery_date date,
  p_delivery_time_slot text,
  p_bowls jsonb
)
returns table (
  order_id uuid,
  debited_amount_rs numeric,
  wallet_balance_rs numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_subtotal numeric(10,2);
  v_delivery_fee numeric(10,2);
  v_total numeric(10,2);
  v_order_id uuid;
  v_balance numeric(10,2);
begin
  if jsonb_typeof(p_bowls) <> 'array' or jsonb_array_length(p_bowls) = 0 then
    raise exception 'at least one bowl is required';
  end if;

  select id, user_id, delivery_address_id, delivery_fee, payment_status, status
  into v_sub
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'subscription not found';
  end if;

  if v_sub.status <> 'active' then
    raise exception 'subscription is not active';
  end if;

  if v_sub.payment_status <> 'paid' then
    raise exception 'subscription payment has not been confirmed yet';
  end if;

  if exists (
    select 1
    from public.orders
    where subscription_id = p_subscription_id
      and delivery_date = p_delivery_date
  ) then
    raise exception 'delivery already recorded for this subscription on %', p_delivery_date;
  end if;

  select coalesce(sum(
    ((item->>'quantity')::numeric) * ((item->>'unit_price')::numeric)
  ), 0)
  into v_subtotal
  from jsonb_array_elements(p_bowls) as item;

  if v_subtotal <= 0 then
    raise exception 'delivery total must be greater than zero';
  end if;

  v_delivery_fee := coalesce(v_sub.delivery_fee, 0);
  v_total := v_subtotal + v_delivery_fee;

  insert into public.orders (
    user_id,
    subscription_id,
    order_type,
    status,
    delivery_date,
    delivery_time_slot,
    delivery_address_id,
    delivery_fee,
    subtotal,
    total,
    payment_method,
    payment_status
  ) values (
    v_sub.user_id,
    p_subscription_id,
    'subscription',
    'delivered',
    p_delivery_date,
    p_delivery_time_slot,
    v_sub.delivery_address_id,
    v_delivery_fee,
    v_subtotal,
    v_total,
    'wallet',
    'paid'
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id,
    bowl_slug,
    bowl_name,
    quantity,
    unit_price,
    total_price
  )
  select
    v_order_id,
    item->>'bowl_slug',
    coalesce(nullif(item->>'bowl_name', ''), item->>'bowl_slug'),
    (item->>'quantity')::int,
    (item->>'unit_price')::numeric,
    ((item->>'quantity')::numeric) * ((item->>'unit_price')::numeric)
  from jsonb_array_elements(p_bowls) as item;

  v_balance := public.consume_wallet_balance(
    v_sub.user_id,
    v_total,
    'order_payment',
    v_order_id,
    format('Subscription delivery for %s', p_delivery_date)
  );

  update public.subscriptions
  set wallet_balance_rs = v_balance
  where id = p_subscription_id;

  return query
  select v_order_id, v_total, v_balance;
end;
$$;
