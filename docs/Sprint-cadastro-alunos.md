# Sprint Cadastro de Alunos — Central de Tentativas Incompletas

## 10/09/2026 — Integração com Evento + correção do campo Busca + dropdown premium na Central

### Causa raiz da ausência (caso reportado: e-mail informado no Evento não aparecia na Central)

Mapeado o fluxo real de `/evento/[slug]`: a primeira etapa pública (`POST /api/events/[slug]/route.ts`) recebe só um e-mail, valida reCAPTCHA + Evento, cria/atualiza `simulado_event_join_intents` (dedupe por `event_id`+`email`, cooldown de reenvio de 60s) e envia o e-mail de confirmação — só depois disso (clique no link) a pessoa chega a `/api/events/[slug]/confirm/route.ts` e, se ainda não for aluno, é redirecionada para `/cadastro?event=slug&email=...`, onde `POST /api/auth/register` é quem sempre chamou `startOrTouchRegistrationAttempt`. **Causa raiz:** `POST /api/events/[slug]/route.ts` nunca chamava nenhuma função de `studentRegistrationAttemptService.ts` — a Central só era alimentada a partir de `/api/auth/register`, isto é, só depois que a pessoa efetivamente chegasse ao formulário completo de cadastro. Quem digitava o e-mail no Evento e abandonava ali (sem nunca chegar ao `/cadastro`) nunca gerava nenhum registro.

### Regra definitiva (documentação literal solicitada)

> A partir do primeiro momento em que o servidor do EstudoTOP recebe e aceita voluntariamente um endereço de e-mail válido para iniciar o ingresso em um Evento (intent criada/atualizada e e-mail de confirmação efetivamente enviado), esse endereço é registrado como tentativa de cadastro incompleta em `student_registration_attempts` — desde que ainda não pertença a um aluno existente. A tentativa pode existir só com e-mail (`full_name`/`phone` ausentes) e é enriquecida com nome/telefone quando a mesma pessoa chega a `/cadastro`, sem nunca duplicar a linha.

### Ponto instrumentado

`app/api/events/[slug]/route.ts` (`POST`), logo antes do `return` final de sucesso (`state: "confirmation_email_sent"`) — nunca antes do e-mail de confirmação ter sido realmente enviado com sucesso pelo Resend, e nunca no caminho de cooldown (`state: "confirmation_pending"`, que não envia e-mail novo). Guard imediatamente anterior: `supabase.from("students").select("id").eq("email", email).maybeSingle()` — se encontrar aluno existente, a chamada de tracking é pulada (nenhuma tentativa é criada para quem já tem conta). Chama a nova função `startOrTouchEventRegistrationAttempt(supabase, { email, eventId: event.id })`.

### Nova função de serviço

`lib/server/studentRegistrationAttemptService.ts` ganhou `startOrTouchEventRegistrationAttempt(supabase, { email, eventId })` — nunca lança (try/catch interno, log sanitizado em `system_error_logs`, nunca bloqueia o ingresso no Evento). Antes de chamar o mesmo `upsert_student_registration_attempt` já usado pelo cadastro geral (via `startOrTouchRegistrationAttempt`, `source: "event_signup"`, `source_context_id: eventId`), lê a tentativa já existente para aquele `email_normalized` (`status <> 'completed'`) e reaproveita `full_name`/`phone` já conhecidos em vez de enviar vazio — evita que uma pessoa que já passou pelo cadastro geral (ou por um Evento anterior) e volta a entrar com o mesmo e-mail em outro Evento tenha seu nome/telefone reais apagados pela etapa que só tem e-mail. Sem essa proteção, o `ON CONFLICT ... DO UPDATE` do RPC sobrescreveria incondicionalmente.

### Nenhuma migration nova

`source`/`source_context_id` já existiam desde a migration `20260910100000` (`source text check (source in ('public_signup', 'event_signup'))`) e `RegistrationAttemptSource` já incluía `"event_signup"` como tipo — usado pelo cadastro geral quando `eventId` está presente. A integração com Evento não precisou de nenhuma coluna nova; **nenhuma migration foi criada nesta etapa**.

### Enriquecimento e deduplicação

