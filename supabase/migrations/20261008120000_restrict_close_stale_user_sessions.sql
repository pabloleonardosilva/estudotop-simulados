-- close_stale_user_sessions é SECURITY DEFINER e, sem GRANT explícito em
-- 20260702150000, herdou EXECUTE de PUBLIC, anon e authenticated: qualquer
-- chamada não autenticada a /rpc podia encerrar as sessões ativas. Nenhum
-- código da aplicação, cron ou função a utiliza; mantém-se apenas service_role
-- (e o dono). Nenhum dado, política RLS ou outra função é alterado.
begin;

revoke execute on function public.close_stale_user_sessions(integer) from public, anon, authenticated;
grant execute on function public.close_stale_user_sessions(integer) to service_role;

commit;
