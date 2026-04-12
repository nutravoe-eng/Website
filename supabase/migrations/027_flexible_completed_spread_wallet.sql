-- Flexible cycle "completed" status, completion RPC, spread skips subscription wallet load on approval,
-- and wallet top-up validation allows completed flexible still within period_end_date.

ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'completed';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Marks a flexible subscription completed when bowl count in the current cycle >= plan min_bowls.
CREATE OR REPLACE FUNCTION public.maybe_complete_flexible_subscription(p_subscription_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_limit int;
  v_period_start date;
  v_period_end date;
  v_cycle_days int;
  v_count bigint;
BEGIN
  SELECT
    s.id,
    s.status,
    s.style,
    s.billing_cycle,
    s.start_date,
    s.period_end_date,
    COALESCE(p.min_bowls, 0) AS min_bowls
  INTO v_sub
  FROM public.subscriptions s
  LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
  WHERE s.id = p_subscription_id
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_sub.style IS DISTINCT FROM 'flexible' THEN
    RETURN FALSE;
  END IF;

  IF v_sub.status IS DISTINCT FROM 'active' THEN
    RETURN FALSE;
  END IF;

  v_limit := COALESCE(v_sub.min_bowls, 0);
  IF v_limit <= 0 THEN
    RETURN FALSE;
  END IF;

  v_cycle_days := CASE WHEN v_sub.billing_cycle = 'monthly' THEN 30 ELSE 7 END;

  IF v_sub.period_end_date IS NOT NULL THEN
    v_period_end := v_sub.period_end_date;
    v_period_start := v_sub.period_end_date - v_cycle_days;
  ELSE
    v_period_start := COALESCE(v_sub.start_date::date, DATE '2000-01-01');
    v_period_end := ((timezone('Asia/Kolkata', now()))::date) + v_cycle_days;
  END IF;

  SELECT COALESCE(SUM(oi.quantity), 0)::bigint
  INTO v_count
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.subscription_id = p_subscription_id
    AND o.status IN ('confirmed', 'delivered')
    AND o.delivery_date >= v_period_start
    AND o.delivery_date <= v_period_end;

  IF v_count >= v_limit THEN
    UPDATE public.subscriptions
    SET
      status = 'completed'::public.subscription_status,
      completed_at = COALESCE(completed_at, timezone('utc', now()))
    WHERE id = p_subscription_id;

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- Approve subscription payment: spread plans do not load prepaid balance into the wallet (orders carry value).
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
  SELECT id, user_id, total_amount_rs, payment_status, billing_cycle, status, style
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

  UPDATE public.subscriptions
  SET payment_status    = 'paid',
      status            = 'active',
      period_end_date   = v_period_end,
      payment_reference = COALESCE(p_payment_reference, payment_reference),
      admin_notes       = COALESCE(p_admin_notes, admin_notes)
  WHERE id = p_subscription_id;

  IF v_sub.style = 'spread' THEN
    v_balance := public.refresh_wallet_balance(v_sub.user_id);
    UPDATE public.subscriptions
    SET wallet_balance_rs = v_balance
    WHERE id = p_subscription_id;

    RETURN QUERY
    SELECT p_subscription_id, 0::numeric, v_balance, NULL::timestamptz;
    RETURN;
  END IF;

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

CREATE OR REPLACE FUNCTION public.wallet_topup_requests_validate_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date;
BEGIN
  v_today := (timezone('Asia/Kolkata', now()))::date;

  IF NOT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.id = NEW.subscription_id
      AND s.user_id = NEW.user_id
      AND s.style = 'flexible'
      AND s.payment_status = 'paid'
      AND (
        s.status = 'active'
        OR (
          s.status = 'completed'
          AND s.period_end_date IS NOT NULL
          AND s.period_end_date >= v_today
        )
      )
  ) THEN
    RAISE EXCEPTION 'invalid subscription for wallet top-up';
  END IF;

  RETURN NEW;
