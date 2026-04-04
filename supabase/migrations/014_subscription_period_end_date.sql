-- Add period_end_date to subscriptions so admin can see when a weekly/monthly period ends.
-- For weekly plans: start_date + 7 days
-- For monthly plans: start_date + 30 days
-- Set at approval time. Admin dashboard uses this to show "Ends in X days" countdown.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS period_end_date date;

-- Back-fill for any already-active subscriptions based on billing_cycle.
UPDATE public.subscriptions
SET period_end_date = CASE
  WHEN billing_cycle = 'monthly' THEN (start_date::date + 30)
  ELSE (start_date::date + 7)
END
WHERE status = 'active' AND period_end_date IS NULL;

-- Update the approve_subscription_payment function to set period_end_date on approval.
CREATE OR REPLACE FUNCTION public.approve_subscription_payment(
  p_subscription_id uuid,
  p_payment_reference text DEFAULT NULL,
  p_admin_notes text DEFAULT NULL
)
RETURNS TABLE (
  subscription_id uuid,
  credited_amount_rs numeric,
  wallet_balance_rs numeric,
  wallet_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_balance numeric(10,2);
  v_expires_at timestamptz;
  v_period_end date;
  v_note text;
BEGIN
  SELECT id, user_id, total_amount_rs, payment_status, billing_cycle, status
  INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription not found';
  END IF;

  IF v_sub.payment_status = 'paid' THEN
    RAISE EXCEPTION 'subscription payment already approved';
  END IF;

  IF v_sub.status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'only active or pending subscriptions can be approved';
  END IF;

  IF v_sub.total_amount_rs IS NULL OR v_sub.total_amount_rs <= 0 THEN
    RAISE EXCEPTION 'subscription has no payable amount';
  END IF;

  v_expires_at := public.wallet_expiry_for_cycle(v_sub.billing_cycle, now());
  v_period_end := CASE
    WHEN v_sub.billing_cycle = 'monthly' THEN (now() AT TIME ZONE 'Asia/Kolkata')::date + 30
    ELSE (now() AT TIME ZONE 'Asia/Kolkata')::date + 7
  END;

  v_note := format(
    'Subscription payment approved. Funds expire on %s.',
    to_char(v_expires_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')
  );

  -- Activate subscription and set period_end_date
  UPDATE public.subscriptions
  SET payment_status    = 'paid',
      status            = 'active',
      period_end_date   = v_period_end,
      payment_reference = COALESCE(p_payment_reference, payment_reference),
      admin_notes       = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_subscription_id;

  v_balance := public.credit_wallet_lot(
    v_sub.user_id,
    v_sub.total_amount_rs,
    'top_up',
    p_subscription_id,
    v_note,
    v_expires_at,
    'subscription_payment'
  );

  UPDATE public.subscriptions
  SET wallet_balance_rs = v_balance
  WHERE id = p_subscription_id;

  RETURN QUERY
  SELECT p_subscription_id, v_sub.total_amount_rs, v_balance, v_expires_at;
END;
$$;
