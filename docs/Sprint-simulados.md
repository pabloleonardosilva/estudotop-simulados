# Sprint Simulados — Documentação Técnica e Funcional

## 10/09/2026 — Encerramento compulsório por tempo esgotado

Origem: investigação forense do caso real da aluna Luciana Cabral Jacinto (Evento "3º Simulado de Processo Civil", 05/09/2026) — ela deixou a última questão (válida, nunca anulada) sem resposta; o simulado não permitia branco; o tempo da tentativa (60 min) esgotou; ela retomou várias vezes ao longo do dia, mas o servidor recusava a conclusão por existir questão em branco, e a tentativa permaneceu `in_progress` para sempre, sem `simulado_result`.

### Regra definitiva (documentação literal)

> **Finalização voluntária** (o aluno clica "Finalizar" com tempo ainda disponível): se `allow_blank_answers = false`, continua exigindo todas as questões respondíveis preenchidas — bloqueia com a mesma mensagem de sempre. **Encerramento por tempo esgotado** (`attempt.expires_at` já foi atingido, fonte: banco, nunca o relógio do navegador nem qualquer flag enviada pelo client): a exigência de "nenhuma em branco" deixa de valer — a tentativa é concluída com o estado real das respostas persistidas; questões válidas não respondidas entram no scoring como `blank` (nunca recebem resposta fictícia, nunca viram "erro" artificialmente). São dois mecanismos conceitualmente distintos que não devem ser confundidos: um é uma trava de UX/validação de intenção do aluno; o outro é o fechamento inevitável de um relógio que já zerou.

### Causa raiz

`app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts` aplicava o bloqueio de "questões em branco" incondicionalmente, sem nunca considerar se o prazo da tentativa já havia terminado. Um auto-submit disparado pelo client ao `remainingSeconds` chegar a zero (mecanismo que já existia) sempre recebia a mesma rejeição 400 que um clique manual receberia — a tentativa nunca alcançava um estado terminal sozinha.

### Correção — servidor (fonte de verdade)

`submit/route.ts` calcula `isExpired = Boolean(attempt.expires_at) && new Date(attempt.expires_at).getTime() <= Date.now()` a partir do `expires_at` já persistido no banco (comparado contra o relógio deste servidor — nunca o `body` da requisição, que nem chega a carregar uma flag de "auto-submit" confiável). O bloqueio de branco passou de `if (!allowBlank && answeredRequiredQuestions < requiredQuestionRows.length)` para `if (!allowBlank && !isExpired && answeredRequiredQuestions < requiredQuestionRows.length)`. Um client não pode se autodeclarar "expirado" antes da hora — só quando o próprio `expires_at` gravado já passou é que o bloqueio cede. Scoring (`lib/simuladoScoring.ts`), `complete_student_attempt` (migration `20260909170000`), threshold de `counts_toward_limit` (>50%) e o `total_questions` snapshot **não foram alterados** — o encerramento por timeout segue exatamente a mesma engine transacional/atômica já usada pela finalização manual.

### Correção — retomada de tentativa vencida

`app/api/student/simulados/[id]/attempts/route.ts`: ao retomar uma tentativa `in_progress` cujo `expires_at` já passou, o servidor **não** devolve mais o payload completo de questões/respostas como se fosse uma prova normalmente editável — devolve `{ ok: true, attempt, needs_timeout_completion: true }`. O cliente, ao ver essa flag, chama imediatamente o mesmo endpoint de submit (sem renderizar a interface de resposta) para encerrar compulsoriamente. `simulado_attempt_resumed_expired` é o novo valor de `action` usado no log dessa retomada (mesma coluna de texto já existente em `system_activity_logs`, nenhuma tabela/coluna nova).

### Correção — client (robustez do auto-submit)

`app/meus-simulados/[id]/page-client.tsx`: `submitAttempt` ganhou `overrides` (attemptId/timeSpentSeconds), permitindo chamá-lo sem depender do estado React `attempt` (necessário para o caminho de retomada vencida, que nunca faz `bindAttempt`). Retry controlado (`AUTO_SUBMIT_MAX_ATTEMPTS = 3`, `AUTO_SUBMIT_RETRY_DELAY_MS = 4000ms`) cobre o desalinhamento de relógio entre client/servidor perto do limite: se o auto-submit falhar, tenta de novo poucas vezes, espaçado — nunca em loop apertado, nunca mais que 3 tentativas, cancelado ao desmontar o componente. Mensagem "Tempo esgotado. Seu simulado está sendo finalizado com as respostas registradas até este momento." substitui a mensagem técnica de "questões em branco" durante esse processo (o aluno não pode mais agir). Idempotência: se o servidor responder que a tentativa já estava `completed` (ex.: um retry chegou depois de um envio anterior já ter tido sucesso), o `submit/route.ts` agora devolve o `result_id` já existente (sem criar um segundo resultado) e o client navega até ele em vez de travar numa mensagem de erro sem saída.

### Preservado sem alteração, auditado explicitamente

`save_student_attempt_answer` já rejeitava (410, "Tempo esgotado.") qualquer resposta após `expires_at` — não precisou de mudança. `lock_student_attempt` (row lock `for update`) já serializa corretamente todos os cenários de concorrência considerados (resposta simultânea ao timeout, dois auto-submits, foco/abandono concorrentes com o timeout) — auditado, sem necessidade de alteração na migration `20260909170000_atomic_attempt_transitions.sql`. `consolidateEventRepresentativeAttempt`/`releasePendingEventResults`/TopCoins/e-mails de Jornada seguem exatamente o mesmo fluxo pós-conclusão de sempre (chamados de dentro do mesmo `submit/route.ts`, agora também alcançável pelo caminho de timeout) — nenhuma duplicação de lógica, nenhum atalho criado.

### Auditoria histórica (somente leitura, sem correção retroativa)

Ver `docs/status-atual.md` para a contagem da população de `simulado_attempts` com `status='in_progress' AND expires_at < now()` no banco remoto — nenhuma dessas linhas foi alterada nesta Sprint. A tentativa `df5df158-1a61-48d0-843c-f0bc30233989` (Luciana) foi usada como controle positivo da consulta.

### Testes

`tests/attempt-timeout-completion.spec.ts` (novo) — casos 1–13 do pedido (bloqueio manual preservado, timeout completa com brancos reais, idempotência, retomada vencida não é devolvida como editável, retry controlado, race com resposta/última pergunta). Regressão: `attempt-transactions`, `simulado-scoring`, `simulado-question-annulment`, `context-attempt-limits`, `annulled-question-finish`.

---

## 10/09/2026 (continuação) — Timeout server-side: encerramento mesmo sem retorno do aluno

As correções acima resolvem timeout com a página aberta e retomada de tentativa vencida — mas exigem que o aluno volte. O inventário remoto encontrou 18 `simulado_attempts` presas em `in_progress` com `expires_at` no passado, provando o caso real: um aluno pode sair antes do tempo acabar e nunca mais voltar. Esta continuação fecha essa lacuna com um mecanismo puramente server-side.

### Extração — fonte única de conclusão

`lib/server/simuladoAttemptCompletion.ts` (novo) — `completeSimuladoAttempt()` reúne, extraído verbatim de `submit/route.ts` (comportamento idêntico, nenhuma regra nova): guard de branco (com o bypass por `isExpired` desta mesma Sprint), scoring via `lib/simuladoScoring.ts`, chamada à RPC atômica `complete_student_attempt`, idempotência (result_id existente em vez de erro sem saída), e todo o pós-processamento (`consolidateEventRepresentativeAttempt`, `releasePendingEventResults`, TopCoins, progressão/e-mail de Jornada, `student_activity_log`, `logActivity`). `submit/route.ts` virou um wrapper fino: só autentica o aluno, valida ownership (`attempt.student_id === student.id`) e contexto (`attempt.simulado_id === simuladoId`), e delega. **Nenhuma lógica de negócio duplicada** — auditado por teste estrutural (`tests/attempt-timeout-completion.spec.ts`, seção 12) que confirma `submit/route.ts` não contém mais `computeSimuladoAttemptResult(`/`supabase.rpc("complete_student_attempt"` diretamente.

`origin: "manual" | "timeout_cron"` — parâmetro novo, só para rotular a origem no log de auditoria (`metadata.completion_origin`, mesmo campo JSONB já existente em `system_activity_logs` — nenhuma coluna/tabela nova). `"timeout_cron"` grava `actorType: "system"` (sem sessão de aluno envolvida); `"manual"` cobre tanto um clique em "Finalizar" quanto o auto-submit do client com a página aberta (a requisição chega pela sessão real do aluno nos dois casos — o `SubmitPayload` nunca carregou, e continua sem carregar, uma flag de "sou automático" vinda do client).

### Job de cron — `app/api/admin/simulados/attempts-timeout-job/route.ts` (novo)

Reaproveita 100% a infraestrutura de cron já existente no projeto: `verifyCronSecret()` (`app/lib/server/cronAuth.ts`, `timingSafeEqual`, já usado por `jornadas/release-job` e `events/status-job`) e o mesmo padrão de rota (`GET`, try/catch, `logAdminAction`/`logSystemError`, resposta com contadores). **Job diário único** — Vercel Cron no plano Hobby deste projeto só permite 1x/dia por job (confirmado pelo próprio comentário de `events/status-job/route.ts`, já em produção) — registrado em `vercel.json` às 09:00 UTC (escalonado após os dois jobs existentes, 07:00 e 08:00). **Atraso máximo esperado documentado, não escondido:** até ~24h entre `expires_at` e o fechamento automático, no pior caso — sem impacto na nota, porque `save_student_attempt_answer` já rejeita (410, pelo relógio do Postgres) qualquer resposta registrada após `expires_at`, então o atraso do job nunca permite pontuação adicional, só atrasa a transição para `completed`. **Limitação operacional aceita nesta Sprint, não contornada:** essa latência é inerente ao plano Hobby da Vercel (1 execução/dia por cron); poderá ser reduzida no futuro com um plano/infra que permita execução mais frequente (ex.: a cada poucos minutos) — decisão de produto/custo fora do escopo desta entrega.

**Seleção de candidatos:** `status='in_progress' AND is_preview=false AND attempt_context IN ('event','jornada') AND expires_at IS NOT NULL AND expires_at <= now() AND expires_at >= AUTO_TIMEOUT_ACTIVATION_AT`, ordenado deterministicamente (`expires_at asc, id asc`) e limitado a `BATCH_SIZE = 50` por execução (nunca um SELECT ilimitado).

**Marco de ativação (`AUTO_TIMEOUT_ACTIVATION_AT = "2026-09-10T18:20:00.000Z"`), documentado e não escondido:** protege integralmente o backlog histórico de 18 tentativas (todas com `expires_at` estritamente anterior a este valor) — nenhuma delas, incluindo a da aluna Luciana Cabral Jacinto e as 2 outras com `representative_attempt_id`/`result_released_at` incorretos, é tocada pelo primeiro deploy deste job. Reconciliação dessas 18 permanece uma etapa separada, não autorizada nesta Sprint.

**Contextos elegíveis (`event`, `jornada`) — decisão explícita:** tentativas `standalone` já não podem mais ser criadas (`app/api/student/simulados/[id]/attempts/route.ts` rejeita esse contexto com 400) — as 7 standalone vencidas no banco são 100% legado pré-restrição. O marco de ativação já as excluiria sozinho (todas vencidas antes do marco), mas o filtro de contexto é uma segunda camada explícita e intencional, documentada por decisão e não por efeito colateral.

**Concorrência/idempotência:** preservada integralmente pela engine já existente (`lock_student_attempt`, `for update`, e `p_expected_updated_at` otimista) — auditado, não alterado. Uma tentativa que outra execução (client, retry, ou o próprio cron rodando de novo) já fechou entre a seleção e a chamada retorna 409 do RPC, tratado pelo job como `already_terminal` (estado esperado), não como falha. Falha real de uma tentativa (`try/catch` por item) nunca interrompe o restante do lote — fica elegível para a próxima execução diária, sem mecanismo de retry próprio além disso. Resposta final é só contadores (`processed`/`completed`/`already_terminal`/`failed`) — nunca nome/e-mail/CPF de aluno.

### Testes

`tests/attempt-timeout-completion.spec.ts`, seções 10–14 (novo): autenticação do cron, filtros de elegibilidade (contexto, preview, marco de ativação, `expires_at`), ordenação/lote, reaproveitamento comprovado da engine (`completeSimuladoAttempt`, nunca duplicada), concorrência/idempotência (409 → `already_terminal`), isolamento de falha por item, ausência de PII na resposta, registro em `vercel.json`. Seções 1–9 (Sprint anterior) revalidadas contra a nova localização da lógica (`lib/server/simuladoAttemptCompletion.ts`). Regressão: `attempt-transactions`, `simulado-scoring`, `simulado-question-annulment`, `context-attempt-limits`, `annulled-question-finish`, `student-journey-access`, `event-representative-attempt`.

**Nenhuma migration.** `complete_student_attempt`/`save_student_attempt_answer`/`lock_student_attempt` (migration `20260909170000`) não foram tocados — a regra de expiração já vivia lá para respostas; o job só decide QUANDO fechar a tentativa, nunca reimplementa a trava de tempo. Nenhum dado histórico alterado — as 18 tentativas seguem exatamente como estavam, incluindo a da Luciana.

---

## 10/09/2026 (continuação) — PDF de resultado do aluno corrigido para questão anulada + auditoria de estatísticas

Continuação da Sprint abaixo ("Questões anuladas não bloqueiam a finalização + selo visual corrigido"), já homologada em localhost pelo usuário quanto à finalização e ao selo. Dois pontos novos surgiram antes do fechamento:

### A. PDF de resultado do aluno — questão anulada aparecia como normal

**Renderer real identificado:** `app/lib/pdf/simulado-result-pdf.ts` (`SimuladoQuestionsPdf`, usada por `downloadSimuladoResultPdf` — PDF do aluno — e por `downloadNeutralSimuladoPdf` — caderno neutro do Professor/Admin). Existe um segundo arquivo homônimo, `lib/pdf/simulado-result-pdf.ts` (sem `app/`), que **não é importado em nenhum lugar do código** — código morto preexistente, não tocado.

**Causa raiz:** `app/meus-simulados/[id]/resultado/page-client.tsx`, ao montar o array `questions` enviado para `downloadSimuladoResultPdf`, mapeava `order_number`/`statement`/`subject`/`alternatives`/`simulado_question_id` a partir de `payload.gabarito` — mas **omitia `status`**. A tela HTML (`ResultQuestions`, no mesmo arquivo) já usava `question.status === "annulled"` corretamente há mais tempo; só o mapeamento para o PDF não propagava esse campo, então `SimuladoQuestionsPdf` nunca tinha como saber que uma questão estava anulada e a renderizava como uma questão comum — inclusive **destacando a alternativa correta como gabarito válido** (`highlightCorrect = showAnswerKey && Boolean(alternative.is_correct)`, sem checar anulação).

**Correção:**
- `resultado/page-client.tsx`: `status: question.status` adicionado ao objeto mapeado.
- `simulado-result-pdf.ts`: `PdfQuestion.status?: string | null` (opcional — quando ausente, comportamento idêntico a antes; o caderno neutro do Professor/Admin não envia este campo e não muda). `isAnnulled = question.status === "annulled"` calculado por questão. `highlightCorrect` passou a ser `showAnswerKey && !isAnnulled && Boolean(alternative.is_correct)` — anulada nunca marca gabarito, mesmo com `showAnswerKey=true`. Chip "Questão anulada" no cabeçalho do card (mesmo padrão visual dos outros chips do PDF). Selo "Questão Anulada" sobreposto ao card: `questionCard` ganhou `position: "relative"` (era só decorativo antes) e o selo (`annulledStamp`, `position: "absolute"`, `top/left/right/bottom: 0`) é o **último filho** do card, pintando por cima do conteúdo normal — mesmo princípio arquitetural do stacking fix já aplicado na tela do aluno, adaptado às primitivas do `@react-pdf/renderer` (que não tem `isolate`; a ordem de pintura + `position: relative` no pai bastam). Aviso textual curto abaixo das alternativas explicando a anulação (nunca usa a palavra "branco").
- Resposta histórica do aluno: já não era marcada no PDF para **nenhuma** questão (o parâmetro `answers`/`alternativeId` nunca foi lido pelo corpo de `SimuladoQuestionsPdf` — PDF é um "caderno comentado" com gabarito, não uma prova corrigida marcando a escolha do aluno). Logo, o requisito "não marcar resposta histórica em anulada" já estava satisfeito por construção, para todas as questões — nada a mudar aqui.
- PDF neutro do Professor/Admin (`downloadNeutralSimuladoPdf`, `showAnswerKey: false`): `status` continua não sendo enviado por esse caller (fora do escopo — o pedido é sobre o PDF de **resultado do aluno**); como o campo é opcional e `showAnswerKey` já é sempre `false` ali, o comportamento desse PDF é idêntico ao anterior.

