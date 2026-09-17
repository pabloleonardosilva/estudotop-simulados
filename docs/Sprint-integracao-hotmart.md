# Sprint Integração Hotmart — Reconciliação com a main

Este documento registra apenas o que foi efetivamente reconciliado com a `main` até o momento. A especificação funcional completa e o histórico de implementação da integração Hotmart vivem na branch `hotmart-homologacao` (`docs/Sprint-integracao-hotmart.md` dessa branch) e não foram copiados aqui — este arquivo cresce à medida que cada fase de reconciliação avança, documentando o estado real do código na `main`, nunca um histórico importado às cegas.

## 16/09/2026 — Fase 5A: core comercial (mesclagem semântica de `b682ec1`)

### Escopo integrado

Commit fundador da integração Hotmart (`b682ec1`, "feat: integra Hotmart V1") mesclado semanticamente sobre a arquitetura atual da `main` — nunca um `git cherry-pick` bruto (o commit original mistura 42 arquivos entre exclusivos Hotmart, compartilhados, migrations e docs). Duas correções imediatas dos commits seguintes foram incorporadas por serem indispensáveis à correção do próprio core:

- `b51b0de` ("fix: corrige eventos Hotmart em homologacao") — completo: adiciona controle de concorrência/idempotência no processamento de webhook (`claimHotmartCommercialProcessing`/`waitForHotmartCommercialProcessing`, evita duas execuções simultâneas processarem a mesma transação), tratamento de erro com `try/catch` (marca `processing_error` em vez de falhar silenciosamente) e o evento `PURCHASE_PROTEST` (disputa/contestação, registra `refund_reconciliation_required` sem conceder nem revogar acesso automaticamente).
- `e254e37` ("feat: valida datas e consulta produtos Hotmart") — **parcial**: trazida somente a validação `evaluateHotmartJornadaCommercialDates` (recusa conceder acesso de Jornada quando a data de aprovação da compra é ausente, inválida ou já expiraria a matrícula no ato da concessão — grava `commercial_date_requires_review` no histórico e marca a transação como `processing_error` para revisão administrativa). O restante do commit (rota de consulta/lookup de catálogo de produtos, tela correspondente) **não foi trazido** — é catálogo avançado, fora do escopo desta subfase.

### Arquivos exclusivos Hotmart transportados (sem equivalente na main)

`app/lib/server/hotmart/{auth,config,email,history,normalize,processor,refund,types}.ts`, `app/api/webhooks/hotmart/route.ts`, `app/api/admin/hotmart/route.ts`, `app/api/admin/hotmart/mappings/[id]/route.ts`, `app/api/admin/hotmart/recover-emails/route.ts`, `app/api/admin/hotmart/transactions/[id]/actions/route.ts`, `app/api/admin/hotmart/transactions/[id]/refund/route.ts`, `app/admin/configuracoes/hotmart/page.tsx` e `page-client.tsx` (versão inicial do commit fundador + o fix de `b51b0de` — sem os filtros/dropdown customizado/lista compacta das Sprints de 14–16/09/2026 na branch Hotmart, que pertencem à cadeia de UI/catálogo tratada em fase posterior), `scripts/test-hotmart-unit.cjs`, `scripts/homologate-hotmart-internal.cjs` (teste de integração real contra Supabase configurado — não executado nesta fase).

### Migrations transportadas, não executadas

`supabase/migrations/20260828110000_create_hotmart_integration.sql` e `20260830120000_complete_hotmart_admin_workflows.sql`. Verificado por leitura direta do banco remoto (Supabase MCP, somente `SELECT`/introspecção, antes de qualquer edição de código) que todas as tabelas (`hotmart_product_mappings`, `hotmart_transactions`, `hotmart_webhook_events`, `hotmart_access_links`, `hotmart_history`), colunas (`access_status`/`access_origin`/`commercial_block_reason`/`commercial_blocked_at` em `student_jornadas` e `simulado_event_participants`) e funções (`register_hotmart_webhook_event`, `increment_hotmart_processing_attempt`, `claim_hotmart_transaction_email`, `complete_hotmart_transaction_email`, `begin_hotmart_refund_request`, `finalize_hotmart_refund_request`, `resolve_hotmart_duplicate_student_separate`, `extend_hotmart_duplicate_jornada`) já existem no banco de produção compartilhado — as migrations já foram aplicadas historicamente (fora do controle de `supabase_migrations.schema_migrations`, mesmo padrão observado em outras migrations do projeto). Nenhum conflito de nome/timestamp com migrations posteriores da main; nenhuma migration posterior da main redefine essas mesmas colunas/constraints. As migrations aqui são transportadas como artefato de repositório — **não executadas nesta fase**.

### Política comercial de attempts

Ver `docs/status-atual.md`, entrada de 16/09/2026, para o resumo completo da política aplicada (bloqueio de ações interativas, exceção do motor de conclusão automática, exceção do anti-cheat, comportamento do resultado). Resumo técnico:

