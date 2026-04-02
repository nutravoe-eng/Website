-- Align subscription_plans slugs with the current product catalogue.
-- The old rows (standard, premium, bulk5) are no longer referenced by the app.

insert into public.subscription_plans (slug, name, price_per_bowl, min_bowls) values
  ('three-bowl', '3-Bowl / Week',  284, 3),
  ('five-bowl',  '5-Bowl / Week',  269, 5),
  ('daily',      'Daily Plan',     257, 7)
on conflict (slug) do update set
  name           = excluded.name,
  price_per_bowl = excluded.price_per_bowl,
  min_bowls      = excluded.min_bowls;
