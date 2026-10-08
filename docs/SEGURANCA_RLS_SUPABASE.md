# Segurança RLS no Supabase

## Atualização — Sprint Segurança F (2026-07-02)

Durante um teste de intrusão controlado, confirmou-se por leitura direta da API REST do Supabase (com a `anon key` pública, sem sessão) que `simulado_attempts`, `simulado_answers`, `simulado_results`, `simulado_feedbacks` e `question_code_pool` estavam com RLS desabilitado **e** `GRANT` completo (`SELECT/INSERT/UPDATE/DELETE/TRUNCATE`) para `anon` e `authenticated` — achado crítico, já corrigido.

Antes de aplicar a correção, auditou-se o código-fonte (não só as migrations) e confirmou-se que nenhuma dessas 5 tabelas é consultada pelo client browser em nenhuma tela — todo acesso passa por `createSupabaseAdminClient()` server-side. Isso elimina o risco descrito abaixo ("Bloqueio do painel e da área do aluno") especificamente para essas 5 tabelas, porque não há policy nenhuma para escrever: a correção foi `enable row level security` + `revoke all ... from anon, authenticated` (deny-all por ausência de grant, sem necessidade de policy), o mesmo padrão já usado nas tabelas de log (ver `docs/INDICE_FUNCOES_SISTEMA.md`, seção 1.7).

Migration: `supabase/migrations/20260702140000_protect_simulado_data_tables.sql`. Reverificado após aplicar: chamada não autenticada à `anon key` retorna `401 permission denied` nas 5 tabelas; fluxo normal do aluno/admin não foi afetado (smoke test + `npx tsc --noEmit` limpos).

As pendências abaixo (`questions`/catálogo, ativação em massa, avatar público) **continuam válidas** — não foram tocadas nesta sprint.

## Escopo auditado

Esta análise usa as migrations versionadas no repositório. Ela não substitui uma consulta ao catálogo do banco de produção (`pg_class`, `pg_policies` e `storage.buckets`).

## Estado comprovado pelo repositório

- `topics` habilita RLS em `supabase/migrations/20260627120000_create_subject_topics.sql`.
- Não foram encontradas instruções `create policy` nas migrations versionadas.
- O bucket `profile-avatars` é público por decisão funcional e restringe tamanho e MIME no bucket e na API.
- As demais tabelas sensíveis não possuem ativação de RLS comprovável pelas migrations disponíveis.
- A aplicação usa `SUPABASE_SERVICE_ROLE_KEY` em código exclusivamente server-side. Service role ignora RLS; autorização da aplicação continua obrigatória antes de cada consulta.

## Tabelas sensíveis avaliadas

- Identidade: `students`, `profiles` e tabelas administrativas existentes.
- Jornadas: `jornadas`, `jornada_simulados`, `student_jornadas`, `student_jornada_simulados`.
- Simulados: `simulados`, `simulado_questions`, `simulado_attempts`, `simulado_answers`, `simulado_results`, `simulado_feedbacks`, `student_simulado_notes`.
- Questões: `questions`, `question_alternatives`, `question_subjects`, `subjects`, `disciplines`, `topics`.
- Operação: `student_activity_log`, `exam_analyses`, `exam_analysis_questions` e logs de e-mail existentes.

## Policies recomendadas

- `profiles` e `students`: usuário autenticado lê somente o próprio registro; escrita sensível somente por rotas server-side autorizadas.
- Matrículas, tentativas, respostas, resultados, notas, feedbacks e atividade: `auth.uid() = student_id` ou vínculo equivalente.
- Catálogo publicado: leitura autenticada limitada a registros publicados/liberados; mutações somente por admin server-side.
- Questões e alternativas: não liberar gabarito por policy genérica. A entrega ao aluno deve continuar pelas APIs que aplicam regras de simulado e feedback.
- Storage privado futuro: policies por pasta cujo primeiro segmento corresponda a `auth.uid()`, usando signed URLs para leitura.

## O que pode ser aplicado agora

