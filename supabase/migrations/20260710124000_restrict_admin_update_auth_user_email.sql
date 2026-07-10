-- Migration: restrict_admin_update_auth_user_email
-- Bloqueador crítico de segurança nº 1 (Sprint Segurança do Banco, 2026-07-10).
--
-- Contexto: a função public.admin_update_auth_user_email(uuid, text) é
-- SECURITY DEFINER (owner postgres, search_path = public, auth) e altera
-- auth.users/auth.identities. A migration histórica 009 concedeu EXECUTE a
-- service_role, mas nunca revogou o EXECUTE que o PostgreSQL concede por
-- padrão a PUBLIC em funções novas. ACL auditada no banco operacional:
-- {=X, postgres=X, anon=X, authenticated=X, service_role=X} — ou seja,
-- qualquer portador da anon key pode trocar o e-mail de qualquer conta
-- (account takeover).
--
-- Risco corrigido: execução da RPC via PostgREST por anon/authenticated.
-- A função não possui validação interna de administrador, portanto o
-- controle de acesso passa a ser exclusivamente por grant.
--
-- Estado final esperado dos privilégios de execução:
--   - PUBLIC: sem EXECUTE
--   - anon: sem EXECUTE
--   - authenticated: sem EXECUTE
--   - service_role: EXECUTE (uso exclusivo por rotas server-side)
--
-- A lógica interna da função não é alterada. Nenhum dado é modificado.

begin;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_update_auth_user_email'
      and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_email text'
  ) then
    revoke execute on function public.admin_update_auth_user_email(uuid, text) from public;
    revoke execute on function public.admin_update_auth_user_email(uuid, text) from anon;
    revoke execute on function public.admin_update_auth_user_email(uuid, text) from authenticated;
    grant execute on function public.admin_update_auth_user_email(uuid, text) to service_role;
  end if;
end;
$$;

commit;
