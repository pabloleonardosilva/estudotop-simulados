begin;

create unique index if not exists students_email_normalized_unique
  on public.students (lower(btrim(email)));

create unique index if not exists students_cpf_normalized_unique
  on public.students (regexp_replace(cpf, '[^0-9]', '', 'g'))
  where cpf is not null and btrim(cpf) <> '';

do $$
begin
  if to_regclass('public.student_registration_confirmations') is not null then
    execute 'create index if not exists student_registration_confirmations_email_normalized_idx
      on public.student_registration_confirmations (lower(btrim(email)))';
    execute 'create index if not exists student_registration_confirmations_user_id_idx
      on public.student_registration_confirmations (user_id) where user_id is not null';
  end if;
end;
$$;

create or replace view public.student_account_integrity_admin
with (security_invoker = true)
as
select
  coalesce(au.id, p.id, s.id, c.user_id) as user_id,
  lower(btrim(coalesce(au.email, s.email, c.email))) as email,
  coalesce(s.name, p.full_name, c.full_name) as full_name,
  s.cpf,
  s.phone,
  (au.id is not null) as has_auth,
  (p.id is not null) as has_profile,
  p.role,
  (s.id is not null) as has_student,
  (c.id is not null) as has_confirmation,
  case
    when p.role = 'admin' then 'ADMIN'
    when s.id is not null and au.id is null then 'STUDENT_WITHOUT_AUTH'
    when p.id is not null and p.role = 'student' and s.id is null then 'PROFILE_WITHOUT_STUDENT'
    when au.id is not null and s.id is null then 'AUTH_WITHOUT_STUDENT'
    when c.id is not null and (au.id is null or p.id is null or s.id is null) then 'CONFIRMATION_WITHOUT_ACCOUNT'
    when p.id is not null and p.role <> 'student' then 'ROLE_MISMATCH'
    when au.id is not null and s.id is not null and lower(btrim(au.email)) <> lower(btrim(s.email)) then 'EMAIL_MISMATCH'
    when au.id is not null and p.id is not null and s.id is not null and p.role = 'student' then 'COMPLETE'
    else 'REPAIR_REQUIRED'
  end as classification
from auth.users au
full join public.profiles p on p.id = au.id
full join public.students s on s.id = coalesce(au.id, p.id)
left join public.student_registration_confirmations c
  on c.user_id = coalesce(au.id, p.id, s.id)
  or (c.user_id is null and lower(btrim(c.email)) = lower(btrim(coalesce(au.email, s.email))))
where coalesce(p.role, 'student') = 'student' or p.role = 'admin';

-- Confirmações sem correspondência por UUID ou e-mail são expostas separadamente.
create or replace view public.student_registration_orphans_admin
with (security_invoker = true)
as
select c.id as confirmation_id, c.user_id, lower(btrim(c.email)) as email,
  c.full_name, c.cpf, c.phone, c.purpose, c.created_at, c.expires_at,
  'CONFIRMATION_WITHOUT_ACCOUNT'::text as classification
from public.student_registration_confirmations c
where not exists (
  select 1 from auth.users au
  where au.id = c.user_id or lower(btrim(au.email)) = lower(btrim(c.email))
)
and not exists (
  select 1 from public.students s
  where s.id = c.user_id or lower(btrim(s.email)) = lower(btrim(c.email))
);

revoke all on public.student_account_integrity_admin from anon, authenticated;
grant select on public.student_account_integrity_admin to service_role;
revoke all on public.student_registration_orphans_admin from anon, authenticated;
grant select on public.student_registration_orphans_admin to service_role;

commit;
