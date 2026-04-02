drop policy if exists "users: update own" on public.users;

drop policy if exists "subscriptions: insert own" on public.subscriptions;
drop policy if exists "subscriptions: update own" on public.subscriptions;

drop policy if exists "day_configs: insert own" on public.subscription_day_configs;
drop policy if exists "day_configs: update own" on public.subscription_day_configs;
drop policy if exists "day_configs: delete own" on public.subscription_day_configs;

drop policy if exists "wallet: update own" on public.wallet_accounts;
drop policy if exists "wallet_tx: insert own" on public.wallet_transactions;

drop policy if exists "orders: insert own" on public.orders;
drop policy if exists "orders: update own" on public.orders;
drop policy if exists "order_items: insert own" on public.order_items;

drop policy if exists "cancellations: insert own" on public.cancellations;
drop policy if exists "tickets: update own" on public.support_tickets;
