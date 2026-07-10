# Segurança de ambiente, cron e storage

## Variáveis de ambiente

Públicas permitidas:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Privadas:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_IMPORT_MODEL`
- `RESEND_API_KEY`
- `CRON_SECRET`
- `REGISTRATION_TOKEN_SECRET`

Somente as variáveis públicas podem ser lidas por Client Components. Valores reais não devem ser versionados. O arquivo `.env.example` contém apenas placeholders vazios.

`REGISTRATION_TOKEN_SECRET` é obrigatório para gerar e validar códigos/tokens de cadastro. Ele não reutiliza a service role e não possui fallback fixo.

## Service role

- Implementação: `lib/server/supabaseAdmin.ts` e espelho legado em `app/lib/server/supabaseAdmin.ts`.
- Uso permitido: Route Handlers e Server Components, após o guard aplicável.
- APIs admin usam `requireAdmin(request)`; páginas admin usam `requireAdminPage()`.
- APIs student usam `getStudentFromRequest(request)` e assertions de propriedade.
- É proibido importar admin client em arquivo com `"use client"`.

## Cron de liberação

- Endpoint: `GET /api/admin/jornadas/release-job`.
- Autenticação: `Authorization: Bearer <CRON_SECRET>`.
- Segredo ausente retorna `500` sem revelar valor; segredo inválido retorna `401`.
- A atualização exige que o item ainda esteja `locked`, evitando dupla liberação concorrente.
- O envio de e-mail é aguardado antes da resposta, e `release_email_sent_at` impede reenvio normal.

## Storage

Uso encontrado: bucket `profile-avatars`.

- Público intencional: avatar é exibido diretamente no sistema.
- Tipos aceitos: JPEG, PNG e WebP.
- Limite: 5 MB, validado na API e configurado no bucket.
- SVG, GIF, executáveis e tipos desconhecidos são rejeitados.
- Caminho: `<user-id>/avatar-<timestamp>.<ext>`, derivado do JWT validado; o cliente não escolhe o caminho.
- Upload usa service role somente após `supabase.auth.getUser(token)`.

Não foram encontrados outros uploads ou usos de signed URL. Arquivos privados futuros devem usar bucket privado e `createSignedUrl` após autorização.

## Headers

Aplicados globalmente em `next.config.ts`:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN`
- `Permissions-Policy` bloqueando câmera, microfone, geolocalização e browsing topics.

`SAMEORIGIN` foi escolhido porque o sistema usa iframe interno. CSP e HSTS não foram ativados nesta sprint: CSP exige inventário/teste de editores, imagens e vídeos externos; HSTS depende da garantia operacional de HTTPS em todos os ambientes e subdomínios.
