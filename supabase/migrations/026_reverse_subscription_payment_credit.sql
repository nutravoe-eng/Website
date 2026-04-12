-- Reverse wallet credits tied to a subscription approval when admin cancels a paid subscription.
-- Targets wallet_credit_lots with source_type = subscription_payment and source_reference_id = subscription id.

CREATE OR REPLACE FUNCTION public.reverse_subscription_payment_credit(
  p_subscription_id uuid,
  p_note text DEFAULT NULL
)
RETURNS TABLE (
  reversed_rs numeric,
  new_wallet_balance_rs numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.subscriptions%rowtype;
  v_user_id uuid;
  v_lot record;
  v_reversed numeric(10,2) := 0;
  v_wallet_id uuid;
  v_balance numeric(10,2);
  v_tx_note text;
BEGIN
  SELECT *
  INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription not found';
  END IF;

  IF v_sub.payment_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'subscription payment is not paid; nothing to reverse';
  END IF;

  v_user_id := v_sub.user_id;

  FOR v_lot IN
    SELECT id, remaining_amount_rs
    FROM public.wallet_credit_lots
    WHERE user_id = v_user_id
      AND source_reference_id = p_subscription_id
      AND source_type = 'subscription_payment'
      AND remaining_amount_rs > 0
    ORDER BY expires_at NULLS LAST, created_at ASC
    FOR UPDATE
  LOOP
    v_reversed := v_reversed + v_lot.remaining_amount_rs;
    UPDATE public.wallet_credit_lots
    SET remaining_amount_rs = 0
    WHERE id = v_lot.id;
  END LOOP;

  v_balance := public.refresh_wallet_balance(v_user_id);

  SELECT wa.id
  INTO v_wallet_id
  FROM public.wallet_accounts wa
  WHERE wa.user_id = v_user_id;

  IF v_reversed > 0 AND v_wallet_id IS NOT NULL THEN
    v_tx_note := COALESCE(
      NULLIF(TRIM(p_note), ''),
      'Subscription cancelled — subscription payment credit reversed'
    );
    INSERT INTO public.wallet_transactions (
      wallet_id,
      user_id,
      type,
      reason,
      amount_rs,
      balance_after,
      reference_id,
      note
    ) VALUES (
      v_wallet_id,
      v_user_id,
      'debit',
      'admin_adjustment'::public.wallet_tx_reason,
      v_reversed,
      v_balance,
      p_subscription_id,
      v_tx_note
    );
  END IF;

  UPDATE public.subscriptions
  SET
    status = 'cancelled',
    payment_status = 'refunded',
    wallet_balance_rs = v_balance
  WHERE id = p_subscription_id;

  RETURN QUERY
  SELECT v_reversed, v_balance;
END;
$$;
