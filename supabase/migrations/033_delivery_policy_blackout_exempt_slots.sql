alter table public.delivery_policy
  add column if not exists blackout_exempt_slot_keys jsonb not null default '[]'::jsonb;
