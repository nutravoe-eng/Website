-- Let the admin panel hear new and updated orders as they happen (new-order popup + buzzer).
-- Realtime still applies row-level security, so admins receive every order and customers
-- can only ever receive their own (via the existing "orders: select own" policy).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
