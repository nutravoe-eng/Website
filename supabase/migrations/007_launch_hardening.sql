create table if not exists public.api_rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz default now() not null
);

create trigger trg_api_rate_limits_updated_at
  before update on public.api_rate_limits
  for each row execute procedure public.set_updated_at();

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  retry_after_seconds integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.api_rate_limits%rowtype;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'rate limit key is required';
  end if;

  insert into public.api_rate_limits (key, window_started_at, request_count)
  values (p_key, v_now, 1)
  on conflict (key) do nothing;

  select *
  into v_row
  from public.api_rate_limits
  where key = p_key
  for update;

  if extract(epoch from (v_now - v_row.window_started_at)) >= p_window_seconds then
    update public.api_rate_limits
    set window_started_at = v_now,
        request_count = 1
    where key = p_key
    returning * into v_row;

    return query select true, 0, greatest(p_limit - 1, 0);
    return;
  end if;

  if v_row.request_count >= p_limit then
    return query
    select false,
           greatest(p_window_seconds - floor(extract(epoch from (v_now - v_row.window_started_at)))::integer, 0),
           0;
    return;
  end if;

  update public.api_rate_limits
  set request_count = request_count + 1
  where key = p_key
  returning * into v_row;

  return query
  select true,
         0,
         greatest(p_limit - v_row.request_count, 0);
end;
$$;

create or replace function public.replace_day_configs(
  p_subscription_id uuid,
  p_configs jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_typeof(p_configs) <> 'array' then
    raise exception 'configs must be a JSON array';
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
    coalesce((item->>'quantity')::integer, 1)
  from jsonb_array_elements(p_configs) as item;
end;
$$;
