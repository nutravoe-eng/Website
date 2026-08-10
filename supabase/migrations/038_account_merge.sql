-- Account merge for phone-OTP identity forks (Nutravoe)
-- Prefer running in Supabase SQL Editor / migration pipeline before relying on phone login merge.
--
-- Surviving account = p_primary_user_id
-- Absorbed account  = p_secondary_user_id (deleted by app via Auth Admin API after this RPC)

create or replace function public.merge_accounts(p_primary_user_id uuid, p_secondary_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary_wallet_id uuid;
  v_secondary_wallet_id uuid;
  v_secondary_balance numeric(10,2) := 0;
  v_primary_has_active boolean := false;
begin
  if p_primary_user_id is null or p_secondary_user_id is null then
    raise exception 'primary and secondary user ids are required';
  end if;

  if p_primary_user_id = p_secondary_user_id then
    raise exception 'cannot merge an account into itself';
  end if;

  if not exists (select 1 from public.users where id = p_primary_user_id) then
    raise exception 'primary user not found';
  end if;

  if not exists (select 1 from public.users where id = p_secondary_user_id) then
    raise exception 'secondary user not found';
  end if;

  -- ── Addresses: avoid multiple defaults ──────────────────────────
  update public.addresses
  set is_default = false
  where user_id = p_secondary_user_id
    and exists (
      select 1 from public.addresses a2
      where a2.user_id = p_primary_user_id and a2.is_default = true
    );

  update public.addresses
  set user_id = p_primary_user_id
  where user_id = p_secondary_user_id;

  -- ── Subscriptions: only one active per user ─────────────────────
  select exists (
    select 1 from public.subscriptions
    where user_id = p_primary_user_id and status = 'active'
  ) into v_primary_has_active;

  if v_primary_has_active then
    update public.subscriptions
    set status = 'paused', updated_at = now()
    where user_id = p_secondary_user_id and status = 'active';
  end if;

  update public.subscriptions
  set user_id = p_primary_user_id, updated_at = now()
  where user_id = p_secondary_user_id;

  -- ── Orders / cancellations / support ────────────────────────────
  update public.orders
  set user_id = p_primary_user_id, updated_at = now()
  where user_id = p_secondary_user_id;

  update public.cancellations
  set user_id = p_primary_user_id
  where user_id = p_secondary_user_id;

  update public.support_tickets
  set user_id = p_primary_user_id
  where user_id = p_secondary_user_id;

  -- ── Wallets (user_id UNIQUE on wallet_accounts) ─────────────────
  select id into v_primary_wallet_id
  from public.wallet_accounts
  where user_id = p_primary_user_id;

  select id, balance_rs into v_secondary_wallet_id, v_secondary_balance
  from public.wallet_accounts
  where user_id = p_secondary_user_id;

  if v_secondary_wallet_id is not null then
    if v_primary_wallet_id is null then
      update public.wallet_accounts
      set user_id = p_primary_user_id, updated_at = now()
      where id = v_secondary_wallet_id;
      v_primary_wallet_id := v_secondary_wallet_id;
    else
      -- Move lots + txs onto primary wallet, then drop secondary wallet row
      if exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'wallet_credit_lots'
      ) then
        update public.wallet_credit_lots
        set wallet_id = v_primary_wallet_id, user_id = p_primary_user_id
        where wallet_id = v_secondary_wallet_id;
      end if;

      update public.wallet_transactions
      set wallet_id = v_primary_wallet_id, user_id = p_primary_user_id
      where wallet_id = v_secondary_wallet_id;

      update public.wallet_accounts
      set
        balance_rs = balance_rs + coalesce(v_secondary_balance, 0),
        updated_at = now()
      where id = v_primary_wallet_id;

      -- Zero then delete secondary wallet (balance check constraint)
      update public.wallet_accounts
      set balance_rs = 0, updated_at = now()
      where id = v_secondary_wallet_id;

      delete from public.wallet_accounts where id = v_secondary_wallet_id;
    end if;
  end if;

  -- Any leftover wallet rows still keyed only by user_id
  update public.wallet_transactions
  set user_id = p_primary_user_id
  where user_id = p_secondary_user_id;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'wallet_credit_lots'
  ) then
    update public.wallet_credit_lots
    set user_id = p_primary_user_id
    where user_id = p_secondary_user_id;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'wallet_topup_requests'
  ) then
    update public.wallet_topup_requests
    set user_id = p_primary_user_id
    where user_id = p_secondary_user_id;
  end if;

  -- ── Profile: keep primary identity; fill blanks from secondary ──
  update public.users as primary_u
  set
    full_name = coalesce(nullif(trim(primary_u.full_name), ''), secondary_u.full_name),
    phone = coalesce(nullif(trim(primary_u.phone), ''), secondary_u.phone),
    avatar_url = coalesce(primary_u.avatar_url, secondary_u.avatar_url),
    updated_at = now()
  from public.users as secondary_u
  where primary_u.id = p_primary_user_id
    and secondary_u.id = p_secondary_user_id;

  -- Free unique phone / email on secondary before auth delete
  update public.users
  set
    phone = null,
    email = email || '.merged.' || replace(id::text, '-', ''),
    updated_at = now()
  where id = p_secondary_user_id;

  return jsonb_build_object(
    'primary_user_id', p_primary_user_id,
    'secondary_user_id', p_secondary_user_id,
    'merged', true
  );
end;
$$;

revoke all on function public.merge_accounts(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_accounts(uuid, uuid) to service_role;
