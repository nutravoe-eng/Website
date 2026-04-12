-- Wallet top-up requests (user-initiated, admin-approved) + extend credit lot source types.

-- Allow tagging wallet loads from approved top-up requests distinctly from generic admin adjustments.
ALTER TABLE public.wallet_credit_lots
  DROP CONSTRAINT IF EXISTS wallet_credit_lots_source_type_check;

ALTER TABLE public.wallet_credit_lots
  ADD CONSTRAINT wallet_credit_lots_source_type_check
  CHECK (source_type IN ('subscription_payment', 'refund', 'admin_adjustment', 'top_up'));

CREATE TYPE public.wallet_topup_request_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

CREATE TABLE public.wallet_topup_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref            text NOT NULL UNIQUE,
  user_id               uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  subscription_id       uuid NOT NULL REFERENCES public.subscriptions (id) ON DELETE CASCADE,
  amount_rs             numeric(12, 2) NOT NULL CHECK (amount_rs >= 100 AND amount_rs <= 50000),
  status                public.wallet_topup_request_status NOT NULL DEFAULT 'pending',
  payment_reference     text,
  user_note             text,
  admin_notes           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz
);

CREATE INDEX idx_wallet_topup_requests_user_created
  ON public.wallet_topup_requests (user_id, created_at DESC);

CREATE INDEX idx_wallet_topup_requests_status_created
  ON public.wallet_topup_requests (status, created_at DESC);

-- At most one outstanding request per subscription (avoids duplicate WhatsApp / ops confusion).
CREATE UNIQUE INDEX uq_wallet_topup_one_pending_per_subscription
  ON public.wallet_topup_requests (subscription_id)
  WHERE status = 'pending';

ALTER TABLE public.wallet_topup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_topup_requests: select own"
  ON public.wallet_topup_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "wallet_topup_requests: select admin"
  ON public.wallet_topup_requests FOR SELECT
  USING (public.is_admin());

CREATE POLICY "wallet_topup_requests: insert own"
  ON public.wallet_topup_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users may only cancel their own pending request (transition to cancelled).
CREATE POLICY "wallet_topup_requests: update cancel own"
  ON public.wallet_topup_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

CREATE OR REPLACE FUNCTION public.wallet_topup_requests_validate_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.id = NEW.subscription_id
      AND s.user_id = NEW.user_id
      AND s.style = 'flexible'
      AND s.status = 'active'
      AND s.payment_status = 'paid'
  ) THEN
    RAISE EXCEPTION 'invalid subscription for wallet top-up';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_topup_validate_subscription ON public.wallet_topup_requests;
CREATE TRIGGER trg_wallet_topup_validate_subscription
  BEFORE INSERT ON public.wallet_topup_requests
  FOR EACH ROW EXECUTE PROCEDURE public.wallet_topup_requests_validate_subscription();
