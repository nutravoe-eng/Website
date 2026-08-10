-- Enforce one phone → one public.users row (canonical last-10 digits).
-- auth.users.phone is already unique in GoTrue (users_phone_key).
--
-- BEFORE applying: resolve any duplicate phones (run the audit in
-- docs/subscription-identity-audit-and-remediation.sql section A3, then
-- either merge via OTP login with merge_accounts or clear/fix phones).
-- Creating this index will FAIL if duplicates still exist — that's intentional.

-- Normalize existing phones to bare 10-digit form where possible
update public.users
set phone = right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)
where phone is not null
  and length(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)) = 10
  and phone is distinct from right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10);

-- Clear unusable / incomplete phone values so they don't block uniqueness
update public.users
set phone = null
where phone is not null
  and length(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)) <> 10;

create unique index if not exists users_phone10_unique
  on public.users (right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10))
  where phone is not null
    and length(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)) = 10;