**Teste preexistente atualizado (mudança de comportamento sancionada, não regressão):** `tests/professor-exam-pdf/professor-exam-pdf.spec.ts` fixava a fórmula antiga de `highlightCorrect` — atualizado para a nova fórmula; o teste que conta ocorrências de `alternative.is_correct` no arquivo (deve haver exatamente 1) continua passando sem alteração.

### B. Exportar TXT (Banco de Questões) — não existe em produção

Ver seção dedicada em `docs/status-atual.md` e a suíte `tests/export-txt-question-bank.spec.ts` — resumo: a implementação inteira (`app/questoes/page-client.tsx`) existe **apenas no working tree** deste worktree, nunca foi commitada em nenhum branch/momento do histórico (`git log -S/-G --all` vazio). A documentação do recurso, por outro lado, **já está commitada** em `docs/INDICE_FUNCOES_SISTEMA.md` (introduzida incidentalmente pelo commit `830d8a5`, de um recurso não relacionado). Produção nunca teve o código — não é bug de produção, é ausência de commit. Código já auditado e correto; não foi alterado (arquivo protegido nesta sessão — alteração local preexistente fora desta Sprint). Nenhum commit feito por esta tarefa.

### C. Estatísticas envolvendo questão anulada — auditadas, nenhuma alteração necessária

Auditado contra o código real (nunca por suposição): `lib/simuladoScoring.ts` (fonte canônica — `gradeSimuladoQuestion` já checa `status === "annulled"` **antes** de checar resposta em branco, retorna `classification: "annulled"`/`scoreDelta: points`, nunca cai em correct/wrong/blank por acidente), `lib/eventInsights.ts` (já exclui `question.annulled` dos cálculos pedagógicos de dificuldade), `lib/eventRanking.ts` e `app/lib/server/topcoinsSync.ts` (nenhum dos dois recalcula a partir de respostas — só consomem `display_score`/`correct_count` já consolidados em `simulado_results`, então herdam automaticamente o tratamento correto do scoring canônico, sem lógica própria de anulação), `app/api/professor/events/[id]/route.ts` (dashboard do Evento — QuestionStats/Modo Aula — já trata `relation.status === "annulled"` separadamente, zerando `correct`/`wrong` e retornando `accuracy_percent`/`error_percent` como `null` em vez de um percentual calculado sobre denominador errado). **Nenhum destes arquivos foi alterado** — todos já corretos. Cobertura em `tests/annulled-question-finish.spec.ts` (seções 9 e 10).

### Testes desta continuação

`tests/annulled-question-finish.spec.ts` (seções 7–10, PDF + scoring + Insights/Ranking/TopCoins), `tests/export-txt-question-bank.spec.ts` (novo, auditoria completa do Export TXT — implementação e Git). Dois testes preexistentes da seção 5/6 (`tests/annulled-question-finish.spec.ts`) tinham bugs de asserção pré-existentes (regex `question` sem cobrir a grafia "questões" em português; assinatura de `locked` assumida igual entre runner e preview quando na verdade divergem legitimamente) — corrigidos para refletir corretamente o código real, sem alterar código de produção.

---

## 10/09/2026 — Questões anuladas não bloqueiam a finalização + selo visual corrigido

### Regra oficial (documentação literal)

> Quando `simulados.allow_blank_answers = false`, a finalização exige que **todas as questões respondíveis (não anuladas)** estejam respondidas. Questões com `simulado_questions.status = "annulled"` (anulação contextual a este Simulado — a mesma definição já usada em `sendAnswer`, no watermark de "Questão anulada" e no scoring) são **excluídas** dessa exigência: não precisam de resposta, não entram em nenhuma lista/contagem de pendências e nunca bloqueiam "Finalizar". Elas continuam integralmente não respondíveis (o servidor já rejeitava, com 409, qualquer resposta para uma questão anulada) — não recebem resposta fictícia nem são marcadas como "respondidas".

Evitar a redação simplificada "todas as questões devem ser respondidas" — a redação correta é sempre "todas as questões respondíveis/não anuladas devem ser respondidas, quando o Simulado não permite respostas em branco".

### Causa raiz do bug de finalização

`app/meus-simulados/[id]/page-client.tsx` (cliente) e `app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts` (servidor) calculavam "questões em branco" como `total de questões do Simulado − respondidas`, usando o total **bruto** (`questions.length` / `questionRows.length`), que inclui questões anuladas. Como uma questão anulada nunca pode ser respondida (bloqueio já existente, preservado), ela inflava artificialmente a contagem de "em branco" e bloqueava a finalização mesmo com todas as questões respondíveis completas — reproduzido exatamente no cenário relatado (10 questões, 1 anulada, 9 respondidas → bloqueava indevidamente). O bug existia **nos dois lados** (cliente e servidor); corrigido nos dois, com a mesma fórmula.

### Correção — cliente (runner real e preview admin)

`app/meus-simulados/[id]/page-client.tsx` e `app/simulados/[id]/preview/page-client.tsx` (duplicado, não é componente compartilhado — corrigido identicamente nos dois para não divergir entre telas) ganharam `requiredQuestions = questions.filter(q => q.status !== "annulled")` e `answeredRequiredCount` (mesma lista, filtrando por resposta selecionada). `FinishConfirm` e o painel lateral ("Mapa da prova"/"Mapa do preview" — contadores "Respondidas"/"Faltam" e o grid de navegação numerado) passaram a usar esses valores em vez do total bruto. O grid de navegação também deixou de rotular questão anulada como "pendente" (tooltip e cor próprios, nunca contada nas métricas de pendência) — ela continua navegável (o aluno pode abrir e ver o selo "Questão anulada"), só não conta como exigência. Indicadores de progresso **gerais** (StickyHeader "questão X de Y", cabeçalho do `QuestionCard`) continuam com o total bruto — são conceito diferente (tamanho real da prova), não a exigência de finalização; não misturados.

### Correção — servidor (soberano, nunca confia no client)

`POST .../attempts/[attemptId]/submit` recalcula `requiredQuestionRows`/`answeredRequiredQuestions` a partir de `questionRows`/`answersBySQ` já carregados do banco (nunca de qualquer contagem enviada pelo client — `SubmitPayload` só carrega `time_spent_seconds`). Se uma questão foi anulada **depois** de já respondida durante a tentativa, a resposta permanece em `simulado_answers` (nunca apagada) mas a questão sai do denominador/numerador desta validação específica — exatamente a regra pedida.

**Preservado sem alteração, conforme instruído:** `total_questions`/`answered_questions` gravados em `simulado_results`/`student_activity_log` continuam usando `questionRows.length`/`answeredQuestions` (contagem bruta, sem excluir anuladas) — mesma dívida já registrada anteriormente nesta mesma Sprint ("`total_questions` não decresce caso uma questão seja anulada durante a tentativa"), não alterada nesta correção por instrução explícita. Scoring (`lib/simuladoScoring.ts`), threshold de `counts_toward_limit` (>50%) e a engine transacional (`complete_student_attempt`, `save_student_attempt_answer`, `abandon_student_attempt`, `record_student_attempt_focus`, migration `20260909170000_atomic_attempt_transitions.sql`) **não foram tocados** — nenhuma dessas funções compartilha a validação corrigida.

### Correção visual — selo "Questão Anulada" atrás do card

**Causa exata:** o `<section>` do card de questão tinha `position: relative` mas **sem** `z-index` explícito — não estabelecia um stacking context próprio. O overlay do selo (`position: absolute; inset-0`, sem `z-index`) vinha **antes**, no DOM, dos blocos de cabeçalho/enunciado/alternativas (também `position: relative`, também sem `z-index` — logo `z-index: auto` nos dois). Entre irmãos com `z-index: auto` na mesma stacking context, a ordem de pintura segue a ordem do DOM: os blocos de conteúdo, por virem depois, pintavam por cima do selo — daí ele aparecer "atrás" do card.

**Correção arquitetural (não um hack de z-index arbitrário):** o `<section>` ganhou `isolate` (Tailwind → `isolation: isolate`), fechando um stacking context próprio e autocontido para o card — sem vazar/competir com camadas globais da página (headers, modais). O overlay do selo ganhou `z-30` explícito, acima do maior z-index já existente dentro do card (o botão "eliminar alternativa", `z-20`). Nenhum `z-index` de milhares foi usado. `pointer-events-none` (já existente) foi preservado — o selo nunca intercepta clique/scroll/teclado. Aplicado identicamente em `app/meus-simulados/[id]/page-client.tsx` e `app/simulados/[id]/preview/page-client.tsx` (mesmo bug, mesma causa, duas cópias locais).

### Telas não afetadas (auditadas, sem regressão)

`/meus-simulados/[id]/resultado` (pós-envio, componente/dados diferentes — não usa `FinishConfirm` nem o watermark de anulação em progresso), Insights, PDFs (Professor/aluno) e Raio-X não compartilham `FinishConfirm`, `QuestionSidePanel`/`PreviewQuestionSidePanel` nem o watermark do `QuestionCard` do runner/preview — nenhum deles foi tocado.

### Testes

`tests/annulled-question-finish.spec.ts` — execução real da tabela de casos obrigatória (A–F + edge case "todas anuladas" + "permitir branco" preservado) sobre a fórmula replicada fielmente do código real, e auditoria estrutural dos 3 pontos corrigidos (runner, preview, servidor) + do stacking fix. `npx tsc --noEmit` e `npm run build` limpos; lint sem diagnóstico novo.

### Pendência conhecida (não desta Sprint)

`total_questions` snapshot não decresce com anulação durante a tentativa — dívida já registrada, mantida por instrução explícita desta Sprint (não é o mesmo bug: aquele é sobre o valor gravado no resultado final; este era sobre o bloqueio indevido da finalização).

---

## Regra vigente no código local — tentativas por contexto (2026-09-09)

**Migration preparada anteriormente; não executada pelo agente:** `supabase/migrations/20260909160000_move_attempt_limits_to_contexts.sql`. Esta seção substitui as descrições históricas abaixo que atribuem o limite ao Simulado, permitem novos inícios avulsos ou propõem herdar o limite antigo no backfill. A auditoria posterior abaixo atualiza o estado observado do schema remoto; não presumir que a migration continue pendente no banco.

- `jornadas.max_attempts` e `simulado_events.max_attempts`: inteiro positivo, obrigatório, default 3; editável pelo Admin. A duplicação copia o limite do contexto de origem.
- Todas as Jornadas e todos os Eventos existentes recebem 3, independentemente dos valores antigos dos Simulados. **PCMG - Informática: 3 tentativas para cada um dos 8 Simulados**, sem compartilhar um saldo de 3 entre eles.
- A migration preenche e valida ambos os contextos antes de remover `simulados.max_attempts`. O Simulado deixa de exibir ou persistir seletor de tentativas, inclusive na criação, edição, duplicação e resumo/PDF administrativo.
- `resolveAttemptLimit` em `lib/server/attemptLimit.ts` resolve o limite pelo vínculo autenticado da Jornada ou participação no Evento. Não existe fallback para o Simulado. `getContextualSimuladoAttempts` continua isolando o consumo por aluno, Simulado e contexto; consumir tentativas em um contexto não reduz o saldo de outro.
- O DTO de execução/listagem usa `attempt_limit`; os cadastros dos contextos usam `max_attempts`. Cards, regras, cronogramas e o servidor consultam o limite atual. Novos snapshots registram `attempt_limit`; snapshots históricos não são reescritos.
- Novas execuções exigem Jornada ou Evento. Histórico e resultados avulsos permanecem consultáveis; a retomada de uma tentativa existente mantém o fluxo anterior. Reduzir o limite não encerra uma tentativa em andamento nem apaga consumo histórico; aumentar o limite libera somente a diferença disponível.
- Permanecem as regras de `counts_toward_limit`, correção, resultado oficial, `representative_attempt_id`, ranking e TopCoins. Esta entrega não implementa limite individual substituto: propostas históricas de `max_attempts_override` não são fonte de autorização no fluxo atual.

**Aplicação futura:** coordenar a implantação do código com a mudança de schema, pois o código novo exige as colunas dos contextos e o código antigo pode consultar a coluna removida. Preservar backup dos valores antigos antes da aplicação: após o commit SQL, restaurar esses valores exige recuperação explícita. A transação cancela todas as suas alterações em caso de falha; não há `CASCADE`, alteração de RLS ou reclassificação de tentativas. Nenhuma migration existente foi modificada.

**Validação local:** TypeScript e build aprovados; nenhum diagnóstico adicional de lint por arquivo/regra em comparação com HEAD. Os 17 testes novos passaram. Suíte ampliada: 373 passaram e 1 falhou (`tests/event-operations/active-attempt-metric.spec.ts:219`, busca textual de `label="Realizando"` já incompatível com o painel do Professor em HEAD; painel e teste não alterados nesta entrega). `git diff --check` aprovado. A migration não foi executada, nem mesmo pelos testes. Não houve homologação visual ou integrada com o novo schema; esta depende de código e schema compatíveis. Sem commit, push ou deploy.

> Documento de referência para todos os recursos desenvolvidos na Sprint Simulados do EstudoTOP Simulados.
> Inclui: funcionamento, regras de negócio, interface, banco de dados e APIs.

---

## Sumário