Mesmo mecanismo já existente (`upsert_student_registration_attempt`, índice único parcial por `email_normalized`): a etapa 2 (`/cadastro` → `POST /api/auth/register` → `startOrTouchRegistrationAttempt`) atualiza a MESMA linha criada na etapa 1 do Evento — `full_name`/`phone` passam a ser preenchidos, `stage` reflete o fluxo real, `first_started_at` é preservado, `attempt_count` incrementa normalmente. Mesmo e-mail em dois Eventos diferentes: uma única linha lógica, `source_context_id` passa a refletir o Evento mais recente (mesma semântica já documentada para "Corrigir dados" — não há histórico multi-evento nesta entrega).

### Proteção contra aluno existente e requests atrasados

Igual ao restante da Sprint: o guard `students.select().eq("email", email)` roda a cada chamada, com dado sempre atual — um request atrasado do Evento que chegue **depois** da criação integral do aluno vai encontrar o `students` já populado e pular a criação da tentativa (nunca a recria). Como `complete_student_registration_attempt` continua fazendo `DELETE`, nenhuma chamada de toque tardio pode reabri-la (`UPDATE`/upsert-por-e-mail-já-inexistente não insere sozinho quando o guard de aluno existente já barrou a chamada antes).

### Cadastro administrativo e concorrência

Inalterados: `/api/admin/students/create` nunca chama nenhuma função de tracking (nem antes, nem depois desta Sprint) — continua coberto só pela remoção automática dentro de `createStudentAccount`. `startOrTouchRegistrationAttempt` (cadastro geral) e `startOrTouchEventRegistrationAttempt` (Evento) escrevem através do mesmo RPC atômico com `ON CONFLICT` por `email_normalized` — concorrência entre os dois fluxos nunca cria duas linhas.

### UI — Central de Tentativas de Cadastro

- **Nome/telefone ausentes:** `full_name`/`phone` chegam vazios em uma tentativa recém-criada pelo Evento; `displayFullName()` (novo helper) renderiza `"—"` em vez de string vazia (linha da tabela, título do modal, mensagem de exclusão) — nunca `null`/`undefined`/vazio "cru".
- **Origem:** o modal de detalhe já exibia um badge "Evento" quando `source === "event_signup"` (Sprint anterior); esta entrega adiciona um `DetailItem` explícito `"Origem": "Evento"` ou `"Cadastro geral"` junto dos demais campos do modal. Buscar o nome do Evento exigiria join/consulta adicional por linha — mantido fora desta entrega (badge/rótulo "Evento" é suficiente, sem N+1).

### Correção do campo Busca — causa raiz real (não tentativa e erro)

O campo Busca usava um wrapper `<span>` com fundo próprio (`bg-[#0D1926]`) contendo um `<input className="bg-transparent">` — mesmo padrão já existente em `app/admin/logs/page-client.tsx` (`FilterInput`, local, duplicado, não compartilhado). `app/globals.css` define uma regra global (`.et-admin-dark-content :where(input..., select, textarea) { background-color: #050b13 !important; ... }`, linha ~728) que força a cor de fundo de **todo** `<input>`/`select`/`textarea` dentro de qualquer página admin, sobrepondo `bg-transparent` (utilitário Tailwind, sem `!important`, sempre perde). Resultado: o `<input>` (só do tamanho da linha de texto, sem herdar a altura `h-12` do wrapper) ganhava seu próprio fundo `#050b13`, visivelmente diferente do `#0D1926` do wrapper ao redor — o "retângulo preto atrás/ao redor do texto" relatado. Confirmado comparando com o padrão que já funciona (`PremiumInput`/classe `.et-admin-dark-input`, que não define fundo próprio nem usa wrapper colorido — deixa a mesma regra global aplicar `#050b13` uniformemente, sem nenhum outro elemento competindo).

**Correção:** o `<input>` passou a ser a própria caixa visual (altura, borda, radius, padding — sem wrapper com fundo divergente); o ícone de busca é posicionado por cima via `absolute`. A mesma correção foi aplicada em `app/admin/logs/page-client.tsx` (`FilterInput`, usado por Busca/Rota/Ação-evento/Data inicial/Data final) — mesmo componente duplicado, mesma causa raiz, mesmo bug potencial (não reportado ali, mas confirmado presente e corrigido preventivamente).

