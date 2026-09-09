# Sprint Cadastro de Alunos — Central de Tentativas Incompletas

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

`public.student_registration_attempts` (migration `20260910100000_student_registration_attempts.sql`, **criada, não executada**) — ver `docs/INDICE_FUNCOES_SISTEMA.md`, seção 10.X, para o detalhamento completo de campos, funções SQL, índices e grants.

**Desvio deliberado da modelagem sugerida no pedido:** não foi criada uma coluna `admin_contact_status` separada — `status` já assume o valor `'contacted'` diretamente (a mesma informação seria redundante em duas colunas); `admin_contacted_at`/`admin_contacted_by` continuam existindo como os detalhes de quando/quem contatou. `stage` foi reduzido a 4 valores realmente alcançáveis pelo fluxo atual (`confirmation_sent`, `confirmation_confirmed`, `account_creation_failed`, `completed`) — `data_submitted` não existe como momento distinto nesta arquitetura (envio de dados e geração de código acontecem na mesma requisição), e "código incorreto" não muda de etapa (continua `confirmation_sent`, só atualiza atividade/contador), então não há um `confirmation_failed` alcançável separadamente.

### Deduplicação

Chave: `email_normalized = lower(btrim(email))`. Índice único parcial garante no máximo uma linha com `status <> 'completed'` por e-mail normalizado; todas as 5 funções SQL operam por `UPDATE ... WHERE email_normalized = ... AND status <> 'completed'` (ou `ON CONFLICT` equivalente na função de início), nunca por `SELECT` seguido de `INSERT`/`UPDATE` em dois passos — protege contra concorrência (dois `register` simultâneos, resend concorrendo com complete, etc.) sem depender de lock de aplicação.

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
