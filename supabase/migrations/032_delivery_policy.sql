create table if not exists public.delivery_policy (
  id smallint primary key default 1 check (id = 1),
  asap_enabled boolean not null default true,
  blackout_start timestamptz null,
  blackout_end timestamptz null,
  disabled_slot_keys jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint delivery_policy_blackout_window_valid
    check (blackout_start is null or blackout_end is null or blackout_start < blackout_end)
);

create index if not exists idx_delivery_policy_updated_at on public.delivery_policy (updated_at desc);

insert into public.delivery_policy (id, asap_enabled, blackout_start, blackout_end, disabled_slot_keys)
values (1, true, null, null, '[]'::jsonb)
on conflict (id) do nothing;
