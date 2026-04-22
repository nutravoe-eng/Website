-- Extend payment_status enum with values introduced by the refund-tracking and
-- not-paid features. ALTER TYPE ADD VALUE cannot be rolled back in a transaction,
-- so each statement is idempotent via IF NOT EXISTS.
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'not_paid';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'pending_refund';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refund_initiated';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'refund_complete';
