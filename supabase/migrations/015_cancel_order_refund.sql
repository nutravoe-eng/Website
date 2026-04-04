-- RPC to cancel a subscription order and refund the deducted amount back to wallet.
-- Only works on subscription orders with wallet payments that haven't been refunded yet.

CREATE OR REPLACE FUNCTION public.cancel_subscription_order(
  p_order_id uuid
)
RETURNS TABLE (
  order_id uuid,
  refunded_amount_rs numeric,
  new_wallet_balance_rs numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_sub record;
  v_debit_tx record;
  v_refund_amount numeric(10,2);
  v_new_balance numeric(10,2);
BEGIN
  -- Lock and fetch order
  SELECT o.id, o.user_id, o.status, o.order_type, o.payment_method,
         o.subscription_id, o.total
  INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'order is already cancelled';
  END IF;

  IF v_order.order_type != 'subscription' THEN
    RAISE EXCEPTION 'only subscription orders can be refunded this way';
  END IF;

  -- Mark the order cancelled
  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = p_order_id;

  -- Only refund if it was paid from wallet
  IF v_order.payment_method = 'wallet' AND v_order.subscription_id IS NOT NULL THEN
    -- Find the wallet debit transaction for this order
    SELECT wt.id, wt.amount_rs
    INTO v_debit_tx
    FROM public.wallet_transactions wt
    WHERE wt.order_id = p_order_id
      AND wt.type = 'debit'
    LIMIT 1;

    IF FOUND THEN
      v_refund_amount := v_debit_tx.amount_rs;

      -- Credit the amount back to wallet_loads (top up the earliest expiring active load)
      UPDATE public.wallet_loads
      SET remaining_amount_rs = remaining_amount_rs + v_refund_amount
      WHERE id = (
        SELECT id FROM public.wallet_loads
        WHERE subscription_id = v_order.subscription_id
          AND NOW() < expires_at
        ORDER BY expires_at ASC
        LIMIT 1
      );

      -- Record refund transaction
      INSERT INTO public.wallet_transactions (user_id, type, amount_rs, description, order_id)
      VALUES (v_order.user_id, 'credit', v_refund_amount,
              'Refund: order cancelled', p_order_id);

      -- Update current wallet balance on subscription
      SELECT SUM(remaining_amount_rs)
      INTO v_new_balance
      FROM public.wallet_loads
      WHERE subscription_id = v_order.subscription_id
        AND NOW() < expires_at;

      UPDATE public.subscriptions
      SET wallet_balance_rs = COALESCE(v_new_balance, 0)
      WHERE id = v_order.subscription_id;

      RETURN QUERY SELECT p_order_id, v_refund_amount, COALESCE(v_new_balance, 0);
      RETURN;
    END IF;
  END IF;

  -- Non-wallet order: just cancelled, no refund
  RETURN QUERY SELECT p_order_id, 0::numeric, 0::numeric;
END;
$$;