### Dropdowns nativos da Central — substituídos

`Situação`/`Etapa`/`Período` usavam um `<select>` nativo local (função `FilterSelect`, removida). Nenhum componente existente cobria "poucas opções, sem busca, dropdown 100% customizado" (`PremiumSelect` é um `<select>` nativo estilizado — abre o menu nativo do navegador ao clicar, mesmo problema; `SearchableSelect` sempre exige campo de busca interno, inadequado para 3–5 opções). Criado `app/components/ui/PremiumSimpleSelect.tsx` — novo componente compartilhado (dark/clean), modelado na mesma interação já comprovada de `SearchableSelect` (trigger + painel customizado, click-outside, teclado: setas/Enter/Escape/Tab, `aria-haspopup`/`aria-expanded`/`role="listbox"`/`role="option"`), só sem o campo de busca. Os três filtros da Central passaram a usá-lo; nenhuma opção, valor, filtro ou ordenação foi alterado — só o componente visual.

### Auditoria global de dropdowns (mapeamento, sem substituição em massa)

Levantamento (leitura, sem alteração) para o relatório desta tarefa: 12 arquivos com `<select>` nativo visível (`app/admin/logs`, `app/questoes`, `app/admin/alunos` e `[id]`, `app/professor/eventos/[id]`, `app/admin/alunos/novo`, `app/admin/raio-x-provas` e `[id]`, `app/admin/jornadas/[id]`, `app/simulados`); 21 arquivos referenciando `SearchableSelect`/`PremiumSelect`/`SimpleSelectDropdown`. Achados relevantes: **`PremiumSelect` (`app/components/ui/PremiumSelect.tsx`), listado no índice como componente obrigatório "Todos os selects", é ele mesmo um `<select>` nativo estilizado** — não resolve o problema de menu nativo por si só; `SimpleSelectDropdown` está duplicado localmente em `app/questoes/page-client.tsx`, `app/questoes/revisar/page-client.tsx`, `app/topicos/page-client.tsx` e `app/simulados/page-client.tsx`. Decisão desta entrega: **não** substituir esses 12 selects nativos nem consolidar as 4 cópias de `SimpleSelectDropdown` — mudar dropdowns de páginas como Questões/Simulados/Jornadas/Alunos está fora do relatado (retângulo preto + selects nativos da Central de Tentativas) e representa um raio de alteração muito maior, com risco real de regressão em telas de alto uso, contra a instrução explícita de não alterar o que já funciona e não está envolvido nesta demanda. Ficam mapeados para uma Sprint de padronização visual dedicada; `PremiumSimpleSelect` já existe como peça reutilizável para isso.

---

## 10/09/2026 — Fechamento da Sprint: migration corretiva executada

A migration `supabase/migrations/20260910120000_remove_completed_registration_attempts.sql` foi **executada manualmente no Supabase pelo responsável do projeto** — informação recebida diretamente dele, fora do escopo deste agente (nenhuma migration, SQL ou comando de banco foi executado pelo Claude em nenhuma etapa desta Sprint, incluindo esta). A partir da execução, valem no banco real:

- `complete_student_registration_attempt(p_email)` faz `DELETE` da tentativa (não mais `UPDATE ... status='completed'`);
- `upsert_student_registration_attempt` aceita o 6º parâmetro opcional `p_previous_email` (renomeação segura por "Corrigir dados");
- os resíduos `status='completed'` que existiam na tabela (ver "Auditoria seguinte" abaixo) foram removidos pela própria migration (`DELETE ... WHERE status = 'completed'`);
- o `CHECK` da coluna `status` passou a aceitar somente `open`, `contacted`, `ignored` — `'completed'` deixou de ser um valor válido no schema.

A regra estrutural "nenhum aluno validamente cadastrado permanece em `student_registration_attempts`" está, portanto, aplicada no banco real, não apenas no código. A migration original `20260910100000_student_registration_attempts.sql` permanece como já documentado: aplicada anteriormente. O script `scripts/sql/student-registration-attempts-backfill-audit.sql` continua **não executado**. Não foi solicitada nem informada nenhuma evidência de horário de execução, usuário executor ou quantidade de linhas efetivamente removidas — nada disso é registrado aqui por não ter sido fornecido.

