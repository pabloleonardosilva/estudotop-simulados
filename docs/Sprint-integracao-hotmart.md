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

## 21/09/2026 — Fechamento definitivo: produção homologada

**Fechamento posterior à Fase 5B.6 acima:** a integração chegou à main (todo o código de `app/lib/server/hotmart/`, `app/api/webhooks/hotmart/route.ts`, `app/api/admin/hotmart/` e as migrations `20260828110000_create_hotmart_integration.sql`/`20260830120000_complete_hotmart_admin_workflows.sql` está commitado em `main`) e foi homologada em produção.

Configuração de Production confirmada: webhook `https://simulados.estudotop.com.br/api/webhooks/hotmart`; `HOTMART_ENVIRONMENT=production`; `HOTMART_HOTTOK` configurado no ambiente Production (o valor nunca é registrado em documentação, relatório ou log). Autenticação do webhook validada: requisição sem `x-hotmart-hottok`/com segredo incorreto retorna HTTP 401; payload autenticado é processado normalmente.

Mapeamento real validado: `product_ucode` `57912595-ba4b-02e0-8c72-71cb71e13136` ("Marketing Digital do Zero") → `destination_type = jornada` → Jornada de Teste (`jornada_id` `3d618a08-7259-467e-8211-9cbf72b2e250`). Conta QA usada no teste final: `maura@estudotop.com.br`, ativa, sem matrícula prévia nessa Jornada, sem `hotmart_transactions` prévia, sem histórico comercial conflitante.

Transação QA final `PROD-QA-HOTMART-20260920-090141`:

- **Concessão:** webhook HTTP 200, `processing_status = processed`; 1 `hotmart_webhook_event`, 1 `hotmart_transaction`, 1 `student_jornadas` (`access_origin = hotmart`, cronograma individual criado), 3 `student_jornada_simulados`, 1 e-mail de acesso; nenhum attempt, result ou TopCoins criado; nenhuma cobrança real; nenhum cliente real afetado.
- **Idempotência:** reenvio do mesmo `external_event_id` → HTTP 200, `duplicate = true`, `delivery_count` 1→2, mesma `hotmart_transaction`, mesma matrícula, mesmos 3 `student_jornada_simulados`, nenhum segundo e-mail, nenhum efeito comercial duplicado, attempts/results/TopCoins continuam 0.
- **Reversão:** evento `PURCHASE_REFUNDED` na mesma transação → HTTP 200, `processing_status = blocked_financial`, `commercial_block_reason`/`commercial_blocked_at` corretos, histórico preservado, nenhuma duplicação, nenhum dado real removido, nenhuma cobrança real, nenhum cliente real afetado, nenhum HTTP 5xx.

**GATE FINAL HOTMART: HOMOLOGADO EM PRODUÇÃO — SIM.**

Schema: as duas migrations Hotmart versionadas já estavam estruturalmente refletidas no banco operacional durante a auditoria desta rodada; não houve necessidade de executá-las novamente e elas não foram executadas neste fechamento — permanecem como histórico versionado, com o schema operacional auditado e compatível.

Comportamento funcional descoberto durante a homologação, registrado aqui por ser factual (não opinião): uma matrícula manual pré-existente, com `access_origin` diferente de `hotmart`, pode ser atualizada pelo fluxo `grantJornada` (`app/lib/server/hotmart/processor.ts`) se a mesma pessoa for usada como compradora em uma transação Hotmart aprovada para a mesma Jornada — o fluxo converte a matrícula para `access_origin = hotmart` em vez de rejeitar. Por isso, toda homologação deve usar uma conta QA sem matrícula conflitante na Jornada de destino. Duplicidade de compra Hotmart (mesmo comprador, mesma Jornada, `access_origin` já `hotmart`) segue sua própria regra (`pending_duplicate_purchase`), não relacionada a este comportamento.

G5 continua quarentenado e não pertence à linha oficial — não reintroduzir. A linha oficial de reconciliação de anulação usa `simulado_questions.pending_reconciliation_at` (confirmado ao vivo no schema operacional, com índice), nunca `simulado_results.pending_reconciliation_at` (confirmado ausente do schema operacional). O backup externo (`D:/Projetos_Software/estudotop-reconciliation-backup-20260916/`) preserva o histórico do protótipo G5 e não foi alterado.

