# Sprint Integração Hotmart — reconciliação na branch técnica

## 17/09/2026 — Estado reconciliado após as Fases 5A e 5B

Implementado em `reconcile/main-hotmart`, sobre a arquitetura atual da main. Este registro substitui o escopo parcial da Fase 5A: catálogo, UI, first access e detector já foram reconciliados. A branch técnica não foi mergeada na main, não foi pushada como branch oficial e não foi deployada. As referências remotas de backup são apenas âncoras de preservação.

### Core e acesso comercial

- `app/api/webhooks/hotmart/route.ts` recebe e valida o webhook. Os módulos em `app/lib/server/hotmart/` normalizam eventos, registram histórico e processam transações com idempotência, claim e lease de processamento.
- Mappings associam produtos a Jornada ou Evento por decisão explícita do Admin. O processor concede ou bloqueia acesso conforme o evento comercial, preservando transações, vínculos e histórico. Duplicidades e situações que exigem revisão permanecem visíveis para tratamento administrativo.
- First access usa o fluxo próprio de ativação e `deriveHotmartFirstAccessToken` em `lib/security/registrationTokens.ts`; o recovery convencional continua separado. A regressão específica está em `tests/password-recovery/password-recovery.spec.ts`.
- Refund mantém requisição e reconciliação próprias, controle de concorrência e histórico; `PURCHASE_PROTEST` sinaliza revisão de estorno sem conceder ou revogar acesso automaticamente.
- A exclusão de Jornada com transações Hotmart é rejeitada com orientação para arquivamento.

### Política de tentativas e resultados

`assertAttemptCommercialAccess`, em `lib/server/studentAssertions.ts`, bloqueia ações interativas (`answers`, `behavior`, `owl-help`, `submit` manual e `abandon`) quando o contexto comercial está bloqueado. Criação e retomada também verificam o acesso ao contexto.

A conclusão automática em `lib/server/simuladoAttemptCompletion.ts`, o job de timeout e `scripts/reconcile-expired-attempts.ts` continuam funcionando durante bloqueio comercial. O anti-cheat também continua podendo desclassificar: as rotas de violação de foco e o endpoint legado da tentativa não recebem o guard comercial. Essa decisão evita deixar tentativas eternamente em andamento e diverge deliberadamente do desenho original Hotmart.

Histórico e resultados não são apagados. A visualização do resultado fica oculta durante o bloqueio e volta após a reativação, respeitando as demais condições de acesso e liberação de resultados. O histórico avulso permanece preservado; isso não autoriza novos inícios avulsos.

### Datas e UCODE

- `evaluateHotmartJornadaCommercialDates`, em `processor.ts`, valida as datas comerciais antes de analisar compra duplicada. Data ausente, inválida ou que já produziria matrícula expirada exige revisão administrativa.
- UCODE aceita o formato hexadecimal 8-4-4-4-12, com trim e lowercase. A resolução do mapping é case-insensitive, inclusive para valores históricos em caixa diferente.

### Catálogos e configuração

- Sandbox: `products.ts`, `/api/admin/hotmart/products` e `/products/lookup`.
- Produção read-only: `productionCatalog.ts`, `/api/admin/hotmart/products/production` e `/production/lookup`.
- O lookup usa origem explícita; consultar um produto nunca cria mapping automaticamente. O Admin precisa confirmar o vínculo.
- `.env.example` documenta, sem valores, `HOTMART_PRODUCTION_CLIENT_ID`, `HOTMART_PRODUCTION_CLIENT_SECRET` e `HOTMART_PRODUCTION_BASIC_TOKEN`.
- Essas três credenciais servem exclusivamente ao catálogo Produção read-only. Não são usadas pelo webhook, processor ou refund; não alteram `HOTMART_ENVIRONMENT` nem promovem globalmente Sandbox/Preview para Produção.
- O diagnóstico OAuth de apoio não substitui homologação integrada e não deve expor credenciais.

### Interface administrativa

`app/admin/configuracoes/hotmart/page-client.tsx` usa `adminFetch`, lista compacta de transações, detalhes em modal, filtros e catálogo Sandbox/Produção. O componente local `HotmartDropdown` e o popover de data renderizam seus painéis por portal, acompanhando posição, scroll e resize. Ações de mapping e reprocessamento continuam explícitas e autenticadas.

O portal de Tópicos pertence a `EvaluatedTopicsInput`, não à UI Hotmart. Foi preservada a implementação mais recente da main, incluindo posicionamento adaptativo. A preparação automática para a fila (`onAutoPrepareForQueue`) também foi preservada.

### Auditoria de fechamento do delta

Foram revisados **22 commits exclusivos Hotmart, incluindo um merge**, no intervalo `20af0a5..2e1858b`, e **44 entradas dirty/untracked** da worktree Sistema, somente em leitura. Classificação das entradas: 5 já integradas (A), 28 versões antigas/superadas (B), 6 em quarentena G5, incluindo seu bloco documental em Sprint-resultados (C), e 5 documentos/hunks históricos absorvidos ou reconstruídos (E). Nenhum item D (funcionalidade legítima ausente) ou F (desconhecido) identificado nesse inventário.

G5 permanece QUARENTENADO / NÃO LEVAR: helper alternativo de recálculo, script de recuperação, migration alternativa, rotas alternativas e sua documentação. Quando o mesmo caminho existe na main, a quarentena se refere ao conteúdo alternativo de Sistema; a implementação vigente da main foi preservada.

O detector contextual de imagens foi integrado em `19b2eb1`; funcionamento, ocorrências individuais, rejeição/restauração e limites do teste HTML estão registrados no índice funcional. Não foram importados textos históricos como prova de disponibilidade em produção.

### Validação, limites e pendências

Validação local da Fase 5B.6: `node scripts/test-hotmart-unit.cjs` PASS; `node scripts/test-image-detector-unit.cjs` PASS, incluindo round-trip DOM/HTML sem banco; `tests/dropdown-standardization.spec.ts` 9/9 PASS com configuração temporária sem servidor; `npx tsc --noEmit` PASS; `npm run build` PASS; `git diff --check` PASS. Esses testes não equivalem a homologação autenticada ou à suíte final.

A Fase 5B.6 altera somente este documento, o índice, o status e `.env.example`. Nenhum código TS/TSX, teste, migration, asset ou dependência foi alterado nesta fase. Migrations não foram executadas nesta reconciliação; banco e Vercel não foram alterados.

A decisão humana de lint exige **nenhum diagnóstico novo**. Permanecem os dois erros preexistentes `react-hooks/set-state-in-effect` em QuestionEditor e o aviso de `compact` não utilizado em RichTextEditor, iguais aos anteriores à Fase 5B.5; sua correção está fora do escopo.

**As 20 falhas 401 já registradas continuam impeditivas do MERGE FINAL.** Não estão atribuídas à UI Hotmart; exigem auditoria específica de causa e suíte final antes de qualquer integração à main. Não foram corrigidas nem investigadas nesta fase. Fechamento funcional do delta não equivale a aprovação de merge ou deploy.

Referência histórica: o core foi reconciliado em `47c4927`/`c17625d`, com documentação inicial em `8b03a96`; as fases seguintes incorporaram autenticação, datas, catálogos, UCODE, UI, proteção de first access e detector. A leitura de schema relatada na Fase 5A pertence àquela auditoria anterior; esta fase não fez nova consulta nem escrita no banco.
