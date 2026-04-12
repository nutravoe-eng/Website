-- Migration 024: Fix create_subscription_delivery to cast p_status text → order_status enum.
-- The previous version passed p_status (text) directly into the status column (order_status enum),
-- which PostgreSQL rejects without an explicit cast.

create or replace function public.create_subscription_delivery(
  p_subscription_id uuid,
  p_delivery_date date,
  p_delivery_time_slot text,
  p_bowls jsonb,
  p_status text default 'delivered'
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

  if p_status not in ('delivered', 'confirmed', 'out_for_delivery', 'pending') then
    raise exception 'invalid order status: %', p_status;
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

  -- Subtotal uses (unit_price + customization_unit_price) × quantity
  select coalesce(sum(
    ((item->>'quantity')::numeric) *
    ((item->>'unit_price')::numeric + coalesce((item->>'customization_unit_price')::numeric, 0))
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
    p_status::order_status,   -- explicit cast: text → order_status enum
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
    ((item->>'quantity')::numeric) *
      ((item->>'unit_price')::numeric + coalesce((item->>'customization_unit_price')::numeric, 0))
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
