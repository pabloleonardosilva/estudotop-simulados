begin;

alter table public.admin_audit_logs enable row level security;
alter table public.security_event_logs enable row level security;
alter table public.system_error_logs enable row level security;
alter table public.student_activity_log enable row level security;

revoke all on table public.admin_audit_logs from anon, authenticated;
revoke all on table public.security_event_logs from anon, authenticated;
revoke all on table public.system_error_logs from anon, authenticated;
revoke all on table public.student_activity_log from anon, authenticated;

commit;