---

## 10/09/2026 — Ajuste de regra: remoção automática após conclusão

### Regra definitiva (documentação literal solicitada)

> A tabela `student_registration_attempts` representa apenas cadastros ainda não concluídos. Quando uma conta de aluno é criada integralmente, qualquer tentativa correspondente ao e-mail normalizado é removida automaticamente, inclusive se a criação ocorrer por fluxo administrativo.

Isso substitui a regra original desta Sprint (`status`/`stage = 'completed'` persistido, aba "Recuperados") — corrigido antes de qualquer uso real desse estado em produção (nenhuma linha chegou a ficar `completed`).

### Descoberta importante: a migration já estava aplicada

Antes de decidir entre editar a migration existente ou criar uma nova, foi consultado (leitura, sem escrita) o banco Supabase remoto do projeto (`uphqihoqzwqjzmsimaug`, o mesmo referenciado por `NEXT_PUBLIC_SUPABASE_URL`): a tabela `student_registration_attempts` e as 5 funções já existiam, com **1 linha real** já gravada (`status='open'`, `stage='confirmation_sent'`). A migration `20260910100000_student_registration_attempts.sql` portanto **já havia sido aplicada em ambiente compartilhado** — apesar do relatório da Sprint anterior ter registrado "criada, não executada" (correção factual desta entrada; não foi possível determinar por este agente como/quando a aplicação ocorreu, já que nenhuma chamada de execução de migration foi feita nas duas etapas anteriores desta mesma Sprint). Consequência direta, conforme `docs/02-POLITICA-MIGRATIONS.md` (MIG-006): a correção de regra foi feita em uma migration **nova**, `20260910120000_remove_completed_registration_attempts.sql`, nunca editando o arquivo já aplicado.

### O que a nova migration faz

- `complete_student_registration_attempt(p_email)`: `CREATE OR REPLACE` — mesma assinatura, corpo passou de `UPDATE ... SET status='completed'` para `DELETE FROM student_registration_attempts WHERE email_normalized = ...`. Idempotente (`ok:true` mesmo se nada for removido); nunca toca `auth.users`/`profiles`/`students`/`student_registration_confirmations`.
- `upsert_student_registration_attempt(...)`: assinatura mudou (novo parâmetro `p_previous_email text default null`) — a função de 5 argumentos foi removida (`DROP FUNCTION IF EXISTS`) e recriada com 6, com revoke/grant refeitos para a nova assinatura. O novo parâmetro implementa a renomeação de tentativa quando "Corrigir dados" troca o e-mail (ver seção própria abaixo).
- **Nenhuma coluna foi removida** da tabela (`completed_at` e o índice único parcial `where status <> 'completed'` permanecem — vestigiais, sem custo/risco de remover em uma migration corretiva sobre uma tabela já em uso). O `CHECK` de `stage` também não foi tocado (mesmo raciocínio). **Atualização (auditoria seguinte, ver seção abaixo):** o `CHECK` de **`status`** foi revisto — ver "Reconciliação defensiva e revisão do `CHECK` de `status`".
- Não executada nesta etapa — **executada manualmente pelo responsável do projeto posteriormente** (ver entrada no topo deste documento).

### Remoção centralizada em `createStudentAccount`

Por instrução explícita do pedido ("não espalhar DELETE manual em várias rotas"), a chamada de remoção saiu de `confirm-registration/route.ts` (onde estava, chamando `completeRegistrationAttempt`) e foi movida para **dentro de `lib/server/studentAccountService.ts`**, logo após cada um dos dois `return` de sucesso de `createStudentAccount()`:
- branch de reconciliação de conta Auth órfã (`reconcileIncompleteStudentAccount`);
- branch de criação nova (`auth.users`+`profiles`+`students` do zero).

