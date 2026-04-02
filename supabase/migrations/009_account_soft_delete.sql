alter table public.users
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz;

create index if not exists idx_users_is_deleted on public.users(is_deleted);

create or replace function public.soft_delete_account(
  p_user_id uuid,
  p_email text,
  p_full_name text default null,
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  if auth.uid() is distinct from p_user_id and not public.is_admin() then
    raise exception 'not allowed to delete this account';
  end if;

  insert into public.churned_users (
    original_user_id,
    email,
    phone,
    full_name
  )
  select
    p_user_id::text,
    p_email,
    p_phone,
    p_full_name
  where not exists (
    select 1
    from public.churned_users
    where original_user_id = p_user_id::text
  );

  update public.subscriptions
  set status = 'cancelled',
      end_date = coalesce(end_date, current_date),
      updated_at = now()
  where user_id = p_user_id
    and status in ('active', 'paused');

  update public.users
  set is_deleted = true,
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = p_user_id;
end;
$$;
