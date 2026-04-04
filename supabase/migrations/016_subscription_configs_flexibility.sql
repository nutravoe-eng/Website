-- Fix subscription day configurations to support multiple bowls per day
-- and preserve ingredient customizations.

-- 1. Add customizations column to store removals/extras
ALTER TABLE public.subscription_day_configs 
ADD COLUMN IF NOT EXISTS customizations jsonb DEFAULT '[]'::jsonb;

-- 2. Drop the overly restrictive unique constraint that limited us to one bowl per day
ALTER TABLE public.subscription_day_configs 
DROP CONSTRAINT IF EXISTS subscription_day_configs_subscription_id_day_of_week_key;

-- 3. Add a more granular constraint that allows multiple different bowls or different time slots on the same day
-- Note: We include bowl_slug and delivery_time_slot to allow variety on the same day.
-- We don't include 'customizations' in the unique index because JSONB comparison in unique indexes is complex,
-- and it's rare to want two identical bowls with identical customizations at the same time anyway.
ALTER TABLE public.subscription_day_configs 
ADD CONSTRAINT subscription_day_configs_multi_bowl_key 
UNIQUE (subscription_id, day_of_week, bowl_slug, delivery_time_slot);
