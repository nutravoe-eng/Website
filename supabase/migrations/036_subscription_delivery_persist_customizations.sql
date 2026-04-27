-- Ensure generated subscription deliveries persist order-item customizations.
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
    total_price,
    customizations
  )
  SELECT
    v_order_id,
    item->>'bowl_slug',
    COALESCE(NULLIF(item->>'bowl_name', ''), item->>'bowl_slug'),
    (item->>'quantity')::int,
    (item->>'unit_price')::numeric,
    ((item->>'quantity')::numeric) *
      ((item->>'unit_price')::numeric + COALESCE((item->>'customization_unit_price')::numeric, 0)),
    COALESCE(item->'customizations', '[]'::jsonb)
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