Este fechamento é exclusivamente funcional/documental: nenhuma migration foi executada, nenhum código foi alterado nesta rodada, nenhum commit ou push foi realizado como parte desta entrada.

## 15/10/2026 — Correção do "Salvar vínculo" e catálogo em modal

**Causa do botão sem efeito.** `createMapping` (`app/admin/configuracoes/hotmart/page-client.tsx`) enviava `verify_product_with_hotmart: true` sem informar a origem. O `POST /api/admin/hotmart` então revalidava todos os produtos com `lookupHotmartProductByUcode`, que usa `HOTMART_CLIENT_*` e `HOTMART_ENVIRONMENT`. Um produto escolhido no catálogo Produção foi localizado com `HOTMART_PRODUCTION_*`, mas era revalidado com outra credencial e podia ser rejeitado (404/503). A resposta só aparecia no banner do topo da página, fora da área visível do card. Também não havia loading nem bloqueio de duplo clique, e uma resposta não JSON lançava uma exceção sem tratamento. O resultado era um clique aparentemente silencioso.

**Correção.**

- O painel envia `product_source` (`sandbox`/`production`). A rota revalida com o catálogo da mesma origem. Produção usa `lookupHotmartProductionProductByUcode`, somente leitura e exclusivamente com `HOTMART_PRODUCTION_*`. A origem Sandbox, ou a ausência do campo, mantém o comportamento anterior.
- As mensagens de Produção são próprias. Duplicidade (409), destino inexistente (404), validação (400) e `requireAdmin` não mudaram.
- O clique valida produto e destino com mensagem explícita. O botão fica em loading ("Salvando...") e um `ref` impede um segundo POST concorrente.
- O sucesso ("Produto vinculado com sucesso.") e os erros aparecem ao lado do botão. 401 e 403 têm textos de sessão/permissão; os demais erros usam a mensagem segura da API.
- Após o sucesso, `load(true)` atualiza "Produtos vinculados" sem recarregar a página nem trocar a aba por "Carregando...". Somente produto, nome e destino são limpos; origem e tipo são preservados.

**Catálogo em modal.** "Listar produtos Sandbox" e "Listar meus produtos Hotmart" abrem `HotmartCatalogModal`, um componente local portado para `document.body`. O `PremiumModal` compartilhado não oferece Escape, backdrop, `role="dialog"` nem rolagem interna e não foi alterado.

- Títulos: "Produtos Hotmart — Sandbox" e "Meus produtos Hotmart".
- Busca local por nome, também aceitando UCODE: instantânea, sem diferenciar maiúsculas, acentos ou espaços extras, sobre a lista já carregada.
- Estado vazio: "Nenhum produto encontrado para esta busca."
- Fechamento por X, "Fechar", Escape ou clique no backdrop. O foco inicial fica na busca, o scroll do body é bloqueado e o foco anterior é restaurado.
- Altura limitada ao viewport, com lista rolável e cabeçalho/busca fixos.
- "Usar este produto" preenche UCODE, nome e origem, fecha o modal e rola até "Vincular produto". O vínculo não é salvo automaticamente.
- "Copiar UCODE" foi preservado.
- Cada modal recebe somente o estado, o loading e o erro da própria origem.

**Credenciais e ambientes.** Os valores nunca são registrados; abaixo constam só os nomes das variáveis.

