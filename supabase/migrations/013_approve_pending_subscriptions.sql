-- Allow approve_subscription_payment to work on 'pending' subscriptions
-- (flexible wallet plans start as pending and are activated on payment approval).
-- The function now also flips status → 'active' when approving a pending subscription.

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

  if v_sub.status not in ('active', 'pending') then
    raise exception 'only active or pending subscriptions can be approved';
  end if;

  if v_sub.total_amount_rs is null or v_sub.total_amount_rs <= 0 then
    raise exception 'subscription has no payable amount';
  end if;

  v_expires_at := public.wallet_expiry_for_cycle(v_sub.billing_cycle, now());
  v_note := format(
    'Subscription payment approved. Funds expire on %s.',
    to_char(v_expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')
  );

  -- Activate pending subscriptions and record payment
  update public.subscriptions
  set payment_status    = 'paid',
      status            = 'active',
      payment_reference = coalesce(p_payment_reference, payment_reference),
      admin_notes       = coalesce(p_admin_notes, admin_notes)
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
