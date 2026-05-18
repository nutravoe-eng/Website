-- Track whether stored distance_km came from OLA road routing or haversine fallback.
-- "straight_line" values are shorter than actual road distance and must not be trusted
-- at checkout when the delivery address is near the 10 km free-delivery threshold.
ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS distance_source TEXT
    CHECK (distance_source IN ('road', 'straight_line'));

COMMENT ON COLUMN public.addresses.distance_source IS
  'Source of distance_km: road = OLA Maps driving distance; straight_line = haversine fallback used when OLA unavailable. NULL means distance_km not yet synced.';