| Uso | Variáveis | Observação |
| --- | --- | --- |
| Catálogo Sandbox / homologação, lookup Sandbox e OAuth do refund | `HOTMART_CLIENT_ID`, `HOTMART_CLIENT_SECRET`, `HOTMART_BASIC_TOKEN` | Base URL definida por `HOTMART_ENVIRONMENT` (`products.ts`, `config.ts`, `refund.ts`) |
| Catálogo REAL de Produção (somente leitura) e revalidação do vínculo com origem Produção | `HOTMART_PRODUCTION_CLIENT_ID`, `HOTMART_PRODUCTION_CLIENT_SECRET`, `HOTMART_PRODUCTION_BASIC_TOKEN` | Conjunto separado, usado exclusivamente por `productionCatalog.ts`, que não lê `HOTMART_CLIENT_*` nem `HOTMART_ENVIRONMENT` |
| Ambiente da integração comercial | `HOTMART_ENVIRONMENT` | O deployment oficial Production usa `production`; não substitui `HOTMART_PRODUCTION_*` |
| Autenticação do webhook recebido | `HOTMART_HOTTOK` | Valida o header `x-hotmart-hottok`; não é credencial OAuth e não consulta o catálogo |

- As credenciais `HOTMART_PRODUCTION_*` servem ao catálogo real da Hotmart na aplicação publicada. No deployment oficial da Vercel, precisam estar configuradas no ambiente **Production**.
- A aplicação online não depende de `.env.local`. O localhost não é fonte de credenciais da aplicação publicada: a Production da Vercel recebe suas próprias variáveis de ambiente. Sem essas variáveis no ambiente local, o catálogo de Produção apenas responde que a credencial não está configurada.
- O catálogo real foi isolado intencionalmente das credenciais Sandbox. Essa separação não interfere em webhook, refund ou processor comercial, que continuam com `HOTMART_HOTTOK`, `HOTMART_ENVIRONMENT` e `HOTMART_CLIENT_*`, como antes.

**Preservado.** Não houve migration. O banco ficou estruturalmente intacto. Webhook, refund, processor comercial e regras de matrícula também não foram alterados, assim como o fluxo "Vincular" a partir de uma transação.

**Validação.** `node scripts/test-hotmart-unit.cjs` PASS. A suíte executa a rota POST com `requireAdmin`/Supabase stubados e cobre:

- origem Produção sem credenciais Sandbox, e Sandbox sem `HOTMART_PRODUCTION_*`;
- 404/503 de Produção, duplicidade 409 sem chamada externa e destino inválido;
- contratos do painel, do modal e da busca.

`npx tsc --noEmit` PASS, `npm run build` PASS e ESLint dos arquivos alterados sem diagnósticos.

Implementação e testes automatizados concluídos; validação visual/funcional final em Production será realizada após o deploy deste commit.

## 15/10/2026 — Reconciliação de compradores históricos

Função permanente em cada vínculo Produto → Jornada/Evento. Ela lista as compras reais do produto, identifica quem ainda não está no destino e insere **somente** os compradores selecionados pelo Admin. Nada é inserido automaticamente: nem ao salvar o vínculo, nem ao abrir a prévia.

**API Hotmart.** A documentação oficial e a referência da Sales API foram consultadas antes da implementação.

- **Endpoint:** `GET https://developers.hotmart.com/payments/api/v1/sales/history`.
- **Produto:** filtro por `product_id` numérico (7 dígitos). O mapping guarda o UCODE; o id é resolvido em tempo de consulta pelo catálogo de produção, que devolve `ucode` e `id` (`findHotmartProductionProduct`). Nenhum dado novo é persistido.
- **Paginação:** cursor `page_info.next_page_token` → `page_token`, com `max_results=50`. Todas as páginas são percorridas, com limite defensivo de 200 páginas e erro explícito em token repetido ou no limite. Uma falha intermediária interrompe a consulta inteira, sem lista parcial.
- **Período:** `start_date` (01/01/2010) e `end_date` (agora) são sempre explícitos, em epoch ms. A janela padrão da API sem datas não foi confirmada na documentação acessível.
- **Status:** sem `transaction`, a API devolve só `APPROVED` e `COMPLETE`. Na revalidação por `transaction`, devolve qualquer status, e o servidor reaplica a regra.
- **Elegibilidade:** `APPROVED` e `COMPLETE` (compra paga com garantia já expirada, também tratada como concessão pelo processor em `PURCHASE_COMPLETE`). Todos os demais status são não elegíveis.
- **Credenciais:** exclusivamente `HOTMART_PRODUCTION_*`, via `productionCatalog.ts`. Nunca Sandbox; o `HOTMART_HOTTOK` não é usado.

