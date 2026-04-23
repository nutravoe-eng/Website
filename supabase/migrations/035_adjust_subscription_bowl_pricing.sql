-- supabase/migrations/035_adjust_subscription_bowl_pricing.sql
-- Atomically adjusts wallet balance when admin changes bowl pricing on an active subscription.
-- For pending subscriptions (not yet paid), just update total_amount_rs — no wallet to touch.

create or replace function public.adjust_subscription_bowl_pricing(
  p_subscription_id uuid,
  p_new_total_rs    numeric
)
returns table (
  old_total_rs       numeric,
  new_total_rs       numeric,
  delta_rs           numeric,
  new_wallet_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub      record;
  v_delta    numeric(10,2);
  v_balance  numeric(10,2);
begin
  select id, user_id, total_amount_rs, payment_status
  into v_sub
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'subscription not found';
  end if;

  if p_new_total_rs is null or p_new_total_rs <= 0 then
    raise exception 'new total must be a non-negative number';
  end if;

  v_delta := p_new_total_rs - coalesce(v_sub.total_amount_rs, 0);

  -- Only touch the wallet if subscription has been paid (wallet was already credited).
  if v_sub.payment_status = 'paid' then
    if v_delta > 0 then
      -- Admin collected extra payment — credit the difference to the wallet.
      v_balance := public.credit_wallet_lot(
        v_sub.user_id,
        v_delta,
        'admin_adjustment',
        p_subscription_id,
        'Bowl change — additional payment collected',
        null,
        'admin_adjustment'
      );
    elsif v_delta < 0 then
      -- Bowl is cheaper — debit the surplus from the wallet.
      -- Check available balance before attempting debit
      select coalesce(balance_rs, 0) into v_balance
      from public.wallet_accounts
      where user_id = v_sub.user_id
      for update;

      if coalesce(v_balance, 0) < abs(v_delta) then
        raise exception 'Wallet balance (₹%) is less than the pricing reduction (₹%). Collect refund manually and retry after topping up.', coalesce(v_balance, 0), abs(v_delta);
      end if;

      v_balance := public.consume_wallet_balance(
        v_sub.user_id,
        abs(v_delta),
        'admin_adjustment',
        p_subscription_id,
        'Bowl change — pricing adjustment'
      );
    else
      -- No change — just read current balance.
      select balance_rs into v_balance
      from public.wallet_accounts
      where user_id = v_sub.user_id;
    end if;

    update public.subscriptions
    set total_amount_rs   = p_new_total_rs,
        wallet_balance_rs = v_balance
    where id = p_subscription_id;
  else
    -- Only allow silent total update for subscriptions not yet paid.
    -- Refunded/reversed states are not supported — admin must handle manually.
    if v_sub.payment_status not in ('pending', 'failed', 'not_paid') then
      raise exception 'Cannot adjust pricing for a subscription with payment status "%". Handle manually.', v_sub.payment_status;
    end if;

    -- Pending subscription: no wallet credit yet, update total only.
    v_balance := null;

    update public.subscriptions
    set total_amount_rs = p_new_total_rs
    where id = p_subscription_id;
  end if;

  return query
  select
    coalesce(v_sub.total_amount_rs, 0)::numeric as old_total_rs,
    p_new_total_rs::numeric                      as new_total_rs,
    v_delta::numeric                             as delta_rs,
    v_balance::numeric                           as new_wallet_balance;
end;
$$;