- `lib/server/studentAssertions.ts` ganhou `assertAttemptCommercialAccess(studentId, attemptId, supabase)` — desenho idêntico ao commit fundador da Hotmart (nunca alterado nos 22+ commits subsequentes daquela branch). Bloqueia por `simulado_event_participants.access_status` (contexto Evento) ou `student_jornadas.status`/`expires_at` (contexto Jornada, via `student_jornada_simulados`). Standalone nunca é afetado.
- Rotas que agora chamam o guard, sempre antes de qualquer efeito colateral: `answers`, `behavior`, `owl-help`, `submit` (antes de `completeSimuladoAttempt`), `abandon` (antes do RPC `abandon_student_attempt`).
- Rotas que **nunca** chamam o guard, por decisão explícita: `lib/server/simuladoAttemptCompletion.ts`, `attempts-timeout-job/route.ts`, `scripts/reconcile-expired-attempts.ts` (finalização automática do sistema — nunca bloqueada comercialmente, sob risco de reproduzir o incidente real de tentativa eternamente `in_progress` já documentado na Sprint de timeout server-side), `focus-violation/route.ts` e o endpoint legado `[attemptId]/route.ts` (anti-cheat — a desclassificação por 3ª violação de foco precisa continuar funcionando mesmo durante o bloqueio; esta é uma correção deliberada em relação ao desenho original da Hotmart, que bloqueava essas duas rotas).
- `attempts/route.ts`: contexto Evento ganhou a checagem `participant.access_status !== "active"`, aplicada antes do branch de retomada — bloqueia criação e retomada igualmente. Contexto Jornada já tinha checagem equivalente de `status`/`expires_at` na main, preservada sem alteração.
- `resultado/route.ts`: três pontos de checagem (`?jornada=`, `?event=`, e o fallback sem parâmetro explícito quando a tentativa pertence a um Evento) retornam 403 (`JORNADA_ACCESS_BLOCKED`/`EVENT_ACCESS_BLOCKED`/`EVENT_RESULT_BLOCKED`) sem nunca apagar ou alterar `simulado_results`.
- `app/api/student/jornadas/[id]/route.ts` (detalhe): já distinguia `cancelled` (404) de `paused` (403, com mensagem própria mencionando preservação de histórico) de forma mais completa que o desenho original da Hotmart — preservado sem alteração.
- `app/api/student/simulados/route.ts`/`[id]/route.ts`, `app/api/student/events/route.ts`/`[id]/route.ts`/`[id]/heartbeat/route.ts`: passaram a considerar `access_status` na listagem/detalhe/heartbeat de Evento, mesmo padrão do commit fundador.
- `app/api/admin/jornadas/[id]/route.ts` (DELETE): passou a rejeitar (409) exclusão de Jornada com `hotmart_transactions` associadas, com mensagem orientando arquivamento — antecipa, com mensagem amigável, o que a constraint `on delete restrict` do banco já impediria de qualquer forma.

### Infraestrutura de apoio

- `lib/security/registrationTokens.ts` ganhou `deriveHotmartFirstAccessToken(transactionId, userId)` — função aditiva, todas as funções existentes da main (`hashPasswordRecoveryFingerprint` incluída) preservadas sem alteração.
- `app/components/Sidebar.tsx`: item de navegação "Hotmart" adicionado ao grupo de Configurações administrativas, sem alterar nenhum outro item.
- `.env.example`: `HOTMART_HOTTOK`, `HOTMART_CLIENT_ID`, `HOTMART_CLIENT_SECRET`, `HOTMART_BASIC_TOKEN`, `HOTMART_ENVIRONMENT` adicionados; nenhum segredo real, nenhuma variável existente removida.

### Não integrado nesta fase (fica para fases posteriores)

Catálogo avançado de produtos (lookup/consulta), redesenho da UI de Transações/filtros/dropdown customizado (Sprints de 14–16/09/2026 da branch Hotmart), qualquer commit já classificado como "mescla manual futura" (`c36f80f`, `00a0292`, `2e1858b`, `84b548f`, partes de `abd9e50`/`9946c40`) ou "não levar" (`51e0ed5`, `0acfed7`, `379d79b`, `509af77`) na auditoria prévia, e o merge `99db7aa` (não replayado). Detector de falso positivo de imagens e demais melhorias de interface da branch Hotmart permanecem exclusivamente lá, sem relação com o core comercial.

### Validação

`npx tsc --noEmit` limpo. `npm run build` limpo (Next.js 16.2.4/Turbopack). `node scripts/test-hotmart-unit.cjs` PASS. `tests/commercial-access-policy.spec.ts` (novo, 21 casos) + regressão completa (`attempt-timeout-completion`, `attempt-transactions`, `context-attempt-limits`, `annulled-question-finish`, `student-journey-access`, `dropdown-standardization`, `simulado-scoring`, `event-representative-attempt`) — 223 + 21 = 244 testes verdes, nenhuma falha, nenhum teste pulado. Lint: todos os achados são pré-existentes na `main` original (confirmados idênticos, mesma mensagem e mesma posição relativa, antes desta reconciliação) — nenhum diagnóstico novo introduzido. Nenhuma migration executada. Nenhum dado alterado no banco. Nenhum push.