**Classificação** (`app/lib/server/hotmart/buyerReconciliation.ts`):

- **Pronto para inserir:** compra elegível, comprador identificável, sem acesso no destino e sem conflito.
- **Já inserido:** a transação já tem `hotmart_access_links`, ou o aluno, identificado por e-mail ou pela transação, já tem matrícula/participação no destino, em qualquer situação. Nada é alterado.
- **Revisão necessária:**
  - transação registrada para outro produto;
  - conta associada com e-mail diferente;
  - mais de uma conta para o e-mail;
  - possível cadastro duplicado (CPF/telefone) pendente;
  - conta bloqueada;
  - compra sem e-mail;
  - transação em outra situação comercial;
  - data de aprovação ausente;
  - compra repetida do mesmo comprador (só a aprovação mais recente fica selecionável).
- **Acesso expirado:** o prazo calculado pela data original (`evaluateHotmartJornadaCommercialDates`, a mesma regra do processor) já terminou. Não é selecionável: o processor rejeita concessões expiradas, e criar histórico expirado sem conceder prazo não é suportado com segurança. Nenhum novo prazo é concedido.
- **Não elegível:** status não aprovado, ou bloqueio financeiro/estorno registrado na transação.

**Datas.** O acesso começa na data ORIGINAL de aprovação da compra, nunca na data da importação ou do mapping. A prévia mostra a compra e o "Acesso previsto" (aprovação → aprovação + duração da Jornada; em Evento, até o fim do Evento).

**Inserção e rastreabilidade.**

- O navegador envia apenas os códigos de transação selecionados, em lotes de 5 (máximo de 10 por requisição).
- `POST /api/admin/hotmart/mappings/[id]/buyers/import` (`requireAdmin`) revalida, código a código e na Hotmart, o produto (`product_id`), o status e o comprador.
- O mapping salvo é a única fonte de produto e destino; campos extras no corpo são ignorados.
- Em seguida, a venda é reclassificada com o estado atual do banco, e só "pronto" escreve:
  - transação ausente → `processHotmartEvent` (mesma regra de datas, matrícula e cronograma), sem criar `hotmart_webhook_events`; o `externalEventId` é `historical-reconciliation:<código>` e não é persistido;
  - transação já registrada sem acesso → `reprocessHotmartTransaction`, a partir do próprio registro.
- Cada item gera `hotmart_history` `historical_buyer_reconciled`, com ator admin, `source = hotmart_sales_history` e `transaction_registered_before`. Cada lote gera `historical_reconciliation_batch` com contagens, além de `admin_audit_logs` `admin.hotmart.historical_reconciliation`. Sem dados pessoais na metadata.
- **Schema atual suficiente:** sem migration, sem alteração de banco.

**Idempotência e preservação.** Repetir a mesma seleção reclassifica a venda como "Já inserido": não chama o processor e não duplica transação, matrícula, cronograma ou e-mail. Matrículas e participações existentes não são recriadas nem alteradas, inclusive `started_at`, `expires_at`, cronograma, simulados liberados, tentativas, resultados, TopCoins e `access_origin`. O pré-filtro impede que a conversão de matrícula manual do processor seja acionada por este fluxo.

**E-mail.** Não há envio em massa. Na confirmação existe a opção explícita "Enviar e-mail de acesso aos novos alunos inseridos", **desmarcada por padrão**. Ela usa `sendHotmartTransactionEmail`, idempotente por claim e chave do Resend, somente para quem foi inserido agora. Observação: as transações importadas sem envio ficam com `access_email_sent_at` nulo, e o botão administrativo existente "Recuperar e-mails pendentes" pode enviá-las se for acionado.

**Interface.**

- Cada item de "Produtos vinculados" tem o botão permanente "Ver compradores não inseridos".
- Após salvar um vínculo de origem Produção, um resumo discreto ("Verificando compradores anteriores...") mostra aprovados, já inseridos, não inseridos e em revisão, com atalho para o modal. Uma falha nesse resumo não desfaz o vínculo.
- O modal "Compradores Hotmart" tem:
  - 4 métricas, mais "Acesso expirado" quando houver;
  - busca por nome, e-mail ou transação;
  - filtros Todos / Não inseridos (padrão) / Já inseridos / Revisão necessária / Expirados, e Não elegíveis quando houver;
  - seleção individual, "Selecionar todos os elegíveis visíveis" e "Limpar seleção";
  - "Inserir N selecionados" com confirmação (produto, destino e regra da data original);
  - progresso "Processando X de N..." e um resumo final com "Ver somente pendentes", com as linhas atualizadas no lugar.