Ambos chamam `removeRegistrationAttemptByEmail(supabase, input.email)` — o e-mail já validado/persistido pelo próprio serviço, nunca um valor arbitrário do cliente. Como `createStudentAccount` é a única função que efetivamente constitui uma conta de aluno íntegra, e é compartilhada por `confirm-registration/route.ts` (cadastro público) **e** `/api/admin/students/create/route.ts` (criação administrativa), a remoção passa a cobrir os dois fluxos automaticamente — a rota admin não foi tocada, não precisou de nenhuma lógica nova. `lib/server/studentRegistrationAttemptService.ts` renomeou `completeRegistrationAttempt` → `removeRegistrationAttemptByEmail` (mesmo RPC por trás, nome agora reflete o comportamento real).

### "Corrigir dados" — troca de e-mail antes da conclusão

Cenário do pedido: `joao@gmail.com` → "Corrigir dados" → `joao@outlook.com`. Sem tratamento, o e-mail antigo ficaria como lead órfão enquanto uma segunda tentativa nasceria para o novo e-mail.

Solução: `app/cadastro/page.tsx` guarda em `lastSubmittedEmailRef` (um `useRef`, não dispara re-render) o e-mail efetivamente enviado no último `/api/auth/register` bem-sucedido **desta mesma sessão de formulário** — nunca persistido, nunca compartilhado entre abas/visitas. Se o usuário reenviar com um e-mail diferente, o e-mail anterior é incluído como `previous_email` no corpo da requisição. `app/api/auth/register/route.ts` repassa isso para `startOrTouchRegistrationAttempt`, que chama `upsert_student_registration_attempt` com o novo parâmetro `p_previous_email`.

No SQL: se existir uma tentativa em aberto para `previous_email` **e** o novo e-mail ainda não tiver a sua própria tentativa em aberto, a função **renomeia** a linha existente (mesmo `id`, `first_started_at` preservado, contadores incrementados normalmente) para o novo e-mail — nunca cria uma segunda linha. Se o novo e-mail já tiver sua própria tentativa aberta (duas pessoas reais, coincidência), a renomeação é ignorada com segurança (a condição `not exists` na `UPDATE` simplesmente não casa nenhuma linha) e o fluxo segue pelo caminho normal de upsert do novo e-mail — a tentativa antiga do e-mail anterior fica intocada, sem ser apagada nem fundida incorretamente. Isso satisfaz explicitamente a instrução de "não adivinhar identidade por nome/telefone, usar o contexto real da tentativa" — o único sinal usado é o e-mail que o PRÓPRIO client sabia ter enviado nesta sessão, nunca uma inferência heurística.

### UI ajustada

`/admin/configuracoes/tentativas-cadastro`: métricas agora são Em aberto / Últimas 24h / Contatados / **Ignorados** (era Em aberto / Últimas 24h / Contatados / Recuperados); filtro "Situação" perdeu a opção "Recuperados"; filtro "Etapa" perdeu a opção "Concluído"; modal de detalhe perdeu a checagem `isCompleted` (nunca mais alcançável — uma linha completed seria removida antes de poder aparecer na tela) e a linha "Cadastro concluído" da linha do tempo; badge "Recuperado" removido de `StatusBadge`. `GET /api/admin/registration-attempts` trocou a agregação `completed` por `ignored` nas métricas globais.

### Testes desta correção

Sem suíte Playwright dedicada (mesma limitação já registrada na Sprint anterior — sem suíte pré-existente de `/api/auth/register`/`confirm-registration` reaproveitável dentro do escopo cirúrgico). Validado por leitura completa do novo fluxo (register → confirm-registration → createStudentAccount → removeRegistrationAttemptByEmail), consulta read-only ao schema/dados remotos para confirmar o estado real antes de decidir sobre a migration, `npx tsc --noEmit` e `npm run build` limpos.

### Pendência nova

Verificação operacional (ainda não realizada por este agente — a migration foi executada pelo responsável do projeto fora deste fluxo, e nenhuma consulta SQL foi feita por este agente nesta etapa de fechamento): confirmar, agora que a migration `20260910120000` está aplicada, que `SELECT * FROM student_registration_attempts WHERE email_normalized = '<email de teste>'` retorna zero linhas depois de um cadastro de teste concluído de ponta a ponta.

---

## 10/09/2026 — Auditoria seguinte: reconciliação defensiva de leitura + revisão do `CHECK` de `status`

