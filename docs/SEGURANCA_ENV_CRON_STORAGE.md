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

## Cron de status do Evento (2026-09-04)

- Endpoint: `GET /api/admin/events/status-job`. Mesma autenticação (`verifyCronSecret`) do job acima.
- Plano Vercel atual: **Hobby** — cron só roda 1x/dia por job, e o projeto já usa os 2 slots disponíveis (release-job às 07:00 UTC, este job às 08:00 UTC). Não há slot livre para um terceiro cron sem upgrade de plano.
- Responsabilidades do job, todas idempotentes (nunca sobrescrevem uma ação manual já aplicada):
  1. Auto-início: `simulado_events` com `status='scheduled'`, Simulado vinculado e `starts_at <= now < ends_at` viram `status='active'` (`started_at` só é setado se ainda `null`).
  2. Auto-encerramento: qualquer Evento não `closed`/`archived` com `ends_at <= now` vira `status='closed'` (`closed_at` só é setado se ainda `null`).
- A imposição de acesso real (quem pode entrar em um Evento, iniciar tentativa etc.) **nunca depende deste job** — já é garantida em tempo real por `effectiveEventStatus()` em cada rota crítica, mesmo que o cron atrase ou nunca rode.
- **Este job não envia e-mail.** Lembrete de Evento é exclusivamente manual (decisão de produto de 2026-09-04, sem nenhum agendamento automático) — ver "Enviar lembrete agora" em `docs/Sprint-evento-de-simulado.md`. Uma versão anterior desta Sprint havia colocado o disparo de lembrete dentro deste mesmo job (para caber nos 2 slots do plano Hobby); esse trecho foi removido antes de qualquer publicação.

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