- Fecha por X, Fechar, Escape ou backdrop, exceto durante o processamento. Altura limitada ao viewport, lista com rolagem interna, cabeçalho e rodapé fixos. CPF e telefone não são exibidos.

**Rollback.** Somente código: reverter o commit. Não há migration. Acessos já inseridos permanecem registrados como concessões Hotmart comuns, rastreáveis pelo histórico.

**Validação.** `node scripts/test-hotmart-unit.cjs` PASS. Os testes cobrem:

- paginação multi-página, fim, erro intermediário, loop e limite;
- credenciais de produção e resolução do `product_id`;
- elegibilidade;
- classificação: novo, conta existente, já inserido, conflito, expirado, transação existente ou ausente, compra repetida;
- importação via processor simulado e idempotência (2 execuções);
- preservação de matrícula e progresso e e-mail opcional;
- rotas sem admin, mapping inexistente, códigos manipulados, produto diferente, destino forjado no corpo e mapping inativo;
- contratos de UI.

O transporte HTTP e o banco foram simulados; nenhuma chamada real à Hotmart. `npx tsc --noEmit` PASS, `npm run build` PASS e ESLint dos arquivos alterados sem diagnósticos.

Implementado e testado automaticamente; validação com compradores reais pendente do teste controlado em Production pelo responsável.

## 15/10/2026 — Correção da consulta de compradores (diagnóstico + robustez)

**Sintoma em Production.** O modal "Compradores Hotmart" retornava "Não foi possível consultar as vendas reais da Hotmart agora." O catálogo real continuava funcionando.

**Análise do fluxo** (modal → `GET /api/admin/hotmart/mappings/[id]/buyers` → `findHotmartProductionProduct` → OAuth de produção → `listHotmartProductionSales` → paginação → parsing):

- O `product_id` enviado é o `id` numérico devolvido pelo catálogo de produção para o UCODE do mapping, nunca o UCODE. Um id ausente geraria outra mensagem ("A Hotmart não informou o ID numérico..."). Não há validação por número fixo de dígitos.
- OAuth: o mesmo `getHotmartProductionAccessToken` do catálogo, exclusivamente com `HOTMART_PRODUCTION_*`. Nunca usa `HOTMART_CLIENT_*` nem `HOTMART_HOTTOK`.
- URL: `https://developers.hotmart.com/payments/api/v1/sales/history`. Paginação com `page_token` = `page_info.next_page_token`.
- A mensagem observada exclui 401/403, timeout, falha de paginação e produto não encontrado. Ela só ocorria quando a Sales API respondia com outro status de erro (400/404/429/5xx), com corpo vazio ou não JSON, ou com falha de rede.
- **Defeito comprovado no código:** todos esses casos viravam o mesmo erro genérico, sem registrar etapa nem status HTTP remoto. A causa remota exata não pôde ser observada: não há acesso aos logs da Vercel nem às credenciais de produção neste ambiente, e nenhuma chamada real foi feita.

**Correção.**

- Cada falha carrega etapa (`oauth`, `product_resolution`, `sales_request`, `pagination`, `parsing`), código interno, status HTTP remoto e página.
- O servidor registra `[HOTMART_SALES_DIAGNOSTIC]` com mapping id, UCODE e `product_id`, sem token, credencial ou dados de comprador.
- O Admin recebe uma mensagem sanitizada com o status remoto, por exemplo "A Hotmart recusou a consulta de vendas (HTTP 400)", sem o corpo de erro da Hotmart.
- 429 e 5xx têm uma nova tentativa antes de falhar com código próprio.
- Corpo vazio (200/204) é tratado como página sem vendas. JSON inválido ou `items` fora do formato vira `invalid_response`, e itens nulos são ignorados.
- A requisição passa a enviar `Content-Type: application/json`, como no exemplo oficial.