Continuação cirúrgica da entrada acima, na mesma Sprint. Antes de qualquer alteração, o estado real foi consultado de novo (leitura, sem escrita) no mesmo banco Supabase remoto (`uphqihoqzwqjzmsimaug`): a tabela agora tinha **2 linhas** — a mesma `status='open'` da auditoria anterior, **mais uma nova linha `status='completed'`/`stage='completed'`, criada entre as duas auditorias**. Isso prova, com dado real e não hipotético, que o RPC antigo (`complete_student_registration_attempt` fazendo `UPDATE ... SET status='completed'`) continua ativo em produção — a migration corretiva `20260910120000` ainda não foi aplicada — e volta a gravar `completed` a cada cadastro público concluído nesta janela entre o deploy do código e o deploy da migration.

**Bug real encontrado por causa disso:** `GET /api/admin/registration-attempts` não excluía `status='completed'` da consulta principal nem da métrica `last24h`, enquanto o tipo TypeScript do painel (`Attempt["status"]`) já havia sido restringido a `"open" | "contacted" | "ignored"` na correção anterior. Resultado: a linha `completed` real acima, ao ser listada, quebraria `StatusBadge` em runtime (`config` viria `undefined` para um `status` fora do type, e `config.className` lançaria `TypeError`) — um crash real da tela administrativa, não teórico, reproduzível agora mesmo com o dado existente.

**Correções aplicadas:**
- `app/api/admin/registration-attempts/route.ts`: `.neq("status", "completed")` na consulta principal e na métrica `last24h` (as métricas `open`/`contacted`/`ignored` já eram implicitamente seguras por filtrarem um valor explícito diferente de `completed`). Implementa a reconciliação defensiva de leitura pedida — a Central nunca mostra um cadastro já concluído, mesmo que a fonte operacional (o `DELETE` dentro de `createStudentAccount`) ainda não tenha rodado para aquela linha por qualquer motivo.
- `supabase/migrations/20260910120000_remove_completed_registration_attempts.sql` (não executada nesta etapa — mesmo arquivo da correção anterior, só editado por ainda não ter sido aplicada no momento desta auditoria; **executada manualmente pelo responsável do projeto posteriormente**, ver entrada no topo deste documento): passou a incluir `delete from public.student_registration_attempts where status = 'completed';` (purga idempotente do resíduo legado, incluindo a linha real encontrada nesta auditoria) seguido de `DROP`/`ADD CONSTRAINT` no `CHECK` de **`status`**, removendo `'completed'` da lista de valores aceitos (`open`/`contacted`/`ignored`). Isso substitui a decisão da entrada anterior de manter `'completed'` no `CHECK` como "vestigial e sem custo" — a descoberta desta auditoria (o RPC antigo continua gravando `completed` enquanto a migration não for aplicada) mostra que não é vestigial nem gratuito deixá-lo: enquanto permitido pelo schema, o estado volta a ser escrito. O `CHECK` de `stage` e o índice único parcial `where status <> 'completed'` não foram tocados (ambos continuam corretos/inofensivos com `status` nunca mais podendo ser `completed`).
- `tests/registration-attempts-cleanup.spec.ts` (suíte já existente da correção anterior): reexecutada sem alteração — os 33 testes já cobrem a forma da migration/serviço; a lacuna encontrada era especificamente na rota de listagem, coberta agora pela leitura manual do código e pela consulta real ao banco acima.

**Não afeta a regra de negócio nem os fluxos já documentados** — apenas fecha a janela de leitura defensiva enquanto a migration corretiva aguarda aplicação, e evita que o `CHECK` do banco continue permitindo o estado que a regra de produto já proibiu.

`npx tsc --noEmit`, `npm run build` e `npx playwright test tests/registration-attempts-cleanup.spec.ts` (33/33) limpos após esta auditoria. Nenhuma migration executada pelo Claude nesta etapa, nenhum commit/push/deploy nesta etapa.

---

## 10/09/2026 — Central administrativa de tentativas incompletas de cadastro

### Objetivo

Permitir que o administrador identifique e acompanhe pessoas que iniciaram o cadastro público de aluno (nome + e-mail enviados, código de confirmação gerado) mas não concluíram a criação da conta — para recuperação manual (WhatsApp, e-mail), nunca automação de marketing.

### Mapa do cadastro real encontrado (antes de qualquer implementação)

