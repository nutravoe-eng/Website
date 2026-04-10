-- Migration 023: Document delivery_fee semantics after dynamic pricing update
--
-- The subscriptions.delivery_fee column already exists (added in 001_schema.sql).
-- This migration documents the new formula semantics introduced with dynamic
-- distance-based delivery pricing.
--
-- New formula (effective from this migration):
--   delivery_fee = ceil(distance_km) × 5   (customer pays half of total cost)
--   total_delivery_cost = ceil(distance_km) × 10
--   nutravoe_coverage = ceil(distance_km) × 5
--
-- delivery_fee = 0 when customer is within the 10km free zone.
-- Failsafe when geocoding fails: 60 (= ceil(12) × 5).
--
-- For spread/daily subscriptions, the weekly delivery charge billed to the customer is:
--   weekly_delivery_fee = delivery_fee × unique_delivery_days_per_week
-- This weekly amount is included in total_amount_rs.
--
-- For flexible (wallet) subscriptions, delivery_fee is 0 at the subscription level;
-- each individual order placed by the subscriber is charged the cart delivery fee.

COMMENT ON COLUMN public.subscriptions.delivery_fee IS
  'Per-delivery-trip fee charged to customer (rupees). Formula: ceil(distance_km) × 5. Zero if within 10km free zone. Failsafe: 60 if geocoding unavailable.';

COMMENT ON COLUMN public.subscriptions.total_amount_rs IS
  'Weekly billing amount including bowl prices, customisation fees, and delivery fees (delivery_fee × unique_delivery_days_per_week).';
