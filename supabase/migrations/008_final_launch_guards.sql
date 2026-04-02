delete from public.cancellations c
using public.cancellations newer
where c.order_id = newer.order_id
  and c.id <> newer.id
  and c.created_at < newer.created_at;

delete from public.cancellations c
using public.cancellations newer
where c.order_id = newer.order_id
  and c.id <> newer.id
  and c.created_at = newer.created_at
  and c.id < newer.id;

create unique index if not exists uq_cancellations_order_id
  on public.cancellations(order_id);

create or replace function public.replace_day_configs(
  p_subscription_id uuid,
  p_configs jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
begin
  if p_subscription_id is null then
    raise exception 'subscription id is required';
  end if;

  if jsonb_typeof(p_configs) <> 'array' then
    raise exception 'configs must be a JSON array';
  end if;

  select user_id
  into v_owner_id
  from public.subscriptions
  where id = p_subscription_id;

  if not found then
    raise exception 'subscription not found';
  end if;

  if auth.uid() is distinct from v_owner_id and not public.is_admin() then
    raise exception 'not allowed to modify this subscription';
  end if;

  delete from public.subscription_day_configs
  where subscription_id = p_subscription_id;

  insert into public.subscription_day_configs (
    subscription_id,
    day_of_week,
    bowl_slug,
    quantity
  )
  select
    p_subscription_id,
    (item->>'day_of_week')::day_of_week,
    item->>'bowl_slug',
    greatest(coalesce((item->>'quantity')::integer, 1), 1)
  from jsonb_array_elements(p_configs) as item;
end;
$$;
