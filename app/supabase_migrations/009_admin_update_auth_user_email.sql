-- 009_admin_update_auth_user_email.sql
-- Fallback para sincronizar o e-mail do aluno no Supabase Auth quando a Admin API
-- retornar erros genéricos como "Database error loading user".
-- Aplique no SQL Editor do Supabase uma única vez.

create or replace function public.admin_update_auth_user_email(
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
  v_exists uuid;
begin
  if p_user_id is null then
    raise exception 'ID do usuário é obrigatório.';
  end if;

  if v_email is null or v_email = '' or v_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'E-mail inválido.';
  end if;

  select id
    into v_exists
    from auth.users
   where lower(email) = v_email
     and id <> p_user_id
   limit 1;

  if v_exists is not null then
    raise exception 'Este e-mail já está em uso por outro usuário no Supabase Auth.';
  end if;

  update auth.users
     set email = v_email,
         encrypted_password = encrypted_password,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         confirmation_token = '',
         recovery_token = '',
         email_change = '',
         email_change_token_new = '',
         updated_at = now()
   where id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado no Supabase Auth para o ID informado: %', p_user_id;
  end if;

  update auth.identities
     set identity_data = jsonb_set(
           jsonb_set(coalesce(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email), true),
           '{email_verified}',
           'true'::jsonb,
           true
         ),
         updated_at = now()
   where user_id = p_user_id
     and provider = 'email';
end;
$$;

grant execute on function public.admin_update_auth_user_email(uuid, text) to service_role;
