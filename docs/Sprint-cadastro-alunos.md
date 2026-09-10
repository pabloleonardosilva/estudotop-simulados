# Sprint Cadastro de Alunos — Central de Tentativas Incompletas

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