- Manter service role somente no servidor, após autenticação/autorização.
- Manter validação de propriedade nas APIs student.
- Auditar o catálogo remoto antes de qualquer migration de RLS.
- Criar policies tabela a tabela, acompanhadas de testes com anon, authenticated e service role.

## O que deve aguardar uma sprint específica

- Ativação de RLS em massa.
- Policies para `questions` e tabelas de catálogo enquanto existirem consultas diretas do browser com anon key.
- Conversão de todas as leituras client-side para APIs ou views seguras.
- Alteração do bucket público de avatar, que exigiria migração das URLs persistidas para signed URLs.

## Riscos de ativação em massa

- Bloqueio do painel e da área do aluno por ausência de policies completas.
- Exposição acidental de gabaritos ao criar policy ampla de leitura.
- Divergência entre banco remoto e migrations locais.
- Falsa sensação de segurança: service role ignora RLS e continua dependendo dos guards da aplicação.

Nenhuma migration de RLS foi criada na Sprint Segurança C porque o estado remoto não foi inspecionado e há consumidores browser-side que precisam ser migrados antes.

## 02/10/2026 - Autorizacao contextual de resultados (preparada localmente)

Novo RPC consume_student_owl_help usa SECURITY INVOKER, search_path vazio, lock e validacao de propriedade/contexto; execute revogado de PUBLIC, anon e authenticated, concedido somente ao service_role. Leitura de notas, revisao, comentarios e disponibilizacao de TopCoins deve passar pelo servidor e pela autorizacao de liberacao. Nenhuma policy existente alterada. Migration nao executada; validar grants e concorrencia em ambiente isolado autorizado antes da aplicacao. Detalhes: docs/Sprint-simulados.md, Fase B de 02/10/2026.

## 08/10/2026 - close_stale_user_sessions exposta a anon (migration preparada, nao executada)

Achado (catalogo de producao, somente leitura): `public.close_stale_user_sessions(integer)` e `SECURITY DEFINER`, sem GRANT explicito em `20260702150000_logs_auditoria_unificacao.sql`; herdou EXECUTE de PUBLIC e dos privilegios padrao (`anon`, `authenticated`). Qualquer chamada nao autenticada a `/rest/v1/rpc/close_stale_user_sessions` podia encerrar sessoes ativas de `user_sessions` (integridade da telemetria e de "Online agora"; sem leitura de dados). Nao explorado em producao. Sem chamadores: nenhum codigo, cron da Vercel, pg_cron (extensao ausente), funcao ou view.

Correcao: `supabase/migrations/20261008120000_restrict_close_stale_user_sessions.sql` revoga EXECUTE de PUBLIC, anon e authenticated e mantem service_role (o dono `postgres` conserva acesso). Nao altera dados, RLS, policies, triggers, grants de tabelas nem outras funcoes. Validada em PostgreSQL 17.6 local com a funcao identica a de producao (hash do codigo) e o mesmo ACL: antes, anon/authenticated/PUBLIC executavam; depois, 42501 para os tres; service_role preserva o comportamento; reaplicacao idempotente; compativel com a Fase B. Chamada HTTP via PostgREST local nao executada (limitacao do ambiente); a permissao e a mesma verificada por `SET LOCAL ROLE`, mecanismo usado pelo PostgREST.

Permanecem fora do escopo: GRANTs amplos padrao do Supabase (incluindo TRUNCATE) para anon/authenticated em 31 tabelas, todas com RLS ativo; leitura anon pela API publica retornou 0 linhas em `jornadas`, `jornada_simulados` e `topcoin_earnings`. Revogacao geral planejada para Sprint propria.

Atualizacao 08/10/2026: a migration `20261008120000_restrict_close_stale_user_sessions.sql` foi executada manualmente pelo proprietario no Supabase operacional (fora do ledger). Verificacao somente leitura: ACL `{postgres=X/postgres,service_role=X/postgres}`, `has_function_privilege` falso para anon e authenticated e verdadeiro para service_role, codigo da funcao inalterado. A migration da Fase B tambem foi executada: `consume_student_owl_help` restrita a service_role; funcoes de trigger mantem o EXECUTE padrao, sem efeito (nao podem ser chamadas diretamente).
