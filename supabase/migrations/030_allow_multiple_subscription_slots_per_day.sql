-- Allow multiple subscription deliveries on the same date when the time slot differs.
-- Keep protection against exact duplicates for the same subscription + date + slot.

drop index if exists public.uq_subscription_delivery_date;

create unique index if not exists uq_subscription_delivery_date_slot
  on public.orders (subscription_id, delivery_date, coalesce(delivery_time_slot, ''))
  where subscription_id is not null
    and order_type = 'subscription';
