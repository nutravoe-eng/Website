-- Scratch cards given to customers (e.g. for rating us on Zomato).
-- Staff create a card from /admin/scratch-cards; the amount is drawn on the server
-- when the card is created and never changes. The customer opens /scratch/<code>,
-- scratches, and staff pay the amount by GPay and mark it paid.
-- Accessed only through the service-role client, so RLS is on with no policies.

CREATE TABLE IF NOT EXISTS public.scratch_cards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  customer_name  text,
  customer_phone text NOT NULL,
  amount_rs      integer NOT NULL CHECK (amount_rs BETWEEN 1 AND 1000),
  reason         text NOT NULL DEFAULT 'zomato_rating',
  note           text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  scratched_at   timestamptz,
  paid_at        timestamptz,
  paid_by        uuid,
  payment_ref    text
);

CREATE INDEX IF NOT EXISTS scratch_cards_phone_idx ON public.scratch_cards (customer_phone);
CREATE INDEX IF NOT EXISTS scratch_cards_created_idx ON public.scratch_cards (created_at DESC);

ALTER TABLE public.scratch_cards ENABLE ROW LEVEL SECURITY;