1. [Módulo de Simulados (Admin)](#1-módulo-de-simulados-admin)
2. [Banco de Questões](#2-banco-de-questões)
3. [Importação de Questões por IA](#3-importação-de-questões-por-ia)
4. [Revisão de Questões](#4-revisão-de-questões)
5. [Área do Aluno](#5-área-do-aluno)
6. [Banco de Dados](#6-banco-de-dados)
7. [APIs](#7-apis)
8. [Design System](#8-design-system)

---

## 1. Módulo de Simulados (Admin)

### 1.1 O que é um Simulado

Um simulado é uma prova configurável criada pelo admin e disponibilizada para alunos. Cada simulado tem um conjunto de configurações que controlam tempo, tentativas, pontuação, feedback e navegação.

### 1.2 Estados do Simulado

| Status | Descrição |
|---|---|
| `draft` | Rascunho — não visível para alunos |
| `published` | Publicado — alunos podem acessar e realizar |
| `archived` | Arquivado — desativado, histórico preservado |

Transições permitidas: `draft → published → archived`. Não há volta de `archived` para `published`.

### 1.3 Configurações de um Simulado

#### Identificação
| Campo | Tipo | Descrição |
|---|---|---|
| `title` | string | Título exibido ao aluno |
| `description` | string? | Descrição opcional |
| `discipline_id` | uuid? | Disciplina principal associada |
| `status` | enum | draft / published / archived |

#### Tempo e Tentativas
| Campo | Tipo | Descrição |
|---|---|---|
| `time_limit_minutes` | int? | Duração em minutos. `null` = sem limite |
| `max_attempts` | int? | Máximo de tentativas. `null` = ilimitado |
| `attempt_count_threshold_percent` | int? | % de resposta para contar uma tentativa (padrão: 50%) |

#### Modelo de Pontuação
| Valor | Nome | Regra |
|---|---|---|
| `traditional` | Tradicional | Acertos somam pontos. Erros e brancos não penalizam. |
| `cebraspe` | CEBRASPE | Acerto = +1 ponto. Erro = −1 ponto. Branco = 0 ponto. |

#### Navegação (`navigation_type`)
| Valor | Comportamento |
|---|---|
| `open` | Aluno navega livremente entre questões e confirma tudo ao finalizar |
| `closed` | Aluno confirma cada resposta antes de avançar — não pode voltar |

#### Feedback e Gabarito
| Campo | Tipo | Descrição |
|---|---|---|
| `feedback_mode` | enum | `instant` = feedback por questão / `final_only` = só ao finalizar |
| `show_result_on_finish` | bool | Exibir score ao finalizar |
| `show_answer_key_on_finish` | bool | Exibir gabarito completo ao finalizar |
| `show_teacher_comment` | bool | Exibir explicação do professor ao aluno |
| `correction_video_url` | string? | URL de vídeo de correção |
| `instant_feedback_enabled` | bool | Habilita feedback imediato após resposta (usado com `feedback_mode: instant`) |

#### Embaralhamento e Brancos
| Campo | Tipo | Descrição |
|---|---|---|
| `shuffle_questions` | bool | Embaralha ordem das questões por tentativa |
| `shuffle_alternatives` | bool | Embaralha alternativas de cada questão |
| `allow_blank_answers` | bool | Permite o aluno deixar questão em branco |

#### Ajuda e Gamificação
| Campo | Tipo | Descrição |
|---|---|---|
| `owl_help_enabled` | bool? | Habilita o assistente Coruja para o aluno |
| `owl_help_limit` | int? | Limite manual positivo; nulo usa fallback legado quando a ajuda está habilitada |

#### Segurança da execução (anti-cheat, configurável por simulado — 2026-08-24)
| Campo | Tipo | Descrição |
|---|---|---|
| `anti_tab_switch_enabled` | bool | Controla detecção de ALT+TAB/troca de guia/minimização (`document.visibilitychange`). Padrão: ligado. |
| `anti_window_blur_enabled` | bool | Controla detecção de outra janela/aplicativo/janelas lado a lado (`window.blur`, tolerância de 10s). Padrão: ligado. |

### 1.4 Banco de Questões do Simulado

Cada simulado tem seu próprio conjunto de questões vinculadas via `simulado_questions`. A ordem é controlada por `order_number` e pode ser reordenada via drag-and-drop.

Cada vínculo questão-simulado tem:
- `points` — pontos que a questão vale neste simulado
- `status` — `active` (ativa) ou `annulled` (anulada sem punição)
- `annulled_at`/`annulled_by`/`annulment_reason` — preenchidos quando `status = annulled` (constraint `simulado_questions_annulled_at_check` exige `annulled_at` não nulo nesse caso)

**"Anulada sem punição" (fórmula exata, 2026-09-06):** todo participante recebe o ponto integral da questão, independentemente de ter acertado, errado ou deixado em branco — ela conta em `annulled_count`, nunca em `correct_count`/`wrong_count`/`blank_count`, e `max_score` não é reduzido. Anular/desanular é uma operação de Simulado (`simulado_questions.status`), completamente independente do status editorial da questão no Banco (`questions.status`) — ver `docs/Sprint-resultados.md`, seção "Anulação, desanulação e alteração de gabarito", para a matriz completa e o motor de reprocessamento (`lib/simuladoScoring.ts` + `lib/server/simuladoQuestionReprocessing.ts`).


### Atualização — Edição rápida do nome na listagem — 2026-07-08

Na listagem administrativa `/simulados`, os cards de simulados passam a exibir um pequeno lápis ao lado do nome do simulado. O clique no lápis abre um campo inline para edição rápida do título, sem navegar para a tela completa de edição.

Regras:

- `Enter` ou perda de foco salva automaticamente.
- `Esc` cancela a alteração.
- A ação chama `PATCH /api/admin/simulados/[id]`, alterando somente o `title` e preservando os demais campos do simulado.
- O input e o botão de lápis bloqueiam a propagação do clique/teclado para evitar abertura acidental do card.
- Não altera questões, tentativas, resultados, jornadas, status, configurações nem banco de dados estrutural.

### 1.5 Páginas do Módulo (Admin)

| Rota | Função |
|---|---|
| `/simulados` | Listagem com filtros por status, disciplina e busca por texto |
| `/simulados/novo` | Formulário de criação com todas as configurações |
| `/simulados/[id]` | Visualização completa do simulado (admin) |
| `/simulados/[id]/editar` | Edição de configurações + gerenciamento do banco de questões |
| `/simulados/[id]/preview` | Preview funcional completo como aluno (sem criar tentativa real) |


### 1.7 Duplicar simulado existente

Na listagem administrativa `/simulados`, o botão **Duplicar existente** fica ao lado de **Novo simulado**. Ele abre modal premium dark para o admin escolher o simulado base e confirmar o nome da cópia.

Regra implementada:

- A cópia é sempre criada com `status = "draft"`.
- Copia as configurações principais do simulado: disciplina, descrição, tempo, tentativas, feedback, gabarito, comentários, embaralhamento, pontuação e ajuda da coruja.
- Copia os vínculos de `simulado_questions`, preservando `question_id`, `order_number`, `points`, `status` e `is_required`.
- Não copia tentativas, respostas, resultados, execuções, histórico de alunos nem vínculos com Jornadas.
- Após duplicar, o admin é redirecionado para a edição da nova cópia.
- A API usada é `POST /api/admin/simulados/[id]/duplicate`, que aceita opcionalmente `{ "title": "Nome da cópia" }`.

### 1.6 Preview do Simulado

O preview (`/simulados/[id]/preview`) é a **página mais premium do sistema** — referência visual para o design de questões. Funciona como o simulado real mas sem persistir dados em `simulado_attempts`, `simulado_answers` ou `simulado_results`.

---

## 2. Banco de Questões

### 2.1 Estados da Questão

```
draft → pending_review → ready_to_publish → published
                                          ↘ archived
```

| Status | Descrição |
|---|---|
| `draft` | Rascunho criado mas não enviado |
| `pending_review` | Enviada para revisão humana — fila de revisão |
| `ready_to_publish` | Aprovada na revisão, aguardando publicação em lote |
| `published` | Publicada — disponível para vincular a simulados |
| `archived` | Descartada / removida de circulação |

### 2.2 Tipos de Questão

| Tipo | Alternativas | Labels |
|---|---|---|
| `multiple_choice` | 2 a 5 opções (A–E) | A, B, C, D, E |
| `true_false` | Exatamente 2 opções | Certo, Errado |

A detecção automática de `true_false` ocorre quando as alternativas extraídas forem exatamente "Certo" e "Errado", independente do que a IA retornar no campo `question_type`.

### 2.3 Campos da Questão

| Campo | Tipo | Descrição |
|---|---|---|
| `code` | string? | Código único de identificação |
| `statement` | text | Enunciado em HTML (gerado por RichTextEditor) |
| `question_type` | enum | multiple_choice / true_false |
| `status` | enum | Ver estados acima |
| `difficulty_level` | int (1–5) | 1 = Muito fácil, 5 = Muito difícil |
| `year` | int? | Ano da prova de origem |
| `exam_board_id` | uuid? | Banca examinadora |
| `subject_id` | uuid? | Assunto principal |
| `explanation_text` | text? | Explicação do professor (HTML) |
| `image_url` | string? | Imagem do enunciado |
| `source_origin` | string? | `import_ai` / `generate_ai` / `manual` |
| `question_fingerprint` | string? | Hash para detecção de duplicatas |
| `is_in_question_bank` | bool | Se está disponível para uso em simulados |
| `correct_alternative_label` | string? | Label da alternativa correta (cache) |

### 2.4 Alternativas

Cada questão tem de 2 a 5 alternativas em `question_alternatives`:

| Campo | Tipo | Descrição |
|---|---|---|
| `label` | string | A, B, C, D, E / Certo, Errado |
| `text` | text | Texto da alternativa (HTML) |
| `is_correct` | bool | Indica o gabarito |
| `order_number` | int | Posição de exibição |
| `image_url` | string? | Imagem da alternativa |

**A correção sempre usa o `id` da alternativa, nunca sua posição ou label.** Isso garante que embaralhamentos não afetam o gabarito.

### 2.5 Páginas do Banco de Questões (Admin)

| Rota | Função |
|---|---|
| `/questoes` | Banco master: listagem com filtros avançados, edição inline, ações em lote |
| `/questoes/nova` | Criação manual com RichTextEditor e seleção de assuntos |
| `/questoes/importar` | Importação em lote via texto colado + análise por IA |
| `/questoes/gerar-ia` | Geração de questões por IA (OpenAI) |
| `/questoes/revisar` | Fila de revisão: questões pending_review |
| `/questoes/duplicatas` | Detecção e resolução de pares de questões duplicadas |
| `/questoes/[id]/editar` | Edição completa de questão individual |
| `/questoes/[id]/preview` | Preview isolado da questão |

---

### 2.6 Relatório de uso da questão em simulados

Na rota `/questoes`, cada card de questão publicada deve informar em quais simulados aquela questão está vinculada atualmente.

Implementação atual:

- `app/questoes/page.tsx` carrega os vínculos por `simulado_questions` junto com os dados de `simulados`.
- `app/questoes/page-client.tsx` exibe a seção **Uso em simulados** na parte inferior do card, antes dos botões de ação.
- Cada simulado aparece como chip clicável para `/simulados/[id]`.

Regra de negócio:

- Mostrar apenas simulados com vínculo atual em `simulado_questions`.
- Se a questão foi inserida e depois removida de um simulado, ela não deve aparecer no relatório.
- A remoção atual apaga o vínculo em `simulado_questions`; por isso o relatório não precisa consultar histórico.

---

## 3. Importação de Questões por IA

### 3.1 Visão Geral do Fluxo

```
1. Admin cola texto bruto com questões
2. Sistema quebra em blocos por questão
3. OpenAI analisa cada bloco (statement, alternatives, type, board, year)
4. Verificação de duplicatas (batch + banco)
5. Admin pré-visualiza, ajusta e seleciona questões
6. Admin define: disciplina, assunto(s), banca, ano padrão
7. Admin clica "Enviar para revisão"
8. Questões são salvas com status pending_review
```

### 3.2 Análise por IA

O endpoint `/api/admin/questions/import/analyze-batch` envia cada bloco de texto para a OpenAI (modelo configurado por `OPENAI_IMPORT_MODEL`, padrão `gpt-4o-mini`) e recebe:

```json
{
  "statement": "Enunciado da questão",
  "question_type": "multiple_choice",
  "board_name": "CESPE / CEBRASPE",
  "year": 2023,
  "difficulty_level": 3,
  "explanation_text": "",
  "alternatives": [
    { "label": "A", "text": "texto", "is_correct": false },
    { "label": "B", "text": "texto", "is_correct": true }
  ]
}
```

O parser de texto (`extractQuestionParts`) também extrai alternativas diretamente do bloco bruto. O resultado final usa o **merge** das alternativas do parser (mais confiável para posição/texto) com as da IA (mais confiável para gabarito).

### 3.3 Detecção Automática de Tipo

| Condição | Resultado |
|---|---|
| IA retorna `question_type: "true_false"` | `true_false` |
| Alternativas extraídas são exatamente "Certo" e "Errado" | `true_false` (override automático) |
| Qualquer outro caso | `multiple_choice` |

### 3.4 Pré-processamento do Enunciado

O enunciado passa por `formatStatementForDisplay()` antes de ser exibido:

- **Quebras de parágrafo** inseridas antes de itens de lista romana (I-, II-, III-) e itens numerados (1., 2., 3.) quando colapsados em linha única
- **Negrito automático** em "Imagem associada" e frases similares
- **Remoção de metadados** de cabeçalho (linhas com "Ano:", "Banca:", "Cargo:") via `stripQuestionMetadataFromStatement()`
- **Limpeza de "Texto associado"** quando aparece logo após a linha de metadados

### 3.5 Detecção de Duplicatas

Dois tipos de duplicata são verificados:

#### Duplicata de lote (`batch`)
Questões idênticas ou muito similares dentro do mesmo lote importado. Detectada antes do envio para a IA.

#### Duplicata no banco (`database`)
Questão com alta similaridade a uma já existente no banco. Detectada por fingerprint + similaridade Jaccard.

| Tipo de duplicata | Comportamento |
|---|---|
| `batch` | Bloqueada automaticamente — não enviada |
| `database` | Exibida com aviso vermelho + opção "Ver comparação" |
| `possible` | Aviso de atenção + opção "Ver comparação" |

#### Regra de bloqueio no envio:
- Questões `is_duplicate: true` com `duplicate_type !== "possible"` são ignoradas no save
- Questões `possible` podem ser enviadas mesmo sendo similaridade alta

### 3.6 Configuração Obrigatória Antes de Enviar

| Campo | Obrigatoriedade |
|---|---|
| Disciplina | Obrigatória — selecionada no painel esquerdo |
| Assunto(s) | Obrigatório — mínimo 1 |
| Banca de cada questão | Obrigatória — identificada automaticamente ou selecionada manualmente |

Se qualquer um estiver faltando, o botão "Enviar para revisão" exibe um modal de erro centralizado.

### 3.7 Identificação de Banca

A banca é detectada automaticamente do texto via `extractBoardNameFromText()` que busca padrões como `Banca: CESPE`. Se não encontrada, o campo fica em branco e o admin deve selecionar manualmente via busca.

O sistema faz `findOrCreate` da banca: se o nome normalizado já existir no banco, usa o existente; se não, cria automaticamente.

---

## 4. Revisão de Questões

### 4.1 Fila de Revisão

A página `/questoes/revisar` exibe todas as questões com status `pending_review` ou `ready_to_publish`. O sistema busca em páginas de 1000 registros até obter todas (sem limite artificial).

### 4.2 Estatísticas em Tempo Real

| Contador | O que mede |
|---|---|
| Pendentes | Questões com `pending_review` na sessão atual |
| Na fila | Questões com `ready_to_publish` na sessão atual |
| Salvas | Questões salvas (sem publicar) nesta sessão |
| Publicadas | Questões publicadas nesta sessão |
| Descartadas | Questões arquivadas nesta sessão |

### 4.3 Ações por Questão

| Ação | Resultado |
|---|---|
| **Salvar** | Persiste edições + status permanece `pending_review` |
| **Adicionar à fila** | Marca para publicação em lote (local, visível na ghost bar) |
| **Confirmar fila** | Atualiza status para `ready_to_publish` via API |
| **Publicar** | Salva + atualiza status para `published` via API |
| **Descartar** | Atualiza status para `archived` via API |
| **Publicar toda a fila** | Publica em lote todas as `ready_to_publish` filtradas |

### 4.4 Filtros Disponíveis

- Status (Pendente revisão / Na fila / Todos)
- Banca
- Assunto
- Ano
- Busca por texto (enunciado, código, alternativas, nome da banca, assunto)

### 4.5 Edição na Revisão

Cada questão na fila pode ser editada inline:
- Enunciado via RichTextEditor
- Alternativas (texto + marcar gabarito)
- Explicação do professor via RichTextEditor
- Assunto(s) via SubjectMultiSelect
- Nível de dificuldade
- Ano e banca

Um rascunho local (`localStorage`) é salvo automaticamente para evitar perda de dados ao navegar.

---

## 5. Área do Aluno

### 5.1 Dashboard do Aluno

`/aluno` — resumo de desempenho geral do aluno com métricas de simulados realizados.

### 5.2 Lista de Simulados

`/meus-simulados` — exibe todos os simulados com status `published` disponíveis para o aluno. Mostra: título, progresso, tentativas realizadas vs. permitidas, resultado da última tentativa.

### 5.3 Fazendo o Simulado

`/meus-simulados/[id]` — interface de execução do simulado:

#### Inicialização
- Cria uma `simulado_attempt` com status `in_progress`
- Snapshot das configurações no momento (`settings_snapshot`)
- Timer iniciado no frontend baseado em `time_limit_minutes`
- Questões embaralhadas se `shuffle_questions = true`
- Alternativas embaralhadas por questão se `shuffle_alternatives = true`

#### Durante a Prova
- Respostas salvas em tempo real via API (`simulado_answers`)
- Timer regressivo visível quando há limite de tempo
- Violações de foco (troca de aba) registradas em `focus_violation_count`
- O enunciado usa a mesma classe `richtext-editor` do admin/preview, preservando as quebras de linha e de parágrafo já armazenadas no HTML da questão, sem alterar o conteúdo salvo.
- Anti-cheat ampliado em 2026-07-18: troca de guia/minimização permanece imediata; perda de foco para outra janela ou aplicativo usa tolerância contínua de 10 segundos. Retorno dentro do prazo cancela a ocorrência, e eventos `blur`/`visibilitychange` são deduplicados antes de chamar a mesma API de violação.
- A tolerância de `window.blur` exibe `WindowBlurCountdownOverlay`: alerta bloqueante de alto contraste, contador grande de 10 a 1 e aviso sobre a terceira ocorrência. O cálculo usa deadline absoluto para não acumular atraso; `window.focus` desmonta o alerta e cancela os timers imediatamente.
- Antes do início, o card de segurança orienta manter a janela do simulado maximizada e não exibi-la lado a lado com outra janela. A orientação não altera a tolerância nem os eventos do anti-cheat.
- **Configurável por simulado desde 2026-08-24:** os dois mecanismos deixaram de ser fixos globalmente. `anti_tab_switch_enabled` (`document.visibilitychange`) e `anti_window_blur_enabled` (`window.blur`, tolerância de 10s) são ligados/desligados individualmente pelo admin em `/simulados/novo` e `/simulados/[id]/editar`, ligados por padrão. Durante uma tentativa em andamento, a regra aplicada é a gravada em `simulado_attempts.settings_snapshot` no início daquela tentativa — nunca a configuração atual do simulado, evitando que uma alteração administrativa no meio da prova mude as regras de segurança já aceitas pelo aluno. O card de regras antes de iniciar reflete o estado real: texto completo quando os dois estão ativos, texto reduzido quando só um está ativo, e nenhuma ameaça de desclassificação por foco quando os dois estão desligados.
- **`max_attempts` reaproveitado pelo Evento (2026-08-25):** o Evento não define política própria de tentativas — os cards de `/meus-eventos` passaram a exibir a contagem real (`counts_toward_limit`) e a permitir "Refazer Simulado" quando o próprio `max_attempts` do Simulado ainda permite. A tentativa oficial do Evento continua sendo sempre a primeira (`representative_attempt_id`, nunca sobrescrito); tentativas extras usam o fluxo de tentativa já existente (`POST /api/student/simulados/[id]/attempts`), sem API nova. Ver `docs/Sprint-evento-de-simulado.md`, seção 85, para o detalhamento completo.

### Configurações individuais de anti-cheat por simulado — 2026-08-24

- **Dois campos novos em `simulados`:** `anti_tab_switch_enabled` e `anti_window_blur_enabled`, booleanos, `not null default true` — migration `supabase/migrations/20260824070000_add_simulado_anti_cheat_toggles.sql` (não executada nesta entrega).
- **Admin:** toggles "Detectar ALT+TAB / troca de guia" e "Detectar janelas lado a lado" em um bloco "Segurança da execução", dentro do card de Configurações/Comportamentos, tanto em `/simulados/novo` quanto em `/simulados/[id]/editar` (ligados por padrão; simulado antigo sem os campos também aparece ligado, via fallback `?? true`). Resumo lateral de ambas as telas e o detalhe administrativo (`/simulados/[id]`) exibem "ALT+TAB / guias" e "Janelas lado a lado" como Ativo/Inativo. Duplicação de simulado (`POST /api/admin/simulados/[id]/duplicate`) preserva os dois valores do original.
- **APIs `POST/PATCH /api/admin/simulados`:** novo helper `parseBooleanDefaultTrue` — ausência do campo no payload nunca grava `false`, sempre `true`.
- **Execução do aluno:** os dois campos são propagados por `app/meus-simulados/[id]/page.tsx`, `GET /api/student/simulados/[id]` e `POST /api/student/simulados/[id]/attempts`. Nesta última, `buildSimuladoSnapshot` passou a aceitar o `settings_snapshot` da tentativa e usar `booleanFromSnapshotOrSimulado` para os dois campos — tentativa retomada usa o valor gravado no início dela, nunca a configuração atual do simulado; tentativa nova grava o valor vigente no próprio `settings_snapshot`.
- **`app/meus-simulados/[id]/page-client.tsx`:** o efeito único de anti-fraude (troca de guia/minimização via `visibilitychange` + perda de foco via `blur` com tolerância de 10s) ganhou dois guard clauses — `if (!antiTabSwitchEnabled) return;` no handler de `visibilitychange`, `if (!antiWindowBlurEnabled) return;` no handler de `blur`. Desligado, nenhum timer/countdown é aberto e nenhuma violação é registrada por aquele mecanismo; o outro mecanismo continua funcionando normalmente se estiver ligado. A API `focus-violation` não foi alterada — continua protegida e só registra quando chamada; a decisão de chamar é do cliente.
- **Card de regras antes de iniciar:** texto e variante (`danger`/`default`) do aviso de segurança passam a refletir os dois toggles — texto completo com os dois ativos, texto reduzido quando só um está ativo, e sem ameaça de desclassificação quando os dois estão desligados.
- **Preview admin (`/simulados/[id]/preview`):** simula o mesmo aviso condicionalmente (só há simulação de `visibilitychange`; não existia simulação de `window.blur` no preview antes desta entrega, então nada foi adicionado nesse ponto). Preview nunca grava tentativa real, comportamento inalterado.
- **Resultado do aluno não alterado:** `tab_switch_count`/`focus_violation_count` continuam existindo; com um recurso desligado, os eventos correspondentes simplesmente não são registrados e os contadores ficam em 0 — os textos de "Foco excelente/aceitável/comprometido" já são inteiramente orientados por esses números, sem nenhum texto fixo presumindo anti-cheat sempre ativo.
- Submit, respostas, TopCoins, Ajuda da Coruja, caderno, tesourinha, Jornada e Evento não foram alterados.

### Header responsivo da execução — título e métricas — 2026-07-18

- O título do simulado deixou de usar `truncate`, recebeu escala menor e agora quebra naturalmente, mantendo o nome completo visível em resoluções intermediárias.
- Tempo decorrido, Tempo restante e Progresso foram compactados e permanecem em uma única faixa horizontal a partir de notebook/desktop (`nowrap`); na banda 1024–1366px usam respectivamente 132px, 132px e 190px, com gap de 10px.
- O ajuste é exclusivamente visual em `StickyHeader` e na camada `et-laptop-exam-*`; timer, progresso, respostas, anti-cheat, APIs e regras da tentativa não foram alterados.

### Coruja selecionada e relógio recolhível no Modo Foco — 2026-07-19

- O selo **Eliminada pela Coruja** agora considera diretamente a presença da alternativa em `owl_help_data`, permanecendo visível quando a alternativa eliminada já estava selecionada. Seleção, bloqueio, resposta e dados persistidos não foram modificados.
- Ao ativar **Apagar a luz**, `FocusModeTimer` mostra inicialmente um relógio premium com o ícone `AlarmClock`. O clique revela o tempo no mesmo ponto por 5 segundos; depois o timer se recolhe automaticamente.
- O conjunto usa posicionamento `absolute`, ancorado ao topo inicial da execução: acompanha a página e deixa de ficar visível quando o aluno rola, sem alterar a contagem oficial.
- O timeout é cancelado ao desmontar/sair do Modo Foco. A contagem oficial continua ativa em segundo plano e nenhuma API, migration ou regra do simulado foi alterada.
- Navegação controlada por `navigation_type`:
  - `open`: aluno vai e volta livremente
  - `closed`: confirma uma por uma, sem retorno

#### Finalização
- Aluno clica "Finalizar" → API `/submit` calcula resultado
- `simulado_results` é gravado com snapshot completo
- Status da tentativa muda para `completed`

#### Regra de Contagem de Tentativas
Uma tentativa só é contada contra o limite (`max_attempts`) quando `answered_count / total_questions > 0.5` (mais da metade respondida).

### 5.4 Resultado

A documentação detalhada da experiência de resultado do aluno foi movida para o documento exclusivo da Sprint Resultados:

```text
docs/Sprint-resultados.md
```

Este documento mantém apenas a visão funcional geral do motor de Simulados. A rota `/meus-simulados/[id]/resultado` continua exibindo resultado consolidado, gabarito conforme configuração, comentários do professor quando liberados e avaliação do simulado.

Atualização 2026-07-07: a página de resultado do aluno passou a abrir o **resultado real** do simulado, definido como a primeira tentativa concluída válida (`status = completed` e `counts_toward_limit = true`). Não usar a última tentativa nem a melhor nota como fonte da rota `/meus-simulados/[id]/resultado`.

Atualização 2026-09-06: esta é a mesma regra central adotada para o resultado oficial de Evento (`representative_attempt_id` em `simulado_event_participants`) — ver "Bug estrutural corrigido — tentativa representativa" em `docs/Sprint-evento-de-simulado.md`. Um bug fazia o Evento gravar a referência já na criação da tentativa, antes de saber se ela terminaria válida; corrigido para consolidar só quando `completed + counts_toward_limit = true` é efetivamente atingido, preservando a mesma definição de "primeira tentativa concluída válida" já usada aqui para Jornada/avulso — nenhuma regra nova, nenhuma contradição entre os dois contextos.

### 5.5 Modelos de Pontuação

#### Tradicional
```
score = Σ(pontos de cada questão acertada)
percentage = (acertos / total_questions) × 100
```

#### CEBRASPE
```
score = acertos − erros
percentage = (score / total_questions) × 100
Questão em branco = 0 pontos (não penaliza)
```

---

## 6. Banco de Dados

### 6.1 Tabelas do Módulo de Simulados

#### `simulados`
Configuração completa. Colunas principais: `id`, `title`, `status`, `scoring_model`, `navigation_type`, `time_limit_minutes`, `max_attempts`, `feedback_mode`, `shuffle_questions`, `shuffle_alternatives`, `allow_blank_answers`, `show_result_on_finish`, `show_answer_key_on_finish`, `show_teacher_comment`, `owl_help_enabled`, `owl_help_limit`, `anti_tab_switch_enabled`, `anti_window_blur_enabled`.

#### `simulado_questions`
Vínculo simulado ↔ questão. Colunas: `id`, `simulado_id`, `question_id`, `order_number`, `points`, `status` (`active|annulled`), `annulled_at`, `annulled_by`, `annulment_reason` (os três últimos existem desde a criação da tabela; passaram a ser usados a partir de 2026-09-06), `status_revision_id` (novo em 2026-09-07, `supabase/migrations/20260907140000_notification_revision_identity.sql` — UUID gerado a cada transição de status bem-sucedida, usado como identidade de revisão para a notificação do aluno não duplicar em retry mas gerar aviso novo numa transição futura distinta).

#### `simulado_attempts`
Tentativa do aluno. Colunas: `id`, `simulado_id`, `student_id`, `attempt_number`, `status` (`in_progress|completed|disqualified|expired|abandoned`), `answered_count`, `total_questions`, `progress_percent`, `started_at`, `submitted_at`, `expires_at`, `tab_switch_count`, `focus_violation_count`, `question_order` (JSONB), `settings_snapshot` (JSONB).

**Índice único parcial:** apenas uma tentativa `in_progress` por `(simulado_id, student_id)`.

#### `simulado_answers`
Resposta por questão. Colunas: `attempt_id`, `question_id`, `simulado_question_id`, `selected_alternative_id`, `is_correct`, `is_locked`, `response_time_seconds`, `changed_count`, `alternative_order`.

#### `simulado_results`
Resultado calculado. Colunas: `attempt_id`, `simulado_id`, `student_id`, `total_questions`, `answered_questions`, `correct_count`, `wrong_count`, `blank_count`, `annulled_count`, `score`, `display_score`, `max_score`, `percentage`, `display_percentage`, `scoring_model`, `time_spent_seconds`, `finished_at`, `result_snapshot` (JSONB), `had_live_rule_change`, `last_reprocessed_at`, `reprocess_reason` (os três últimos existem desde a criação da tabela; passaram a ser usados a partir de 2026-09-06, ver `docs/Sprint-resultados.md`).

`result_snapshot` preserva o gabarito e as respostas no momento da correção — edições editoriais comuns nas questões (enunciado, comentário, formatação, assunto, banca, órgão) não alteram resultados históricos. Três exceções pedagógicas propagam e reescrevem esse snapshot deliberadamente: alteração de gabarito, anulação e desanulação de questão no Simulado (ver seção "Anulação/desanulação de questão e propagação de gabarito" adiante e `docs/Sprint-resultados.md`).

#### `simulado_feedbacks`
Avaliação do aluno. Colunas: `simulado_id`, `student_id`, `attempt_id`, `rating` (1–5), `comment`.

### 6.2 Tabelas do Banco de Questões

#### `questions`
Colunas: `id`, `code`, `statement`, `status`, `question_type`, `difficulty_level`, `year`, `exam_board_id`, `subject_id`, `image_url`, `explanation_text`, `source_origin`, `question_fingerprint`, `is_in_question_bank`, `correct_alternative_label`, `review_comment`.

#### `question_alternatives`
Colunas: `id`, `question_id`, `label`, `text`, `is_correct`, `order_number`, `image_url`.

#### `question_subjects`
Relacionamento many-to-many entre questão e múltiplos assuntos.

### 6.3 Tabelas de Taxonomia

| Tabela | Colunas principais |
|---|---|
| `disciplines` | `id`, `name` |
| `subjects` | `id`, `name`, `discipline_id` |
| `exam_boards` | `id`, `name`, `is_active` |

### 6.4 Tabela de Perfis

`profiles`: `id` (= `auth.users.id`), `full_name`, `role` (`admin|student`), `is_active`, `must_change_password`.

---

## 7. APIs

### 7.1 Admin — Simulados

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin/simulados` | GET | Listar simulados com filtros |
| `/api/admin/simulados` | POST | Criar simulado |
| `/api/admin/simulados/[id]` | GET | Detalhe do simulado |
| `/api/admin/simulados/[id]` | PATCH | Atualizar configurações |
| `/api/admin/simulados/[id]` | DELETE | Excluir simulado |
| `/api/admin/simulados/[id]/duplicate` | POST | Duplicar simulado existente como rascunho |
| `/api/admin/simulados/[id]/questions` | GET | Listar questões vinculadas |
| `/api/admin/simulados/[id]/questions` | POST | Vincular questão ao simulado |
| `/api/admin/simulados/[id]/questions` | DELETE | Desvincular questão |
| `/api/admin/simulados/[id]/questions/reorder` | PATCH | Reordenar questões |

### 7.2 Admin — Questões

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin/questions` | GET | Listar questões com filtros |
| `/api/admin/questions` | POST | Criar questão manualmente |
| `/api/admin/questions` | DELETE | Excluir questões em lote |
| `/api/admin/questions/bulk` | PATCH | Atualizar status em lote |
| `/api/admin/questions/[id]` | GET, PATCH, DELETE | CRUD individual |
| `/api/admin/questions/[id]/answer` | PATCH | Atualizar gabarito |
| `/api/admin/questions/[id]/difficulty` | PATCH | Atualizar dificuldade |
| `/api/admin/questions/check-duplicate` | POST | Verificar duplicata pontual |
| `/api/admin/questions/duplicates` | GET | Listar todos os pares de duplicatas |
| `/api/admin/questions/explain` | POST | Gerar explicação por IA |
| `/api/admin/questions/generate-ai` | POST | Gerar questão por IA |
| `/api/admin/questions/import/analyze` | POST | Analisar questão única |
| `/api/admin/questions/import/analyze-batch` | POST | Analisar lote de questões |
| `/api/admin/questions/import/save` | POST | Salvar questões importadas |
| `/api/admin/questions/review-comment` | POST | Adicionar comentário de revisão |
| `/api/admin/questions/classify-difficulty` | POST | Classificar dificuldade em lote |

### 7.3 Admin — Taxonomia

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/admin/disciplines` | GET, POST | CRUD de disciplinas |
| `/api/admin/subjects` | GET, POST | CRUD de assuntos |
| `/api/admin/subjects/bulk` | POST | Importação em lote de assuntos |
| `/api/admin/exam-boards` | GET, POST | CRUD de bancas |
| `/api/admin/exam-boards/bulk` | POST | Importação em lote |
| `/api/admin/exam-boards/search` | GET | Busca de banca por nome |

### 7.4 Student — Simulados e Tentativas

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/student/simulados` | GET | Listar simulados publicados |
| `/api/student/simulados/[id]` | GET | Detalhe do simulado |
| `/api/student/simulados/[id]/attempts` | GET, POST | Listar / iniciar tentativa |
| `/api/student/simulados/[id]/attempts/[aId]/answers` | GET, POST | Consultar / registrar respostas |
| `/api/student/simulados/[id]/attempts/[aId]/submit` | POST | Finalizar tentativa |
| `/api/student/simulados/[id]/attempts/[aId]/focus-violation` | POST | Registrar violação de foco |
| `/api/student/simulados/[id]/feedback` | GET | Feedback da tentativa |
| `/api/student/simulados/[id]/resultado` | GET | Resultado consolidado |

### 7.5 Padrão de Resposta das APIs

Todas as rotas retornam:
```json
{ "ok": true, "message": "...", ...dados }
```
ou em erro:
```json
{ "ok": false, "message": "Descrição do erro" }
```

Códigos HTTP: `200` (sucesso), `201` (criado), `400` (dados inválidos), `404` (não encontrado), `500` (erro interno).

---

## 8. Design System

### 8.1 Tokens de Questão (`lib/ui/question-tokens.ts`)

Fonte de verdade para o visual de cards de questão. Usar sempre `qCard.*` ao renderizar questões:

| Token | Uso |
|---|---|
| `qCard.wrapper` | Card externo |
| `qCard.statement` | Enunciado |
| `qCard.alts.block` | Container de alternativas |
| `qCard.alts.base` | Alternativa neutra |
| `qCard.alts.selected` | Alternativa selecionada |
| `qCard.alts.correct` | Alternativa correta |
| `qCard.alts.wrong` | Alternativa errada |
| `qCard.alts.labelBase/labelSelected/labelCorrect/labelWrong` | Bolinha com letra |
| `qCard.tags.*` | Chips de metadados (primary, neutral, brand, success, warning, info, muted) |

### 8.2 Componentes de UI Obrigatórios

| Componente | Uso |
|---|---|
| `PremiumButton` | Todos os botões |
| `PremiumInput` | Todos os inputs |
| `PremiumSelect` | Todos os selects |
| `PremiumCard` | Cards de conteúdo |
| `PremiumTable` | Tabelas de dados |
| `PremiumModal` | Modais de feedback |
| `PremiumLoadingOverlay` | Estados de carregamento global |
| `PageHeader` | Cabeçalhos de página |
| `PageBackground` | Wrapper de fundo |
| `SelectionGhostBar` | Barra flutuante de ações em seleção múltipla |
| `DraftRestoreModal` | Modal de restauração de rascunho |

### 8.3 Componentes de Questão

| Componente | Uso |
|---|---|
| `RichTextEditor` | Editor de enunciado e alternativas |
| `SubjectMultiSelect` | Seleção múltipla de assuntos |
| `QuestionActionModal` | Modal de ações/confirmações |
| `ExplanationAuthorCard` | Rodapé de autoria da explicação |

---

*Documento gerado ao final da Sprint Simulados — EstudoTOP, maio de 2026.*

## Fluxo unificado “Adicionar questões” (2026-09-03)

Na edição de um simulado, a ação **Adicionar questões** abre um seletor de origem com três caminhos: criação manual, seleção do Banco de Questões e importação com IA. O seletor existente do Banco foi preservado.

A criação manual contextual aceita várias questões em sequência, permite adicionar e excluir alternativas, mantém os rascunhos durante a edição e salva cada questão como publicada no Banco antes de vinculá-la ao simulado. O importador oficial é reutilizado com o parâmetro `simulado`; nesse contexto, questões válidas são publicadas, vinculadas ao simulado e o usuário retorna à edição. Fora desse contexto, o importador mantém o fluxo normal de revisão pendente.

O tema visual pertence à superfície que renderiza a questão, nunca à origem ou à entidade. Assim, o importador e o editor manual contextual permanecem Clean Premium durante o trabalho, enquanto toda questão vinculada em `/simulados/[id]/editar` — antiga, selecionada do Banco, criada manualmente ou importada por IA — usa o mesmo card Dark Premium.
### Atualização 2026-06-08 — Envio de questão para outro simulado e índice de acertos

Na edição do simulado (`/simulados/[id]/editar`), cada questão já vinculada pode ser enviada para outro simulado sem sair da página atual. Essa ação cria o vínculo no simulado de destino e mantém a questão no simulado original.

O card de questão na edição também exibe índice de acerto agregado da questão no banco, calculado a partir de `simulado_answers` por `question_id`:

- `correct_count`: respostas corretas.
- `wrong_count`: respostas erradas.
- `total_answered_count`: total de respostas corrigidas.
- `accuracy_rate`: percentual de acerto.

Esse índice considera respostas da questão em todos os simulados onde ela foi utilizada, não apenas no simulado atualmente aberto.

---

## Atualização — Seletor de questões na edição do simulado — 2026-06-10

Na tela `/simulados/[id]/editar`, o modal **Selecionar questões** passou por ajuste operacional fino:

- Filtros podem ser recolhidos/expandidos por botão próprio, economizando espaço vertical durante a seleção.
- Os cards de questões do modal foram compactados exclusivamente nesse contexto, com menor fonte, menor espaçamento e alternativas mais enxutas, para permitir visualizar mais questões na tela.
- Cada questão disponível no seletor passou a ter a ação **Usar como modelo**, que abre o fluxo de criação manual de questão já pré-preenchido a partir da questão escolhida.
- A ação **Usar como modelo** reaproveita o mesmo mecanismo do Banco de Questões: cria uma nova questão sem alterar a original e mantém as regras editoriais de ajustar banca/ano quando o modelo for editado.
- A tela `/simulados` foi ajustada para preservar a sidebar: as camadas decorativas de fundo deixaram de usar `position: fixed` e passaram a ficar restritas ao conteúdo da página.

Regra de manutenção: a compactação visual vale apenas para o modal de seleção de questões do simulado. O Banco de Questões, Revisar Questões, Preview do Simulado e Execução do aluno não devem receber essa redução de fonte/espaçamento sem pedido explícito.

---

## Atualização — execução do aluno: navegação e controle de foco (2026-06-15)

Foram consolidadas as seguintes regras na tela `/meus-simulados/[id]`:

- Simulados de navegação aberta permitem avançar e retornar livremente, inclusive quando a questão atual estiver em branco.
- A banca organizadora deixa de ser exibida durante a resolução, reduzindo informação administrativa desnecessária na prova.
- O limite de alternâncias de aba/janela passa a ser três ocorrências.
- A primeira e a segunda ocorrências exibem avisos obrigatórios.
- Na terceira ocorrência, a tentativa é encerrada por violação de foco e conta como utilizada.
- O contador persistido em `simulado_attempts.focus_violation_count` é a fonte de verdade para evitar inconsistência após recarregamento.

Arquivos relacionados:

- `app/meus-simulados/[id]/page-client.tsx`
- `app/meus-simulados/[id]/page.tsx`
- `app/api/student/simulados/[id]/route.ts`
- `app/api/student/simulados/[id]/attempts/route.ts`
- `app/api/student/simulados/[id]/attempts/[attemptId]/focus-violation/route.ts`

## Atualização — resultado real do aluno alinhado ao Preview administrativo (2026-06-15)

Detalhes da experiência de resultado foram centralizados em `docs/Sprint-resultados.md`. As regras de visibilidade permanecem preservadas: `show_answer_key_on_finish` controla os detalhes por questão e `show_teacher_comment` controla os comentários do professor.

## Correção — tentativa vencida piscando e autoenvio repetido (2026-06-18)

Na execução real do aluno, uma tentativa `in_progress` com `expires_at` vencido era retomada em `00:00`. O cliente acionava o envio automático, mas a API recusava por haver questões em branco; em seguida, o cliente voltava para a prova e repetia o envio, causando piscadas e a faixa recorrente "Enviando suas respostas...".

Correção aplicada:
- o cliente envia `auto_submission: true` quando o tempo termina;
- o endpoint de submit permite questões em branco apenas nesse autoenvio, contabilizando-as normalmente como brancas;
- foi adicionada trava local para o autoenvio ocorrer uma única vez por tentativa;
- a regra de bloqueio de questões em branco permanece intacta na finalização manual.

## Correção — botão Printar na edição e carregamento de perfil no F5 (2026-06-20)

Na tela `/simulados/[id]/editar`, o botão **Printar** do card **Ações Rápidas** deve permanecer visualmente ativo e coerente com o tema dark premium. Ele abre diretamente o modo de captura para slide em `/simulados/[id]/print?popup=1&mode=slide&question=1`.

Padrão visual aprovado:
- fundo dark translúcido com presença laranja discreta;
- borda laranja visível;
- texto e ícone em tom claro;
- hover mais luminoso;
- nunca usar aparência de botão desabilitado quando a ação estiver disponível.

Também foi corrigido o flash da tela **“Não foi possível carregar seu perfil”** ao atualizar uma página autenticada. O evento inicial do Supabase podia encerrar o estado global de carregamento antes de `profiles` terminar de carregar. O `AuthContext` agora mantém `loading=true` até a leitura do perfil terminar, evitando que o `AppShell` renderize o estado de erro durante um único frame.

Arquivos relacionados:
- `app/simulados/[id]/editar/page-client.tsx`
- `app/contexts/AuthContext.tsx`

## Atualização — captura para slide adaptativa (2026-06-20)

O modo `/simulados/[id]/print?mode=slide` passou a adaptar automaticamente largura, tipografia e espaçamento conforme o volume real de conteúdo da questão.

- Questões pequenas usam fonte maior, mais respiro e composição vertical centralizada.
- Questões médias preservam o padrão visual já aprovado para os slides.
- Questões grandes usam largura máxima de `1652px`, equivalente a 40% acima da largura padrão de `1180px`, com espaçamento vertical reduzido e rolagem quando necessário.
- A classificação considera enunciado, alternativas, maior alternativa, quebras de linha/parágrafo e itens romanos.
- A adaptação não altera conteúdo, ordem, gabarito nem HTML estrutural; parágrafos e afirmativas permanecem preservados.

---

## Ajuste — Modo Printar com posição fixa e fonte única real — 2026-06-21

O modo **Captura para slide** foi ajustado para preservar o comportamento adaptativo criado para questões pequenas, médias e grandes sem deixar cada questão aparecer em uma altura diferente da tela.

### Regras consolidadas

- O estágio do modo slide ocupa a altura útil fixa da viewport.
- A página não deve ter rolagem global no modo slide; questões grandes rolam apenas dentro do próprio bloco da questão.
- A fonte do modo Printar é `Aptos, "Aptos Display", Arial, Helvetica, sans-serif`.
- Cada questão possui um único tamanho de fonte para enunciado e alternativas.
- Tags e estilos internos do HTML rico devem herdar fonte, tamanho, altura de linha e cor do bloco principal.
- As letras das alternativas ficam em negrito, mas não maiores.
- O modo contínuo não foi alterado.

### Escala vigente

- Questão pequena: `27px`.
- Questão média: `26px`.
- Questão grande: `24px`.

---

## Atualização 2026-06-21 — Printar: ocupação máxima por fonte

No modo `/simulados/[id]/print?mode=slide`, a captura para slide deve priorizar ocupar o máximo possível da área útil antes de o usuário colar a imagem no PowerPoint.

Regras consolidadas:

- A largura aprovada para questões pequenas/médias é preservada em `1180px`.
- Quando houver folga vertical, a questão cresce prioritariamente pelo tamanho da fonte, não pela largura.
- Enunciado e alternativas continuam usando uma fonte única dentro da mesma questão.
- A fonte oficial permanece `Aptos, "Aptos Display", Arial, Helvetica, sans-serif`.
- Estilos internos do HTML rico, inclusive `style`, são removidos/neutralizados no modo printar para evitar fonte, cor ou opacidade divergente.
- Questões pequenas usam fonte maior e centralização vertical para não ficarem perdidas no slide.
- Questões médias usam fonte maior que a versão anterior para preencher melhor a altura útil sem mexer na largura aprovada.
- Questões grandes mantêm largura expandida e compactação vertical, com rolagem interna quando necessário.

---

## Atualização 2026-06-21 — Printar: medição real substitui fontes fixas

Os valores fixos de fonte por categoria (pequena `37px`, média `31px`, grande `25px`) foram substituídos por um ajuste client-side que mede a altura real do conteúdo renderizado.

Novo componente: `app/simulados/[id]/print/PrintSlideScaler.tsx`.

Como funciona:
- A categoria (`small`/`medium`/`large`, calculada por `getSlideQuestionSize`) continua definindo apenas largura, padding e limites de fonte — não mais um valor fixo de fonte.
- Limites por categoria: pequena `26px`–`42px`, média `24px`–`60px`, grande `20px`–`30px`. Apenas o teto da categoria média mudou (de `36px` para `60px`) — era o único caso real onde a busca binária batia no teto antes de preencher a altura útil, deixando sobra de espaço vazio simétrico (centralizado) no slide. Pequena e grande já ocupavam bem a área útil e não precisaram de ajuste.
- O componente mede a altura do bloco de enunciado + imagem + alternativas e busca, por busca binária, o maior tamanho de fonte que cabe na altura útil disponível dentro do `article` da questão.
- Se nem o mínimo couber, assume o mínimo e deixa a rolagem interna already existente cobrir o excesso (sem inventar rolagem nova).
- O espaçamento entre alternativas passou a usar `em` (relativo à fonte calculada), então compacta automaticamente em questões grandes e abre mais respiro em pequenas, sem lógica extra.
- O cabeçalho de metadados (`Questão X de Y`, assunto, pontuação) ficou fora do componente de medição e sempre ancorado no topo do `article`.
- O modo "Lista contínua" não foi alterado — continua sem `PrintSlideScaler`.

**Padrão definitivo de posição (mesma data):** removida a centralização vertical que existia para pequena/média. Agora todas as categorias usam `justify-start` — o enunciado sempre começa imediatamente abaixo da tag `Questão X de Y`, sem espaço vazio acima, e o texto permanece alinhado à esquerda. Isso garante posição previsível ao navegar entre questões pequenas, médias e grandes.

**Retângulo real 16:9 (mesma data):** a largura fixa por categoria (`1180px`/`1652px`) foi removida. Novo componente `app/simulados/[id]/print/PrintSlideFrame.tsx` calcula, a partir do espaço real disponível na janela, o maior retângulo possível com proporção exata `16:9` e centraliza a questão dentro dele. O `article` passa a ser `w-full h-full` desse retângulo, em vez de uma largura fixa em pixels — então questões médias com bastante texto (como a de "Hardware" com 5 alternativas) usam toda a largura disponível em vez de deixar uma faixa em branco à direita quando coladas num slide do PowerPoint. A categoria (`small`/`medium`/`large`) continua controlando apenas padding, metadados, limites de fonte e espaçamento — não mais a largura.

## Atualização — Resultado geral do aluno (dashboard pós-simulado)

Detalhes pedagógicos, faixas de parecer, Corujas, sinais comportamentais e implementação futura da Sprint Resultados foram movidos para `docs/Sprint-resultados.md`.

## Atualização — Tag de Jornada em Meus Simulados do aluno (2026-07-06)

Na rota `/meus-simulados`, os cards dos simulados vinculados a uma Jornada passam a exibir uma tag visual discreta com o nome da Jornada, por exemplo `Jornada PCMG`. A API `/api/student/simulados` foi enriquecida com `jornada_id` e `jornada_title` a partir do vínculo do aluno com `student_jornadas`/`student_jornada_simulados`.

A alteração não muda a regra de visibilidade: a tela `Meus Simulados` continua listando apenas simulados publicados e visíveis ao aluno. O cronograma completo, inclusive simulados programados ainda não publicados, permanece na tela interna da Jornada.

---

## Atualização — Tentativas completas e incompletas no aluno (2026-07-07)

Na área do aluno, a contagem de tentativas foi explicitada para evitar ambiguidade quando uma tentativa foi iniciada, mas não gerou resultado.

### Rotas impactadas

- `/meus-simulados`
- `/minhas-jornadas/[id]`
- `/meus-simulados/[id]` (texto de instruções antes de iniciar)

### Regras consolidadas

- O contador principal continua exibindo tentativas usadas sobre o limite total: `1/3`, `2/3` etc.
- A interface agora separa as tentativas usadas em:
  - **Concluídas**: tentativas com `status = "completed"` e `counts_toward_limit = true`.
  - **Incompletas**: tentativas contabilizadas no limite (`counts_toward_limit = true`) que não estão concluídas.
- Tentativas incompletas não geram resultado para revisão, mas continuam contando como tentativa utilizada.
- Um ícone de ajuda abre modal explicativo informando que, ao iniciar o simulado, a tentativa é registrada e, mesmo que não seja concluída, **é contabilizada** dentro do limite de tentativas.
- A tela de instruções do simulado reforça a mesma regra antes de o aluno iniciar.

### Arquivos impactados

- `app/api/student/simulados/route.ts`
- `app/api/student/jornadas/[id]/route.ts`
- `app/meus-simulados/page-client.tsx`
- `app/minhas-jornadas/[id]/page-client.tsx`
- `app/meus-simulados/[id]/page-client.tsx`

Nenhuma migration foi criada ou alterada.

## Correção — Caderno de anotações lateral durante o simulado — 2026-07-15

- **Problema:** na execução do simulado (`/meus-simulados/[id]`), o `NotesPanel` abria como modal/overlay (`fixed inset-0 z-50`, `backdrop-blur-sm`, fundo `bg-slate-950/30`), desfocando a prova e cobrindo a questão — impedindo consultar enunciado/alternativas enquanto anotava.
- **Correção (UX/layout apenas):** no desktop, o `NotesPanel` virou painel expansível dentro da coluna lateral direita, abaixo dos cards **Mapa da prova** e **Modo foco**. Sem overlay, blur ou `fixed inset-0`; não cobre nem empurra questão, alternativas ou navegação. Em telas estreitas, aparece como bloco recolhível no fluxo responsivo, pois não existe coluna lateral.
- O antigo botão flutuante foi substituído por um card premium **Caderno**, com ícone, seta de estado e animação discreta. O painel limita a própria altura e usa rolagem interna; também fecha pelo X e pelo botão "Fechar anotações". O botão manual **Salvar** foi removido: o texto é salvo automaticamente cerca de 700 ms após a última digitação, com estados “Alterações pendentes”, “Salvando automaticamente” e “Anotações salvas automaticamente”, além de fila para edições feitas durante uma requisição em andamento.
- **Preservado:** carregamento e salvamento das anotações (`GET/PUT /api/student/simulados/[id]/notes`), associação por aluno/simulado, timer, respostas, navegação, tesourinha, anti-cheat — nada disso foi tocado.
- **Arquivo:** `app/meus-simulados/[id]/page-client.tsx` (componente `NotesPanel`, local a essa tela). Nenhuma migration; nenhuma alteração de banco/API.

## Correção — zeramento integral de tentativas e acesso para refazer — 2026-07-15

- **Causa:** `set_attempts = 0` apenas marcava tentativas com `counts_toward_limit = false`, mantendo tentativas, respostas, resultados e o vínculo da Jornada como concluído. Em paralelo, o helper de início não aceitava `completed`, embora esse estado signifique que o simulado já foi liberado.
- **Reset integral:** após confirmação premium no Cronograma individual, são removidos `simulado_answers`, `simulado_results`, `topcoin_earnings` e `simulado_attempts` do aluno naquele simulado. TopCoins são ressincronizados, `completed_at` é limpo e o status volta para `available` quando já houve liberação; itens nunca liberados permanecem `locked`.
- **Preservado:** cadastro, matrícula, Jornada, simulado, questões, caderno de anotações e auditoria administrativa. Nenhuma anotação de `student_simulado_notes` é apagada.
- **Refazer:** `available`, `in_progress`, `completed` e vínculo com `released_at` permitem iniciar/retomar; quem bloqueia nova tentativa é o limite `max_attempts`. A validação duplicada da rota de tentativas segue a mesma regra.
- **Resultado real:** permanece a primeira tentativa concluída válida com `counts_toward_limit = true`. Depois do reset, nota e resultado ficam vazios até uma nova conclusão.
- Nenhuma migration foi criada ou alterada.
### Regra oficial de TopCoins por acerto — 2026-07-15

- O aluno parte de 0 TopCoins em cada tentativa e recebe moedas exclusivamente pelos acertos confirmados no resultado: `correct_count × multiplicador`.
- Multiplicadores: 4 por acerto na primeira tentativa, 2 na segunda e 1 da terceira em diante.
- O valor máximo exibido antes da tentativa usa `total_questions × multiplicador`.
- A regra anterior de valor-base menos erros (`ceil(total/2)`, `ceil(total/3)` e desconto por `wrong_count`) foi removida.
- O submit pedagógico permanece inalterado; a sincronização de TopCoins lê `correct_count` do resultado persistido no servidor.
- Nenhuma migration foi criada, alterada ou executada.

### Correção — Ajuda da Coruja na execução real do aluno — 2026-07-16

**Problema:** mesmo com `owl_help_enabled = true` no simulado, a coruja não aparecia para o aluno em `/meus-simulados/[id]`. A API `POST /api/student/simulados/[id]/attempts/[attemptId]/owl-help` já existia e validava tudo, mas o flag nunca chegava ao cliente e a tela de execução não tinha UI para o recurso (apenas o preview admin simulava localmente).

**Correção aplicada:**

- `owl_help_enabled` propagado ao cliente por três caminhos: query do server component `app/meus-simulados/[id]/page.tsx`, resposta de `GET /api/student/simulados/[id]` e `buildSimuladoSnapshot` de `POST /api/student/simulados/[id]/attempts`.
- `sanitizeAttempt` passou a retornar `owl_help_used_count` e `owl_help_data`, restaurando ajudas já usadas ao retomar tentativa (refresh/reabertura).
- Coruja flutuante (`/images/coruja-welcome.png`) no canto inferior direito durante a execução, com balão "Quer uma ajuda aí?" e contador de ajudas. Aparece somente quando: recurso habilitado, tentativa em andamento, há ajudas restantes, a questão atual ainda não recebeu ajuda e a resposta não está bloqueada.
- Clique abre modal de confirmação ("Usar Ajuda da Coruja?" → "Sim, chamar a Coruja" / "Cancelar"). Em questão certo/errado o modal informa a inelegibilidade ("Entendi") e não chama a API. A própria API também passou a rejeitar questões `true_false` e questões com menos de duas alternativas erradas, garantindo a regra no servidor mesmo em chamadas diretas.
- Confirmação chama a API real, que elimina duas alternativas erradas escolhidas **no servidor**, incrementa `owl_help_used_count` e persiste `owl_help_data`. O cliente apenas renderiza os IDs retornados: alternativa com estilo laranja, selo "Eliminada pela Coruja" e sem tesourinha. Se uma alternativa já estava selecionada quando a ajuda foi aplicada, a seleção é preservada e o selo permanece visível.
- O limite vem de `owl_help_limit`; a fórmula de 10% das questões, mínimo 1, permanece somente como sugestão inicial e fallback para simulados antigos habilitados sem limite salvo. Uma ajuda por questão (reuso retorna os mesmos IDs sem novo débito).

**Não alterado:** submit, respostas, timer, anti-cheat, TopCoins, notas, resultados, regras de Jornada e o preview admin.

**Segurança:** o cliente nunca recebe `is_correct` das alternativas durante a execução; a escolha das eliminadas, o limite e a elegibilidade são validados exclusivamente no servidor com ownership da tentativa (`student_id` + `simulado_id` + `in_progress`).

Nenhuma migration foi criada, alterada ou executada.

## Correção arquitetural — vida contextual independente das tentativas — 2026-08-25

- O Simulado permanece como definição compartilhada da prova. A vida operacional do aluno passa a ser identificada pelo contexto: avulso, item individual de Jornada ou participação em Evento.
- A fonte única `getContextualSimuladoAttempts` (`lib/server/studentAssertions.ts`) recorta tentativa ativa, histórico, tentativas usadas, restantes e número da próxima tentativa antes de aplicar `simulados.max_attempts`.
- `GET /api/student/simulados/[id]` e `POST /api/student/simulados/[id]/attempts` deixaram de contar globalmente por `student_id + simulado_id`.
- A migration `20260825080000_contextualize_simulado_attempts.sql` adiciona `student_jornada_simulado_id` e substitui a unicidade global de tentativa ativa por índices parciais contextuais.
- Nenhuma migration foi executada nesta entrega.

### Melhoria — Coruja voadora da Ajuda da Coruja com regra de 10 segundos — 2026-07-16

**Motivo:** a primeira versão da coruja na execução real usava posição fixa no canto inferior direito da viewport, competindo visualmente com o card "Caderno" e os demais recursos de apoio da coluna lateral.

**Comportamento novo (`/meus-simulados/[id]`):**

- A coruja usa a imagem oficial `public/images/coruja-ajuda.jpg` (servida em `/images/coruja-ajuda.jpg`), dentro de badge circular branco com anel laranja. **Atenção:** a solicitação citava `coruja-ajuda.png`, mas o arquivo oficial entregue em `public/images/` é `.jpg`; o código referencia o arquivo real para não quebrar na Vercel (case/extensão sensível em Linux).
- Regra dos 10 segundos: um `useEffect` com `setTimeout` mostra a coruja depois de 10s na mesma questão. Mouse, cliques, resposta, tesourinha, caderno e digitação não reiniciam a contagem; trocar de questão reinicia. Abrir a própria Ajuda esconde e reinicia a chamada.
- Elegibilidade completa para aparecer: `phase === "in_progress"`, `owl_help_enabled`, tentativa ativa, questão atual elegível (não certo/errado, ≥ 3 alternativas), ajuda ainda não usada na questão, resposta não bloqueada, ajudas restantes > 0 e modal fechado.
- Animação com framer-motion: a coruja aparece primeiro grande no centro da área principal com fade/scale, desloca-se até a faixa livre entre o card e a navegação inferior, reduz ao tamanho final e flutua suavemente após o pouso. Sem overlay, `fixed inset-0`, backdrop-blur ou disputa com Caderno, Mapa da prova e Modo foco. Com `prefers-reduced-motion`, aparece diretamente no destino.
- Balão de fala: "Você tem direito a 1 ajuda. Clique aqui!" (plural automático para X ajudas).
- Clique na coruja/balão abre o mesmo modal existente da Ajuda da Coruja, que chama a mesma API (`POST .../owl-help`). Após o uso, `owl_help_data` marca a questão e a coruja some nela; com créditos zerados ela não aparece mais.
- A aparição da coruja não é registrada no banco; somente o uso da ajuda continua persistido pela API existente.

**Não alterado:** API owl-help, submit, respostas, timer, anti-cheat, TopCoins, notas, resultados, regras de Jornada, Sidebar, Header, AppShell e preview admin.

Nenhuma migration foi criada, alterada ou executada.

### Refinamento — animação premium da coruja da Ajuda da Coruja — 2026-07-16

**Escopo:** apenas o componente local `OwlHelpFlyingPrompt` em `app/meus-simulados/[id]/page-client.tsx`. Nenhuma regra funcional, API, elegibilidade ou a regra dos 10 segundos foi alterada; `globals.css` não foi tocado (a animação usa framer-motion, dependência já aprovada — nenhuma dependência nova).

**Fases da animação:**

1. **Aparição central:** a coruja surge grande no meio da área principal, com fade e scale-in suave.
2. **Batida de asas simulada:** durante o voo, oscilação rápida (~0,4s por ciclo) e sutil de `scaleY` (0,93–1,05), `rotate` (±3°) e `y`, dando ilusão de flap sem deformar a arte única (a imagem não tem asas separadas). A sombra elíptica sob a coruja fica menor e mais fraca enquanto ela está "no ar".
3. **Pouso:** ao completar a trajetória (`onAnimationComplete`), a coruja troca para movimento de respiração/flutuação lenta (ciclo de 3s) e a sombra cresce/estabiliza, ancorando-a no "chão".
4. **Fala:** só após o pouso o balão aparece (fade + scale), com rabinho triangular saindo da lateral direita do balão na direção do bico da coruja. Texto: "Você tem direito a 1 ajuda. Clique aqui!" (plural automático para X ajudas).

**Preservado:** imagem oficial `public/images/coruja-ajuda.jpg`, clique abrindo o mesmo modal/API e todas as condições de elegibilidade. A contagem agora mede permanência na questão e só reinicia ao trocar de questão ou ao abrir a própria Ajuda.

Nenhuma migration foi criada, alterada ou executada.

### Limite manual e permanência na questão — 2026-07-18

- Novo campo administrativo **Quantidade de ajudas da Coruja** nos formulários de criação e edição. Ao habilitar, recebe sugestão de 10% das questões (mínimo 1), mas aceita qualquer inteiro positivo e o valor digitado é soberano. O controle numérico usa setas premium integradas ao campo, sem o spinner branco nativo do navegador, preservando digitação e acessibilidade. Zero, negativo, vazio ou decimal são bloqueados no cliente e no backend; desabilitar grava limite nulo.
- O campo numérico e sua sugestão ficam integrados discretamente ao mesmo card do toggle **Ajuda da Coruja**, separados apenas por uma divisória interna e mantendo o padrão visual dark do formulário.
- `POST /api/admin/simulados` e `PATCH /api/admin/simulados/[id]` validam e persistem o limite; duplicação copia `owl_help_enabled` e `owl_help_limit`. Resumo, detalhe, preview, PDF e card da Jornada exibem/respeitam o valor resolvido.
- A API do aluno usa o limite salvo e mantém fallback de 10% apenas para simulados antigos habilitados com `owl_help_limit = null`. Ownership, estado da tentativa e escolha servidor-side das duas alternativas erradas permanecem preservados.
- O temporizador da chamada deixou de medir inatividade: agora mede 10 segundos contínuos na questão. Interações dentro dela não reiniciam o relógio.
- `OwlHelpFlyingPrompt` ganhou a sequência centro grande com fade → deslocamento → pouso inferior, além de comportamento direto para `prefers-reduced-motion`.
- Migration `supabase/migrations/20260718120000_add_simulados_owl_help_limit.sql` **executada com sucesso no banco operacional**, conforme confirmação do responsável em 2026-07-19.
- Não houve alteração em submit, respostas, timer da prova, anti-cheat, TopCoins, resultado pedagógico ou regras de Jornada.

### Tutorial inicial dos recursos da prova — 2026-07-18

- `app/meus-simulados/[id]/page-client.tsx` ganhou o componente local `SimuladoResourcesIntroModal`, exibido depois que uma nova tentativa é criada e antes da primeira interação com a questão.
- O modal apresenta Tesoura, Ajuda da Coruja e Caderno em uma recriação responsiva da execução feita em HTML/CSS, com hotspots numerados e linhas SVG; os textos continuam legíveis e independentes da escala da ilustração.
- Refinamento visual: as linhas tracejadas foram substituídas por setas curvas sólidas com gradiente, contorno branco, glow e pontas direcionadas precisamente aos três controles. O mock da alternativa passou a mostrar a tesoura no ponto real antes da letra, incluindo um estado de hover e outro já eliminado.
- Os marcadores 2 e 3 foram trazidos para dentro da área segura da ilustração e alinhados ao início de suas curvas, evitando cortes nas bordas inferior e direita em 1366px.
- A orientação da Tesoura passou a explicar o gesto completo: posicionar o mouse antes da letra até a tesoura aparecer e clicar para eliminar visualmente a alternativa.
- A abertura ganhou uma entrada central de maior destaque, com escala ampla, overshoot suave e clarão laranja transitório. Usuários com movimento reduzido continuam recebendo abertura direta, sem o efeito.
- A apresentação é bloqueante, possui rolagem interna de contingência, foco inicial no botão principal, sem fechamento por backdrop/Escape e com animações reduzidas quando `prefers-reduced-motion` estiver ativo.
- A visualização é registrada apenas no `sessionStorage`, por `simuladoId + attemptId`. Recarregar/retomar a mesma tentativa na mesma sessão do navegador não reapresenta o modal; uma tentativa nova recebe sua própria apresentação. Como não há persistência no servidor, uma nova sessão do navegador pode apresentar novamente o tutorial de uma tentativa ainda em andamento.
- O timer oficial permanece em andamento e sincronizado com `expires_at`, pois a tentativa já foi iniciada no servidor. Para não contabilizar a leitura do tutorial como tempo de resposta da primeira questão, o marcador local da questão é reiniciado ao clicar em **Entendi, iniciar simulado**. A contagem de 10 segundos da Ajuda da Coruja também só começa após esse fechamento.
- Nenhuma imagem nova, migration, dependência, API ou persistência em banco foi adicionada. Submit, respostas, anti-cheat, TopCoins, resultado e regras funcionais da prova permanecem inalterados.

### Ajuste — Voltar das instruções retorna à Jornada na aba Simulados — 2026-07-16

- Na tela de instruções de `/meus-simulados/[id]`, o botão **Voltar** deixou de apontar sempre para `/meus-simulados`.
- Com contexto de Jornada (`?jornada=` na URL, presente quando o aluno abre o simulado a partir da Jornada), o Voltar leva para `/minhas-jornadas/[studentJornadaId]?tab=simulados`, abrindo a Jornada correta já com a **Etapa 02 · Simulados** ativa.
- Simulado avulso (sem `?jornada=`) continua voltando para `/meus-simulados`.

### Contexto de Evento disponível em Meus Simulados — 2026-08-28

- A listagem `/meus-simulados` reconhece os três contextos operacionais: avulso, item de Jornada e participação em Evento ativo. Se houver Evento ativo para um Simulado que também seria avulso, o card do Evento substitui o avulso para evitar duplicidade visual.
- O card de Evento leva `?event=` para a execução, portanto consulta e consome as tentativas do Evento. Os contadores permanecem independentes por desenho; nenhuma tentativa é somada ou transferida entre contextos.
- A identificação e o rótulo do contador deixam explícito se as tentativas são avulsas, da Jornada ou do Evento.
- Suporte novo: `/minhas-jornadas/[id]` aceita `?tab=` (`dados|simulados|resultados|info`) como aba inicial. O valor é validado no server component (`page.tsx`); valor ausente/inválido cai em `dados`, preservando o comportamento anterior.
- Nada mais foi alterado: telas de erro/desqualificação, execução, APIs e regras de Jornada permanecem intactas.

Nenhuma migration foi criada, alterada ou executada.

### Anulação/desanulação de questão e propagação de gabarito — 2026-09-06

Implementa as seções 3.18–3.21 de `docs/modules/MASTER_SIMULADOS.md`, resolvendo a contradição com a afirmação de que `result_snapshot` nunca muda (matriz completa em `docs/Sprint-resultados.md`).

**Motor de correção único (fonte de verdade):** `lib/simuladoScoring.ts` — puro, sem `server-only`/supabase, usado tanto por `POST .../attempts/[attemptId]/submit` quanto pelo reprocessamento retroativo. Substituiu o loop de correção que existia inline no submit (que confiava em `answer.is_correct` armazenado como atalho — risco real se o gabarito mudasse entre a resposta e o submit). Compara sempre pela `label` da alternativa quando o `id` salvo na resposta não resolve mais para uma alternativa atual (editar uma questão apaga e recria `question_alternatives` com novos UUIDs).

**Orquestração server-side:** `lib/server/simuladoQuestionReprocessing.ts` — `setSimuladoQuestionAnnulment()` (anula/desanula um vínculo `simulado_questions`, compare-and-swap pelo status antigo) e `reprocessAfterAnswerKeyChange()` (propaga gabarito a todos os Simulados que usam a `question_id`). Ambos chamam `reprocessSimulado()`, que reconstrói do zero (nunca soma/subtrai) o resultado de toda tentativa `completed`+`counts_toward_limit=true` do Simulado, corrige `simulado_answers.is_correct` só onde a classificação fresca diverge da armazenada, reescreve `simulado_results` (contadores/score/percentual/snapshot completo) só quando algo de fato mudou, registra em `simulado_result_change_logs` (tabela já existente, antes só usada pela função antiga), ressincroniza TopCoins via `resyncTopCoinEarnings()` (existente, idempotente) e cria notificação em `student_notifications` (existente).

**Endpoints:**
- `PATCH /api/admin/simulados/[id]/questions/[relationId]/annul` — Admin, qualquer Simulado.
- `PATCH /api/professor/events/[id]/questions/[relationId]/annul` — Professor, só no Simulado vinculado a um Evento ao qual está associado (`requireEventManager`); nunca toca `questions`/`question_alternatives` (Banco/gabarito global).
- `PATCH /api/admin/questions/[id]/answer` e `PATCH /api/admin/questions/[id]` — já existiam; a primeira **não reprocessava nada** (bug real corrigido) e a segunda usava uma função antiga e falha (`app/lib/utils/recalculate-question-results.ts`, removida) que não atualizava `simulado_answers.is_correct` e usava o snapshot cacheado como fonte em vez do estado vigente. As duas agora chamam `reprocessAfterAnswerKeyChange()`.

**Segurança:** `POST .../attempts/[attemptId]/answers` passou a rejeitar (409) resposta para uma questão com `simulado_questions.status = "annulled"` — antes só o client bloqueava (bug real: uma chamada direta à API bypassava o bloqueio visual).

**UI:** botão Anular/Desanular no card de questão de `/simulados/[id]/editar` (Admin) e na barra de ações do Modo Aula de `/professor/eventos/[id]` (Professor) — ambos com confirmação e mensagem de aviso mais forte implícita no texto de desanulação (pode reduzir nota). Resultado do aluno (`/meus-simulados/[id]/resultado`) não classifica mais questão anulada como certa/errada — mostra "QUESTÃO ANULADA" e preserva a alternativa marcada sem cor de acerto/erro. A tela de prova ao vivo já tinha watermark e bloqueio client-side de resposta para questão anulada (implementados em Sprint anterior, auditados e confirmados corretos nesta entrega).

**Notificação:** `AppShell` generalizado para reconhecer `question_annulled_result_changed`, `question_reactivated_result_changed` e `answer_key_changed_result_changed`, além do `event_result_released` já existente — mesmo modal, mesmo mecanismo de acknowledgement (`read_at`/`dismissed_at`), sem sistema paralelo.

**Testes:** `tests/simulado-scoring/simulado-scoring.spec.ts` (16 casos, execução real do motor puro, incluindo o cenário exato do incidente histórico de bonificação manual) e `tests/simulado-question-annulment/simulado-question-annulment.spec.ts` (18 casos, auditoria estrutural do código real — mesmo padrão de `tests/event-representative-attempt`, necessário porque `lib/server/simuladoQuestionReprocessing.ts` importa `"server-only"`).

**Dados históricos:** a bonificação manual aplicada antes desta funcionalidade existir (questão `ET3582`, Evento "3º Simulado de Processo Civil") não foi alterada nem reprocessada por esta entrega — nenhuma escrita em produção foi feita como parte deste trabalho de código; a auditoria SELECT desse incidente serviu apenas de prova de regressão para os testes automatizados.

Nenhuma migration foi criada — `simulado_questions.annulled_at/annulled_by/annulment_reason` e `simulado_results.had_live_rule_change/last_reprocessed_at/reprocess_reason` já existiam desde a migration original da tabela (`20260511183000_create_simulados_admin_core.sql`), sem nenhum código os utilizando até agora.

### Fechamento — atomicidade/concorrência, alerta no Banco, ranking (2026-09-06)

Decisão de atomicidade (não duplicar `lib/simuladoScoring.ts` em SQL) e o teste real de concorrência (`tests/simulado-question-annulment/concurrency.spec.ts`) estão documentados em `docs/Sprint-resultados.md`. Corrigido nesta rodada: `setSimuladoQuestionAnnulment()` não verificava se o `UPDATE` condicional realmente afetou uma linha — a requisição perdedora de uma corrida acreditava erroneamente ter aplicado a transição.

**Alerta no Banco de Questões (`/questoes`):** o Banco já carregava `simulado_questions.status` no mesmo `select` que traz as questões (`app/questoes/page.tsx`, sem N+1) e já mostrava um selo "Anulada" por chip individual de Simulado (`relationStatus === "annulled"`, funcionalidade pré-existente). O que faltava era o **resumo agregado** pedido — adicionado em `app/questoes/page-client.tsx`: "⚠ Anulada em N simulado(s)", derivado por `.filter()` sobre o array já carregado (`simuladoLinks`), sem nenhuma consulta adicional. Puramente informativo — nunca lê nem escreve `questions.status` (o selo diagonal "ANULADA" de página inteira, que reflete o status editorial global da questão no Banco, é um elemento visual **separado e pré-existente**; os dois nunca se misturam na mesma renderização).

Nenhuma migration nova. `tests/simulado-question-annulment/simulado-question-annulment.spec.ts` ganhou 1 teste confirmando a ausência de N+1 e a separação Banco × Simulado no alerta.

### Fechamento cirúrgico — notificação por revisão + fim do bypass da rota antiga (2026-09-07)

Dois pontos corrigidos, detalhados em `docs/Sprint-resultados.md`:

1. **Notificação por revisão real, não por tentativa:** `student_notifications.revision_id` (nova coluna, migration `20260907140000_notification_revision_identity.sql`) entra na chave de unicidade — um retry da mesma revisão não duplica, mas duas revisões reais distintas sobre a mesma tentativa (ex.: anular a questão X e depois a questão Y) agora geram duas notificações, não uma sobrescrevendo a outra. `simulado_questions.status_revision_id` e `questions.answer_key_revision_id` (novas colunas, mesma migration) são a origem dessa identidade — gerada uma vez, no momento exato da transição/mudança real, nunca a cada tentativa de reprocessamento.
2. **`PUT /api/admin/simulados/[id]/questions` não escreve mais `status` diretamente:** toda mudança de status (active↔annulled) neste endpoint agora chama `setSimuladoQuestionAnnulment()` — o mesmo serviço central das rotas dedicadas de Admin/Professor. `order_number`/`points` continuam num `UPDATE` direto (nunca afetam pontuação). Criação de vínculo novo continua definindo o status inicial no `INSERT`, sem reconciliação (nada a reconciliar contra uma linha que não existia).

Migration nova (criada, não aplicada): `supabase/migrations/20260907140000_notification_revision_identity.sql`. Testes novos: `tests/simulado-question-annulment/notification-revision.spec.ts` e `tests/simulado-question-annulment/legacy-route-bypass.spec.ts`.

### Recuperação de falha parcial — `pending_reconciliation_at` (2026-09-07)

`simulado_questions.pending_reconciliation_at` (nova coluna, migration `20260907130000_simulado_question_annulment_reconciliation.sql`) marca, no mesmo `UPDATE` que já faz o compare-and-swap de `status`, que a reconciliação daquela transição ainda não terminou — e só é limpa depois que `reprocessSimulado()` concluir com sucesso. Fecha um bloqueador real: antes, uma queda de processo no meio do reprocessamento (ex.: na tentativa 37 de 100) deixava o status já mudado mas parte dos resultados desatualizados, sem nenhuma forma de detectar ou retomar isso — uma nova tentativa de anular a mesma questão era rejeitada como "já está anulada", sem nunca completar o que faltava.

`processPendingReconciliationForSimulado()`/`getPendingReconciliationSummary()` (novas, em `lib/server/simuladoQuestionReprocessing.ts`) e `GET`/`POST /api/admin/simulados/[id]/reconciliation` (novo, Admin-only) resolvem isso reaproveitando o mesmo `status_revision_id` já usado pelas notificações — nenhuma segunda identidade de revisão foi criada. `setSimuladoQuestionAnnulment()` também tenta concluir automaticamente qualquer pendência antes de aceitar uma nova transição contraditória (nunca empilha revisões inconclusas), e não trata mais uma falha do reprocessamento como erro genérico quando o status já mudou — reporta `pendingReconciliation: true`, recuperável.

Detalhes completos, incluindo um segundo bug real encontrado e corrigido ao testar (TopCoins podiam ficar permanentemente desatualizados para alunos já corrigidos antes de uma falha), em `docs/Sprint-resultados.md`, seção "Marcador objetivo de reconciliação pendente". Migration nova (criada, não aplicada): `20260907130000_simulado_question_annulment_reconciliation.sql`. Teste novo, execução real: `tests/simulado-question-annulment/reconciliation-recovery.spec.ts`.

### Incidente real de produção — truncamento silencioso de `simulado_answers` (2026-09-07)

A migration acima foi aplicada e a questão `ET3582` (3º Simulado de Processo Civil) foi anulada em produção. `reprocessSimulado()` buscava `simulado_answers` de todas as tentativas do Simulado numa única consulta sem paginação — com 135 tentativas × 12 questões (~1620 linhas), o PostgREST/Supabase cortou a resposta no limite padrão (1000), silenciosamente. O motor interpretou respostas reais ausentes como questão em branco, reduzindo a nota de 113 dos 135 alunos (sem relação com a questão anulada em si, que ficou correta). Corrigido com paginação explícita e determinística (`fetchAllPages()`, `.range()` + `.order("id")` + conferência do `count` exato) nas três consultas do motor que escalam com o número de tentativas. `lib/simuladoScoring.ts` não foi alterado. `reconcileCurrentRevision()` (nova) permite reprocessar a MESMA revisão já concluída (sem gerar revisão nova, sem mudar status) para corrigir os dados do incidente — exposta pelo endpoint já existente `POST /api/admin/simulados/[id]/reconciliation`, sem rota nova. Testado na mesma escala real (1620 respostas) em `tests/simulado-question-annulment/large-answer-set.spec.ts`. **Dados de produção deste Simulado ainda não foram corrigidos** — fica para uma etapa controlada separada. Detalhes completos: `docs/Sprint-resultados.md`, seção "Incidente de truncamento silencioso".

### Prova Professor

Caderno de prova neutro gerado pelo Professor/Admin a partir do Evento reaproveita o mesmo renderer do PDF do aluno (`SimuladoQuestionsPdf`, `app/lib/pdf/simulado-result-pdf.ts`) via um parâmetro `showAnswerKey?: boolean` — `false` para o Professor/Admin (nenhuma alternativa correta marcada, nenhuma coruja, nenhuma indicação de gabarito), `true` (comportamento inalterado) para o aluno. `is_correct` também deixou de ser selecionado do banco na rota `GET /api/professor/events/[id]/exam-pdf`. Detalhes completos, testes e regressão: `docs/Sprint-evento-de-simulado.md`, seções 98 e 99.

### Ranking PDF

Exportação do "Ranking oficial" em PDF, botão dentro da própria aba Participantes de `/professor/eventos/[id]`. Renderer dedicado `app/lib/pdf/event-ranking-pdf.ts`, sem endpoint novo (gerado client-side a partir do mesmo `participants` já calculado em tela via `rankedParticipants()` — nenhuma regra de ranking nova, nenhuma consulta adicional). Colunas atuais: Posição, Nome, Tempo, Advert., Coruja, Pontos. Capa oficial reaproveita o mesmo mecanismo A4/`objectFit:"cover"` da capa do Simulado. Detalhes completos, testes e regressão: `docs/Sprint-evento-de-simulado.md`, seções 99-103.

### Regra de classificação do Ranking (atualizada 2026-09-09)

`lib/eventRanking.ts` (`rankedParticipants()`) passou a ordenar por: pontuação oficial (`display_score`) > menor uso da Ajuda da Coruja (`owl_help_used_count`) > menor número de advertências por troca de tela (`focus_violation_count`) > menor tempo. Tela, modal "Ver" e PDF do ranking usam a mesma função — nenhuma regra paralela. Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seção 103.

### Guia "Insights" do Professor — dificuldade por tópico com suavização estatística (2026-09-09)

Nova aba "Insights" no Evento do Professor, com uma análise coletiva (todos os participantes juntos) de quais tópicos foram mais difíceis — distinta do card individual por aluno (seção anterior/104). Métrica principal de ordenação `D_adjusted = (n·D_t + k·D_global)/(n+k)`, k=2, suaviza tópicos com poucas questões em direção à média global do Simulado, evitando que 1 questão isolada pareça tão confiável quanto várias. Anuladas sempre excluídas; branco nunca conta como erro; questão com múltiplos tópicos contribui integralmente (não dividida) para cada um. Nenhuma consulta nova ao banco (reaproveita dados já calculados na mesma rota), nenhuma migration, nenhuma mudança em `lib/simuladoScoring.ts` ou na regra de classificação do Ranking. Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seção 105.

### Refinamento de UX da guia "Insights" do Professor (2026-09-10)

Guia "Insights" (seção anterior) recebeu um refinamento só de apresentação: lista de tópicos agora mostra apenas a dificuldade ajustada (a observada e a confiança da amostra continuam calculadas internamente, só deixaram de aparecer na tela), com classificação renomeada para Extrema/Alta/Média/Baixa (limiares 75/50/25%, centralizados em `lib/eventInsights.ts`). Lista "Questões mais difíceis" deixou de mostrar taxa de branco e passou a ser clicável, abrindo a questão em um modal de consulta somente-leitura que reaproveita `QuestionDisplayCard` (já usado na aba Questões/revisão) e os dados já carregados (zero fetch novo). Bloco "Mapa de domínio" removido. Nenhuma mudança na matemática, no scoring, no ranking ou nas demais guias. Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seção 106.

### Paginação completa reaproveitada na guia Insights do Professor (2026-09-10)

`fetchAllPages()` — paginação determinística contra o truncamento silencioso do PostgREST em `simulado_answers`/`simulado_results`, já usada em `lib/server/simuladoQuestionReprocessing.ts` — foi extraída para `lib/server/supabasePagination.ts` e passou a ser reaproveitada também por `GET /api/professor/events/[id]` (guia Insights), que hoje sofria o mesmo tipo de truncamento (1587 respostas reais, 1000 retornadas, no mesmo Evento do incidente `ET3582`). Nenhuma mudança em `lib/simuladoScoring.ts` ou nos resultados oficiais. Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seção 107.

### Questões/revisão — população operacional válida (2026-09-09)

A correção final do painel separa conclusão oficial válida de tentativa realmente ativa, com deduplicação e exclusão de extras/stale/desclassificados/expirados. Não altera pontuação nem tentativas persistidas. Fonte detalhada: `docs/Sprint-evento-de-simulado.md`, seção 109.

## Auditoria de acesso à Jornada — 2026-09-09

Contrato canônico preservado: `/minhas-jornadas/[studentJornadaId]` e `GET /api/student/jornadas/[id]` usam **`student_jornadas.id`**, nunca `jornadas.id`. A listagem retorna `id` da matrícula e `jornada_id` da definição; o card usa `id`. O Server Component repassa o parâmetro sem conversão e o client chama a API com o mesmo valor. A API filtra `student_jornadas.id` e `student_id` autenticado. Não há tentativa alternativa de resolução por ID da definição.

SELECT remoto autorizado comprovou que `cd23889d-f091-4fca-911c-cd6c789c5853` é uma matrícula `active`, vinculada à Jornada de Teste (`3d618a08-7259-467e-8211-9cbf72b2e250`), com 3 itens no cronograma. O schema observado já tem `jornadas.max_attempts = 3` e não tem `simulados.max_attempts`: a consulta de detalhe em HEAD falha com `42703` nessa coluna removida; a consulta local da sprint de tentativas retorna a matrícula. Não foi verificada a revisão efetivamente implantada em produção; a incompatibilidade foi reproduzida executando o SELECT do HEAD. Nenhuma migration ou escrita remota foi executada nesta auditoria.

A API antes convertia inclusive erro SQL em 404. Agora erros de consulta, de tentativas e de resultados retornam 500 genérico com registro técnico; matrícula inexistente/de outro aluno ou cancelada mantém 404 seguro. `paused` retorna 403 com mensagem explícita e preserva os registros históricos; `expired` mantém a consulta histórica e bloqueia itens não concluídos. Falhas de rede no client encerram o carregamento com erro explícito. Não existe fallback de limite para a coluna antiga nem para tentativas ilimitadas.

A busca global encontrou quatro construtores de retorno/detalhe: card de Minhas Jornadas e card do dashboard usam o `id` da matrícula; Voltar do Simulado usa `?jornada=` (ID da matrícula); resultado usa `payload.jornada.student_jornada_id`. Todos seguem o mesmo contrato. Não foram encontrados construtores adicionais para essa rota em e-mails/notificações. Links administrativos por `jornada_id` continuam identificando a definição administrativa, não a matrícula.

Removidos o CTA “Ver simulados avulsos”, a sugestão de resolver novo avulso e sua contagem de disponibilidade no dashboard. Histórico, resultados, anotações e retomada legada são preservados. Descrições antigas que permitiam novas execuções avulsas estão superadas pela regra de Jornada/Evento. O bloqueio servidor de novo início avulso permanece na API de tentativas.

Correção de acesso: `app/api/student/jornadas/[id]/route.ts`, `app/minhas-jornadas/page-client.tsx`, `app/minhas-jornadas/[id]/page-client.tsx`, `app/api/student/dashboard/route.ts`. Testes: `tests/student-journey-access.spec.ts` (13 casos); suíte de limites contextual preservada. A conclusão em produção depende da implantação coordenada do código compatível, não autorizada nesta tarefa. A migration de tentativas preexistente não deve ser reexecutada automaticamente.

Validação desta correção: TypeScript e build aprovados; lint sem novos diagnósticos comparado ao início da tarefa; diff-check aprovado. Foram executados 105 testes: 101 passaram, incluindo os 13 novos de acesso e 17 de limites; 4 falharam. Três são expectativas textuais já incompatíveis com HEAD (painel Realizando, reenvio de código de cadastro e e-mail de matrícula); a quarta é timeout de interface em cadastro público, fora do fluxo alterado, sem causa atribuída a esta correção. Não declarar a suíte ampliada integralmente aprovada. O fluxo de Jornada foi validado por testes da API com mocks e contratos de links; o SELECT real confirmou a matrícula e o cronograma, sem autenticar/impersonar o aluno. Não houve homologação visual autenticada em produção. Arquivo protegido de nova questão preservado por SHA-256; sem nova migration, escrita remota, commit, push ou deploy.

## Fechamento autorizado — código compatível com o schema observado

Confirmados novamente por SELECT: `jornadas.max_attempts` e `simulado_events.max_attempts` existem (amostra 3); `simulados.max_attempts` não existe. A migration local é somente um artefato versionado nesta entrega: não executar nem reparar seu histórico. A consulta ao histórico por API retornou PGRST106, pois `supabase_migrations` não está exposto; o registro da aplicação permanece uma pendência operacional.

O usuário autorizou um único commit e push para `origin/main`, com verificação posterior do deployment automático da Vercel. As afirmações anteriores “sem commit/push/deploy” descrevem as etapas anteriores. Nenhum deploy manual está autorizado. A alteração do Criador Manual e seus trechos documentais permanecem fora deste commit. Regressão repetida: 101/105 passaram, incluindo 30/30 focais; as mesmas quatro falhas anteriores permaneceram. Não há nova falha identificada no escopo. Homologação autenticada depende de navegador/sessão disponível; não criar sessões por impersonação.

## Engine de tentativas blindada transacionalmente + fluxo de abandono (2026-09-10)

Continuação de uma Sprint interrompida pelo Codex (limite de uso atingido antes de terminar). Estado herdado ao assumir: `HEAD = 9f5f2f0` (== `origin/main`, "feat: move limite de tentativas para jornadas e eventos"), com trabalho parcial local não commitado: a migration transacional `supabase/migrations/20260909170000_atomic_attempt_transitions.sql` já criada e pronta (auditada nesta continuação e mantida sem alterações — correta), mais as 3 alterações locais preexistentes e não relacionadas de sempre (`app/questoes/nova/page-client.tsx`, seção do Criador Manual, e os trechos correspondentes em `docs/INDICE_FUNCOES_SISTEMA.md`/`docs/status-atual.md`) — preservadas integralmente, não tocadas.

### Causa raiz — não provada, corrigido o que foi comprovadamente falho

O usuário reproduziu dois sintomas: (1) desclassificação por foco aparentemente não consumindo/sendo retomada; (2) resposta a mais de 50% das questões seguida de saída não consumindo corretamente. **Não foi possível provar isoladamente qual falha específica causou o comportamento observado pelo usuário** — várias falhas reais e concretas foram encontradas e corrigidas (auditoria do Codex, confirmada nesta continuação): (a) erro do SELECT que reconta respostas era ignorado, podendo virar "zero respostas" silenciosamente; (b) `UPDATE`s de submit e desclassificação não condicionavam a escrita a `status = in_progress`, permitindo sobrescrever uma tentativa já terminal; (c) a retomada tinha uma race real (primeira consulta filtra `in_progress`, segunda busca só por ID sem revalidar status); (d) submit fazia INSERT do resultado e só depois UPDATE da tentativa, sem atomicidade. Qualquer uma delas, isoladamente ou em conjunto, poderia explicar os sintomas relatados — todas foram corrigidas.

### Engine transacional — 4 operações com lock por tentativa

A migration (já pronta, herdada do Codex, integralmente auditada e mantida sem alteração) define `lock_student_attempt()` (helper: `SELECT ... FOR UPDATE` na linha da própria `simulado_attempts`, valida ownership/contexto — Jornada ou Evento — e exclui `is_preview`/`professor_preview`) e 4 operações que sempre começam travando a tentativa antes de qualquer leitura/escrita:

- **`save_student_attempt_answer`** — valida status/expiração/questão ativa/alternativa, faz upsert da resposta, recalcula `answered_count` e `counts_toward_limit` (>50%, estrito) na mesma transação. Erro na contagem propaga e desfaz a resposta também — nunca vira "zero respostas".
- **`abandon_student_attempt`** — idempotente (abandonar uma tentativa já `abandoned` retorna sucesso sem reprocessar); recalcula o consumo a partir das respostas persistidas, nunca confia em contagem do client; marca `status = abandoned`.
- **`record_student_attempt_focus`** — sequência de violação idempotente (`greatest(atual, número recebido)`, nunca soma incondicional — corrige um bug real de dupla contagem em retry de rede); 3ª violação desclassifica.
- **`complete_student_attempt`** — insere `simulado_results` E marca `completed` na mesma transação; concorrência otimista via `updated_at` esperado (se a tentativa mudou desde a leitura que alimentou o cálculo em TypeScript, rejeita — o cliente reenvia).

Segurança: todas `security invoker set search_path = ''`, revogadas de `public`/`anon`/`authenticated`, concedidas só a `service_role` — nunca chamáveis diretamente do browser, só pelas rotas server-side do próprio aluno. Scoring pedagógico continua 100% em TypeScript (`lib/simuladoScoring.ts`) — a transação só persiste um resultado já calculado (`jsonb_populate_record`), nunca recalcula pontuação em SQL.

**Nenhuma coluna, tabela, status ou contador novo foi criado.** `max_attempts` continua só em Jornada/Evento; tentativas continuam em `simulado_attempts`; `counts_toward_limit` continua a fonte de verdade do consumo — a migration só adiciona funções, nada de modelagem.

### Rotas migradas para os RPCs

`app/api/student/simulados/[id]/attempts/[attemptId]/answers/route.ts`, `.../focus-violation/route.ts` e `.../submit/route.ts` passaram a chamar os RPCs correspondentes em vez de fazer `UPDATE`/`INSERT` diretos em dois passos. `.../submit/route.ts` preservou integralmente a orquestração pós-conclusão (Evento/`consolidateEventRepresentativeAttempt`, liberação de Jornada + e-mail, TopCoins, `logActivity`) — só a persistência do resultado+status virou atômica; nada dessa orquestração foi tocado.

### Nova rota — abandono explícito

`app/api/student/simulados/[id]/attempts/[attemptId]/abandon/route.ts` (novo) chama `abandon_student_attempt`. `abandoned` nunca gera `simulado_results`, `representative_attempt_id` nem TopCoins — exclusivo de `completed` via submit.

### Correção da race de retomada

`app/api/student/simulados/[id]/attempts/route.ts`: a segunda consulta (busca por ID, depois de encontrar um candidato `in_progress` na primeira) passou a revalidar `.eq("status", "in_progress")` — antes, uma tentativa que virasse terminal entre as duas consultas (ex.: desclassificada por foco concorrente) podia ser devolvida como retomável.

### Botão "Abandonar simulado" + modal + "Voltar" interno

`app/meus-simulados/[id]/page-client.tsx`: novo botão "Abandonar simulado" e um ícone de "Voltar" no cabeçalho da prova (`StickyHeader`) — ambos acionam o **mesmo** handler (`requestAbandon`), que só abre um modal de confirmação (`AbandonAttemptModal`, reaproveitando o componente premium existente `PremiumModal` — nenhum shell novo). O texto do modal muda conforme a estimativa client-side de consumo (`answered_count/total_questions > 0.5`) — o servidor sempre recalcula com autoridade em `abandon_student_attempt`, a estimativa é só para escolher o texto certo. Confirmar chama `POST .../abandon` e navega para o contexto de origem (Evento > Jornada > `/meus-simulados`, nessa ordem de prioridade). **Refresh, fechamento de aba, troca de visibilidade e queda de conexão nunca disparam abandono** — o aviso nativo `beforeunload` do navegador continua sendo o único comportamento nesses casos, sem nenhuma chamada de rede.

### Documentação reconciliada

`docs/modules/MASTER_SIMULADOS.md`: cinco afirmações incorretas ("segunda ocorrência" desclassifica — seção 3.24 completa, item 6 da tela de regras e o checklist da seção 10, além das duas já corrigidas na primeira passagem) corrigidas para "terceira ocorrência" (a regra vigente sempre foi 3, `FOCUS_VIOLATION_LIMIT`) — a reconciliação inicial havia corrigido apenas 2 dos 5 locais; concluída na auditoria pré-migration (2026-09-10). Notas de implementação adicionadas nas seções de risco 10.1 (resposta), 10.5 (abandono) e 10.11 (finalização) confirmando as garantias transacionais desta Sprint.

### Testes

Nova suíte `tests/attempt-transactions.spec.ts` (50 casos): auditoria estrutural completa da migration (lock por attempt, segurança, ausência de modelagem nova), execução real das fórmulas de negócio (limiar >50% para as 11 combinações 0-10, monotonicidade, sequência de violação idempotente com 3ª desclassificando, abandono recalculando consumo), wiring das 4 rotas para os RPCs, correção da race de retomada, UI do botão/modal/Voltar, ausência de abandono automático por refresh/visibilitychange/unmount, e preservação de scoring/ranking/Insights/PDF/`representative_attempt_id`/TopCoins. **50/50 passando.**

Dois testes preexistentes precisaram de atualização estrutural (não revertidos, ajustados para a nova arquitetura): `tests/event-representative-attempt/event-representative-attempt.spec.ts` (ordem "consolidar só depois de persistir completed" agora verificada contra o RPC, não contra o UPDATE literal antigo) e `tests/simulado-question-annulment/simulado-question-annulment.spec.ts` (rejeição de questão anulada agora verificada dentro da transação SQL, não mais no código TypeScript de duas etapas).

**Falha preexistente confirmada fora do escopo, não corrigida:** `tests/event-operations/active-attempt-metric.spec.ts` ("painel Realizando") — já documentada como incompatibilidade textual conhecida no fechamento anterior desta mesma Sprint de tentativas (`docs/Sprint-jornadas.md`), causada por um refresh de layout no painel do Professor feito fora desta continuação; arquivo não tocado por esta tarefa.

Regressão completa (`attempt-transactions`, `context-attempt-limits`, `student-journey-access`, `event-operations`, `event-acquisition-session`, `event-representative-attempt`, `event-insights`, `professor-management`, `event-ranking-pdf`, `professor-exam-pdf`, `event-professor-assignment`, `simulado-question-annulment`, `simulado-scoring`): **474/475** (1 falha preexistente confirmada, acima). `npx tsc --noEmit` limpo. `npm run build` limpo. Lint comparado byte a byte contra a baseline pré-tarefa: mesmos 7 problemas preexistentes em `app/meus-simulados/[id]/page-client.tsx` (não relacionados a nenhuma linha tocada), zero diagnóstico novo.

**Nenhuma migration nova foi criada** — a migration do Codex foi auditada integralmente e mantida sem alterações (correta). **Não executada.** Nenhum dado de produção alterado. Nenhum commit/push/deploy nesta etapa.

### Auditoria pré-migration — correção do achado `recordViolation()` (2026-09-10)

A auditoria pré-migration desta engine (leitura integral da migration + das 4 rotas + da UI) aprovou a migration sem achados CRÍTICOS/ALTOS, mas confirmou um achado MÉDIO real: `recordViolation()` (`app/meus-simulados/[id]/page-client.tsx`) incrementava `violationCount` otimisticamente e decidia a fase (`focus_warning`/`disqualified`) sem checar `res.ok`/`json.ok` — uma falha real de rede ou do servidor podia ser apresentada ao aluno como um aviso comum, sem nunca desclassificar de fato (o servidor continuava soberano sobre o estado persistido, mas a UI podia divergir dele silenciosamente).

**Corrigido:** `recordViolation()` agora só avança `violationCount`/fase depois de confirmar `res.ok && json.ok`. Em caso de falha (rede, 400/403/409/500, ou `ok:false` com JSON válido), a fase só muda para `disqualified` se o próprio servidor confirmar explicitamente `json.disqualified === true` (ex.: a tentativa já havia sido desclassificada por uma chamada concorrente) — qualquer outra falha mantém a prova em `in_progress` e mostra um aviso não-bloqueante (`focusViolationError`, banner com auto-limpeza em 6s), sem inventar sucesso nem desclassificação fictícia, e sem disparar retry automático. Testes novos em `tests/attempt-transactions.spec.ts` (suíte 11, 8 casos) cobrem os cenários A-H do achado (sucesso com warning/disqualified, 400/403/409/500/rede, `ok:false` com JSON válido, ausência de retry automático).

### Documentação — reconciliação concluída

A auditoria também confirmou que a reconciliação documental da Sprint anterior havia corrigido apenas 2 dos 5 locais de `docs/modules/MASTER_SIMULADOS.md` que ainda afirmavam "segunda ocorrência desclassifica". Os 3 locais restantes (seção 3.24 completa, item 6 da tela de regras, checklist da seção 10) foram corrigidos nesta etapa — ver "Documentação reconciliada" acima, atualizado.