**Endpoint mantido.** O `/payments/api/v1/sales/history` foi conferido na documentação oficial (página de dados do portal Hotmart Developers):

- traz `buyer` (nome, e-mail, ucode) exclusivo do comprador e `purchase.approved_date`/`order_date`, necessários para a data original;
- tem `product_id` long, datas em epoch ms e paginação `page_token`/`next_page_token`;
- sem `transaction`/`transaction_status`, retorna só `APPROVED` e `COMPLETE`.

O `/sales/users` lista participantes com papel (`role`), mas não traz datas da compra, então exigiria uma segunda consulta sem ganho. Ele não foi adotado. A regra de status segue `APPROVED` e `COMPLETE` (compra aprovada com garantia encerrada), sem filtro múltiplo.

**Próximo passo.** Após o deploy, reabrir o modal. Se ainda falhar, a mensagem mostra o status HTTP da Hotmart e o log da Vercel registra a etapa exata. Hipótese a confirmar nesse caso: rejeição da janela explícita `start_date` = 01/01/2010.

**Validação.** `node scripts/test-hotmart-unit.cjs` PASS. Os novos casos cobrem:

- 401 (com renovação), 403, 400, 404, 422, 429 (com nova tentativa), 5xx com recuperação;
- corpo vazio 200/204, HTML, `items` inválido e itens nulos;
- erro de OAuth na etapa `oauth`;
- `product_id` numérico;
- log de diagnóstico sem segredo e mensagem sem erro bruto.

`npx tsc --noEmit`, `npm run build`, ESLint e `git diff --check` aprovados. Sem migration; webhook, refund, processor, regras de matrícula e a operação "Inserir selecionados" não foram alterados.

## 15/10/2026 — Instrumentação temporária do HTTP 400 da Sales API

**Fato observado em Production.** O log `[HOTMART_SALES_DIAGNOSTIC]` registrou `sales_request` / `remote_rejected` / HTTP 400 na página 0, com `product_id` 8718446. OAuth de produção e resolução UCODE → `product_id` funcionaram.

**Query enviada.** `GET /payments/api/v1/sales/history?product_id=8718446&max_results=50&start_date=1262304000000&end_date=<agora em ms>`, sem `transaction_status` e sem `page_token` na 1ª página. A comparação literal com a documentação não mostra divergência: datas em milissegundos via `Date.UTC`/`Date.now` (sem ×1000 duplicado), inteiros seguros e `end_date` > `start_date`. A causa ainda não está comprovada.

**Instrumentação.** Nenhum log inclui Authorization, token, credenciais ou dados de comprador.

**Consolidação (mesmo dia).** A primeira versão emitia `[HOTMART_SALES_REQUEST]`, `[HOTMART_SALES_400]` e `[HOTMART_SALES_PROBE]` em linhas separadas. A única linha de diagnóstico efetiva em Production, `[HOTMART_SALES_DIAGNOSTIC]` (`logHotmartSalesDiagnostic`, chamada pela rota), continuava com só 7 campos. Agora `listHotmartProductionSales` grava tudo em `HotmartProductionCatalogError.details.diagnostics`, como campos planos, e essa linha única os inclui:

- `request_*`: pathname, `max_results`, datas, `transaction_status` e presença de `page_token`/`transaction`.
- `remote_*`: `error`, `error_description`, `message` e `code` do corpo, com e-mails mascarados, além do formato do corpo.
- `probe_*`: o status de 5 sondagens GET somente leitura, rodadas após um 400 na 1ª página, com `product_id`, `+max_results`, `+start_date`, `+end_date` e `+start_date+end_date`.

No 400, a ordem é: corpo lido uma vez → sanitização → sondagens → erro com o diagnóstico completo → linha única emitida pela rota. As linhas separadas foram removidas.

O resultado da consulta não muda (continua `remote_rejected`); o navegador não recebe o corpo bruto. A correção do parâmetro causador e a remoção desta instrumentação ficam para depois do próximo teste em Production.
