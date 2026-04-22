-- Enable RLS on the two tables that were missing it.
-- Both tables are accessed only via the service-role client or SECURITY DEFINER
-- functions, so no user-level policies are needed — the service role bypasses RLS
-- and the anon/authenticated roles are blocked by default.

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.delivery_policy ENABLE ROW LEVEL SECURITY;