- **Formulário público:** `app/cadastro/page.tsx` (client único, wizard por `step: "form" | "code" | "password" | "done"` — não existe `page-client.tsx` separado). Etapa `"form"` coleta nome, WhatsApp, e-mail, CPF e concursos desejados, valida reCAPTCHA e chama `POST /api/auth/register`.
- **`POST /api/auth/register`** (`app/api/auth/register/route.ts`): valida campos obrigatórios (nome, WhatsApp, e-mail, CPF, concursos — **todos obrigatórios hoje**, inclusive telefone), reCAPTCHA, contexto de Evento opcional (`?event=` + cookie de intenção), duplicidade contra `students` (e-mail/CPF). Se aceito: invalida qualquer `student_registration_confirmations` anterior não usada do mesmo e-mail+`purpose='public_signup'`, insere uma nova linha (código de 6 dígitos, hash, `expires_at = +30min`, `metadata.source`), envia o e-mail com o código. **Só depois do e-mail confirmadamente enviado** é que o cadastro é considerado "aceito" — esse é o ponto exato onde a tentativa passa a existir.
- **Etapa `"code"`** do wizard: só tem dois caminhos — confirmar o código (`POST /api/auth/confirm-registration`) ou "Corrigir dados" (volta para `"form"`, obrigando reenvio completo do formulário — **não existe** um botão dedicado de "reenviar código"; reenvio manual = resubmissão completa de `/api/auth/register`).
- **`POST /api/auth/confirm-registration`** (`app/api/auth/confirm-registration/route.ts`): busca a confirmação válida mais recente. **Código incorreto:** gera e envia automaticamente um novo código (nova linha em `student_registration_confirmations`, `metadata.source = "invalid_code_resend"`), com cooldown de 60s contra spam — isso é um reenvio **automático**, sem ação explícita do usuário além de digitar errado. **Código correto:** reivindica a confirmação (`used_at`), verifica conflito com `students` existente, verifica validade do Evento (se aplicável) e chama `createStudentAccount` (`lib/server/studentAccountService.ts`).
- **`createStudentAccount`** (compartilhado com `/api/admin/students/create` — cadastro manual do admin **nunca** deve gerar tentativa rastreada): reaproveita conta Auth órfã via `reconcileIncompleteStudentAccount` quando existe, ou cria `auth.users` + `profiles` (`role: "student"`) + `students` (`status: "pending"` no fluxo normal, `"active"` no fluxo de Evento) com rollback interno completo em qualquer falha intermediária (nunca deixa auth/profile órfão). Lança `StudentAccountError` com um código sanitizado (`StudentAccountErrorCode`) em qualquer falha — nunca expõe SQL bruto.
- **Conclusão:** quando `createStudentAccount` retorna sucesso, a conta já está íntegra (`auth.users`+`profiles`+`students`). No fluxo de Evento, passos adicionais depois disso (token de senha, ativação de perfil, participante do Evento, consumo da intenção) podem falhar individualmente — mas isso é uma preocupação de onboarding de Evento, **não** de "cadastro incompleto": a conta de aluno já existe.
- **`students.status = "pending"`** é cadastro **concluído**, aguardando aprovação administrativa — nunca deve aparecer como incompleto.
- **Infraestrutura de integridade já existente, nunca consumida por UI:** `supabase/migrations/20260713090000_student_account_integrity.sql` criou as views `public.student_account_integrity_admin` e `public.student_registration_orphans_admin`, que já classificam `student_registration_confirmations` órfãs — reaproveitada nesta Sprint como fonte do script de auditoria de backfill (`scripts/sql/student-registration-attempts-backfill-audit.sql`), nunca duplicada.
- **Evento:** o cadastro público já suporta um contexto de Evento (`?event=` + `simulado_event_join_intents`); `source = "event_signup"` + `source_context_id = event_id` são registrados quando aplicável, sem alterar nenhuma regra de ingresso do Evento.

### Definição de "tentativa incompleta"

Uma tentativa passa a existir **somente** quando o servidor aceita iniciar o cadastro (código gerado **e** e-mail efetivamente enviado) — nunca por simples visita à página, nunca por caractere digitado antes do envio. Deixa de ser incompleta **automaticamente** (nunca por ação manual do admin) no exato momento em que `createStudentAccount` retorna sucesso.