END;
$$;

-- Spread plans are not wallet-funded; subscription prepay is represented by generated orders (no debit).
CREATE OR REPLACE FUNCTION public.create_subscription_delivery(
  p_subscription_id uuid,
  p_delivery_date date,
  p_delivery_time_slot text,
  p_bowls jsonb,
  p_status text default 'delivered'
)
RETURNS TABLE (
  order_id uuid,
  debited_amount_rs numeric,
  wallet_balance_rs numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub record;
  v_subtotal numeric(10,2);
  v_delivery_fee numeric(10,2);
  v_total numeric(10,2);
  v_order_id uuid;
  v_balance numeric(10,2);
BEGIN
  IF jsonb_typeof(p_bowls) <> 'array' OR jsonb_array_length(p_bowls) = 0 THEN
    RAISE EXCEPTION 'at least one bowl is required';
  END IF;

  IF p_status NOT IN ('delivered', 'confirmed', 'out_for_delivery', 'pending') THEN
    RAISE EXCEPTION 'invalid order status: %', p_status;
  END IF;

  SELECT id, user_id, delivery_address_id, delivery_fee, payment_status, status, style
  INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription not found';
  END IF;

  IF v_sub.status <> 'active' THEN
    RAISE EXCEPTION 'subscription is not active';
  END IF;

  IF v_sub.payment_status <> 'paid' THEN
    RAISE EXCEPTION 'subscription payment has not been confirmed yet';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE subscription_id = p_subscription_id
      AND delivery_date = p_delivery_date
  ) THEN
    RAISE EXCEPTION 'delivery already recorded for this subscription on %', p_delivery_date;
  END IF;

  SELECT COALESCE(SUM(
    ((item->>'quantity')::numeric) *
    ((item->>'unit_price')::numeric + COALESCE((item->>'customization_unit_price')::numeric, 0))
  ), 0)
  INTO v_subtotal
  FROM jsonb_array_elements(p_bowls) AS item;

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'delivery total must be greater than zero';
  END IF;

  v_delivery_fee := COALESCE(v_sub.delivery_fee, 0);
  v_total := v_subtotal + v_delivery_fee;

  INSERT INTO public.orders (
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
  ) VALUES (
    v_sub.user_id,
    p_subscription_id,
    'subscription',
    p_status::public.order_status,
    p_delivery_date,
    p_delivery_time_slot,
    v_sub.delivery_address_id,
    v_delivery_fee,
    v_subtotal,
    v_total,
    'wallet',
    'paid'
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id,
    bowl_slug,
    bowl_name,
    quantity,
    unit_price,
    total_price
  )
  SELECT
    v_order_id,
    item->>'bowl_slug',
    COALESCE(NULLIF(item->>'bowl_name', ''), item->>'bowl_slug'),
    (item->>'quantity')::int,
    (item->>'unit_price')::numeric,
    ((item->>'quantity')::numeric) *
      ((item->>'unit_price')::numeric + COALESCE((item->>'customization_unit_price')::numeric, 0))
  FROM jsonb_array_elements(p_bowls) AS item;

  IF v_sub.style = 'spread' THEN
    v_balance := public.refresh_wallet_balance(v_sub.user_id);
    UPDATE public.subscriptions
    SET wallet_balance_rs = v_balance
    WHERE id = p_subscription_id;

    RETURN QUERY
    SELECT v_order_id, 0::numeric, v_balance;
    RETURN;
  END IF;

  v_balance := public.consume_wallet_balance(
    v_sub.user_id,
    v_total,
    'order_payment',
    v_order_id,
    format('Subscription delivery for %s', p_delivery_date)
  );

  UPDATE public.subscriptions
  SET wallet_balance_rs = v_balance
  WHERE id = p_subscription_id;

  RETURN QUERY
  SELECT v_order_id, v_total, v_balance;
END;
$$;
