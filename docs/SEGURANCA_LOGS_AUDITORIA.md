# Segurança de logs, auditoria e monitoramento

## Estruturas

- `admin_audit_logs`: ações administrativas sensíveis.
- `security_event_logs`: autenticação negada, forbidden, IDOR, aluno bloqueado e segredo de cron inválido.
- `system_error_logs`: falhas técnicas relevantes com mensagem/stack sanitizados.
- `student_activity_log`: estrutura existente ampliada para ações relevantes, entidade, IP e user-agent.

As migrations são `supabase/migrations/20260702120000_security_audit_logs.sql` e `supabase/migrations/20260702130000_protect_security_audit_logs.sql`. A segunda habilita RLS e revoga todos os privilégios de `anon` e `authenticated`; inserção e consulta usam service role exclusivamente no servidor, e a API de leitura exige admin.

## Helper central

`app/lib/server/auditLogger.ts` exporta:

- `getRequestContext`
- `sanitizeLogMetadata`
- `logAdminAction`
- `logSecurityEvent`
- `logSystemError`
- `logStudentActivity`

O helper não registra Authorization, cookies ou segredos. Chaves sensíveis são substituídas por `[redacted]`, strings/arrays são limitados e falha de insert é reportada no log técnico do servidor e absorvida para não afetar a operação principal.

## Eventos instrumentados

Administrativos: criação/alteração/status/reset de senha/reenvio de boas-vindas de aluno, criação/edição/publicação/arquivamento/exclusão de simulado, criação/edição/arquivamento/exclusão de Jornada, matrícula e alteração de matrícula, criação/edição/exclusão/importação/operação em lote de questão e execução do cron.

Segurança: token ausente/inválido, admin sem permissão, aluno bloqueado, matrícula/liberação inválida, tentativa pertencente a outro aluno, simulado divergente e segredo de cron inválido.

Aluno: abertura de Jornada/simulado, início/retomada/submissão de tentativa, visualização de resultado, atualização de notas e envio de feedback. Respostas individuais não são logadas para evitar volume e conteúdo sensível.

Sistema: falhas críticas nas rotas instrumentadas, cron, envio de e-mail do cron/matrícula, tentativa, submissão, notas e feedback.

## Severidades

- `info`: operação normal relevante.
- `warning`: acesso negado, tentativa suspeita ou operação parcialmente falha.
- `error`: falha técnica relevante.
- `critical`: reservado para vazamento, invasão, corrupção ou operação destrutiva indevida confirmada.

## Consulta

- API: `GET /api/admin/logs`, protegida por `requireAdmin`.
- Página: `/admin/logs`, protegida por `requireAdminPage`.
- Tipos: `admin`, `security`, `system`, `student`.
- Filtros na API e no painel: severidade, ação/evento, ator/aluno, entidade, período e paginação; máximo 100, padrão 50.
- O painel é somente leitura e não expõe funções de edição/exclusão.

## Investigação

- IDOR: filtrar `type=security` e eventos `student.idor_attempt`/`student.invalid_attempt_access`, correlacionando ator, recurso, rota, IP e horário.
- Cron: filtrar eventos `cron.invalid_secret`, ações `admin.cron.release_job.*` e erros com source `api.admin.jornadas.release_job`.
- Aluno bloqueado: filtrar `student.blocked_access` por actor ID/IP e comparar com status do aluno.
- Erro operacional: usar `type=system`, source e período; nunca copiar stack para canais públicos sem revisão.

## Retenção e LGPD

IP, user-agent, identificadores e rotas são dados técnicos vinculáveis a pessoas. Recomenda-se retenção inicial de 180 dias para segurança/admin/sistema e alinhamento da atividade pedagógica à política do histórico do aluno. A retenção definitiva exige validação jurídica e operacional. Acesso deve permanecer restrito a administradores; exportações devem ser minimizadas e protegidas.

## Eventos deliberadamente não instrumentados

- Cada resposta, clique, filtro ou navegação de interface.
- Payloads completos, enunciados, respostas textuais, tokens, cookies, senhas, secrets ou headers completos.
- Todas as rotas admin/IA em detalhe; a cobertura desta sprint prioriza entidades e fluxos críticos e deve ser expandida gradualmente.
