-- Area interest: captures details of people who want delivery to unserved areas

create table if not exists public.area_interest (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  email       text,
  phone       text,
  pincode     text not null,
  created_at  timestamptz not null default now()
);

-- Anyone can insert (no auth required — they may not be signed in)
alter table public.area_interest enable row level security;

create policy "Anyone can submit area interest"
  on public.area_interest
  for insert
  to anon, authenticated
  with check (true);

-- Only admins can read
create policy "Admins can read area interest"
  on public.area_interest
  for select
  to authenticated
  using (public.is_admin());
