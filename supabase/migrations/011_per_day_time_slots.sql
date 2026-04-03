-- Add delivery_time_slot to subscription_day_configs 
-- This allows "Spread Across The Week" subscribers to pick a different 1-hour window for each day (e.g. 7 AM on Mon, 2 PM on Wed).

ALTER TABLE public.subscription_day_configs 
ADD COLUMN IF NOT EXISTS delivery_time_slot text;