### Modelagem implementada

`public.student_registration_attempts` (migration `20260910100000_student_registration_attempts.sql`, ~~criada, não executada~~ **descoberta posteriormente já aplicada em ambiente compartilhado — ver a entrada de correção no topo deste documento**) — ver `docs/INDICE_FUNCOES_SISTEMA.md`, seção 10.X, para o detalhamento completo de campos, funções SQL, índices e grants.

**Desvio deliberado da modelagem sugerida no pedido:** não foi criada uma coluna `admin_contact_status` separada — `status` já assume o valor `'contacted'` diretamente (a mesma informação seria redundante em duas colunas); `admin_contacted_at`/`admin_contacted_by` continuam existindo como os detalhes de quando/quem contatou. `stage` foi reduzido a 4 valores originalmente propostos como alcançáveis pelo fluxo (`confirmation_sent`, `confirmation_confirmed`, `account_creation_failed`, `completed`) — `data_submitted` não existe como momento distinto nesta arquitetura (envio de dados e geração de código acontecem na mesma requisição), e "código incorreto" não muda de etapa (continua `confirmation_sent`, só atualiza atividade/contador). **`completed` deixou de ser alcançável na prática após a correção de regra registrada no topo deste documento** — a conclusão agora remove a linha em vez de marcar essa etapa.

### Deduplicação

Chave: `email_normalized = lower(btrim(email))`. Índice único parcial garante no máximo uma linha com `status <> 'completed'` por e-mail normalizado; todas as 5 funções SQL operam por `UPDATE`/`DELETE ... WHERE email_normalized = ...` (ou `ON CONFLICT` equivalente na função de início), nunca por `SELECT` seguido de `INSERT`/`UPDATE`/`DELETE` em dois passos — protege contra concorrência (dois `register` simultâneos, resend concorrendo com a conclusão, etc.) sem depender de lock de aplicação. Desde a correção de regra (topo deste documento), a conclusão é a única transição que passou de `UPDATE` para `DELETE`.

### Segurança e LGPD

Nenhuma senha, OTP, código de confirmação, token ou CPF é armazenado. RLS habilitado, `anon`/`authenticated` sem nenhum privilégio na tabela — acesso só via `service_role` (rotas server-side) e via as 5 funções SQL (`security invoker`, `search_path=''`, grants restritos ao `service_role`, mesmo padrão já auditado na Sprint da engine de tentativas de simulado). `GET/PATCH/DELETE /api/admin/registration-attempts` exigem `requireAdmin`. Nenhum dado pessoal completo é gravado em `system_error_logs`/`admin_audit_logs` além do que já é prática (e-mail do ator administrativo, id da tentativa). Retenção automática **não foi definida** nesta Sprint — permanece decisão de produto/jurídica; a exclusão manual pelo admin (`DELETE`, com confirmação em `PremiumModal`) é o único mecanismo de remoção implementado.

### Testes

Sem suíte Playwright dedicada nesta Sprint (não há suíte de `/api/auth/register`/`confirm-registration` pré-existente reaproveitável neste projeto para estender com segurança dentro do escopo cirúrgico). Validado por leitura completa do código real (register/confirm-registration/createStudentAccount), `npx tsc --noEmit` e `npm run build` limpos, e comparação de lint byte a byte contra a baseline pré-Sprint (zero diagnóstico novo nos arquivos pré-existentes tocados).

### Backfill

`scripts/sql/student-registration-attempts-backfill-audit.sql` — SELECT ONLY, reaproveita `student_registration_orphans_admin`. **Não executado.** Não foi criado nenhum script de importação — a decisão de importar dados legados fica pendente de revisão manual do resultado do script de auditoria.

### Pendências conhecidas

- Retenção automática de tentativas antigas: não definida, decisão de produto/jurídica.
- Backfill de dados legados: script de auditoria criado e não executado; importação, se decidida, exige script novo e aprovação explícita.
- Busca administrativa não faz *accent-folding* no banco (sem extensão `unaccent`, não usada em nenhum outro ponto do projeto) — busca é case-insensitive (`ilike`) mas sensível a acentos no termo digitado.
