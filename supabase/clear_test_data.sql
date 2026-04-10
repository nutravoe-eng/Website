-- ============================================================
-- Nutravoe – Clear all test user data
--
-- KEEPS:  admin user accounts, delivery_hubs, subscription_plans
--         (bowls are in Sanity CMS — not touched at all)
-- CLEARS: all non-admin user accounts (public + auth), their
--         orders, subscriptions, wallet, addresses, etc.
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Run All
-- ============================================================

-- 1. Cancellations
DELETE FROM public.cancellations
WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE);

-- 2. Wallet transactions
DELETE FROM public.wallet_transactions
WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE);

-- 3. Wallet credit lots
DELETE FROM public.wallet_credit_lots
WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE);

-- 4. Order items
DELETE FROM public.order_items
WHERE order_id IN (
  SELECT id FROM public.orders
  WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE)
);

-- 5. Orders
DELETE FROM public.orders
WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE);

-- 6. Support tickets
DELETE FROM public.support_tickets
WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE);

-- 7. Subscription day configs
DELETE FROM public.subscription_day_configs
WHERE subscription_id IN (
  SELECT id FROM public.subscriptions
  WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE)
);

-- 8. Subscriptions (user instances — subscription_plans catalogue is NOT touched)
DELETE FROM public.subscriptions
WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE);

-- 9. Wallet accounts
DELETE FROM public.wallet_accounts
WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE);

-- 10. Addresses
DELETE FROM public.addresses
WHERE user_id IN (SELECT id FROM public.users WHERE is_admin IS NOT TRUE);

-- 11. Churned users log
DELETE FROM public.churned_users;

-- 12. Area interest leads
DELETE FROM public.area_interest;

-- 13. Delete non-admin users from auth.users
--     The ON DELETE CASCADE from auth.users → public.users
--     will clean up public.users automatically.
DELETE FROM auth.users
WHERE id NOT IN (SELECT id FROM public.users WHERE is_admin = TRUE);

-- ── Verify ──────────────────────────────────────────────────
SELECT 'auth.users remaining'  AS label, COUNT(*) FROM auth.users
UNION ALL
SELECT 'public.users',                   COUNT(*) FROM public.users
UNION ALL
SELECT 'orders',                         COUNT(*) FROM public.orders
UNION ALL
SELECT 'subscriptions (user instances)', COUNT(*) FROM public.subscriptions
UNION ALL
SELECT 'subscription_plans (catalogue)', COUNT(*) FROM public.subscription_plans
UNION ALL
SELECT 'wallet_accounts',               COUNT(*) FROM public.wallet_accounts
UNION ALL
SELECT 'addresses',                      COUNT(*) FROM public.addresses;
