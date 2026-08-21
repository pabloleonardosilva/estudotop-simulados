# STATUS DO PROJETO — EstudoTOP Simulados

_Atualizado automaticamente pelo agente a cada implementação concluída._

---

## Sprint A — Cadastro de Aluno — ✅ Concluído

- [x] Tabela `students` com status `pending | active | blocked | inactive`
- [x] API `POST /api/admin/students/create` — cria conta Supabase Auth + perfil
- [x] API `POST /api/admin/students/resend-welcome` — reenvia e-mail
- [x] Páginas `/alunos`, `/alunos/novo`, `/alunos/[id]`
- [x] E-mail de boas-vindas ao cadastrar aluno
- [x] Migration `006_students.sql` aplicada

---


## Sprint E-mails — ✅ Implementado em 2026-06-12

- [x] Primeiro e-mail institucional do aluno atualizado para o assunto **"🦉 Você chegou!"**.
- [x] Template HTML claro/premium criado em `app/lib/email/studentWelcomeTemplate.ts`, com espaçamento confortável entre linhas e parágrafos.
- [x] Envio institucional de boas-vindas via Resend nas rotas de criação e reenvio de aluno.
- [x] `POST /api/admin/students/create` passa a enviar o e-mail institucional de boas-vindas ao cadastrar aluno.
- [x] `POST /api/admin/students/resend-welcome` passa a reenviar o e-mail institucional de boas-vindas.
- [x] Perfil do aluno em `/admin/alunos/[id]` recebeu botão **Reenviar boas-vindas** no card **Sistema**.
- [x] Índice de funções atualizado.

## Sprint B — Jornadas (Admin) — 🔄 Implementado, aguardando testes e ajustes finais

### Banco de dados

- [x] Migration `007_jornadas.sql` criada com as 4 tabelas
- [x] Tabela `jornadas` com status `draft | published | archived`, índices e trigger `updated_at`
- [x] Tabela `jornada_simulados` com unique `(jornada_id, simulado_id)` e `(jornada_id, order_number)`
- [x] Tabela `student_jornadas` com unique `(student_id, jornada_id)` e check `expires_at > started_at`
- [x] Tabela `student_jornada_simulados` com unique `(student_jornada_id, jornada_simulado_id)`
- [ ] **Migration aplicada no Supabase** ← pendente (arquivo criado, não aplicado)

### APIs

- [x] `GET/POST /api/admin/jornadas` — listar e criar jornada
- [x] `GET/PATCH/DELETE /api/admin/jornadas/[id]` — ler, publicar, arquivar, editar, excluir
- [x] `GET/POST/DELETE /api/admin/jornadas/[id]/simulados` — listar, vincular, remover simulado
- [x] `PATCH /api/admin/jornadas/[id]/simulados/reorder` — reordenar por drag-and-drop
- [x] `GET/POST /api/admin/jornadas/[id]/students` — listar alunos e atribuir aluno
- [x] `PATCH /api/admin/jornadas/[id]/students/[studentId]` — cancelar matrícula e adicionar dias
- [x] `GET /api/admin/jornadas/release-job` — job de liberação progressiva (endpoint HTTP)

### Funcionalidades — Checklist da Seção 14

- [x] Admin consegue criar, editar, publicar e arquivar uma Jornada
- [x] Admin consegue adicionar simulados à Jornada (incluir existente)
- [x] Admin consegue reordenar simulados via drag-and-drop (framer-motion `Reorder`)
- [x] Simulados têm botão "Incluir em Jornada" **na listagem** (`/simulados`)
- [ ] Simulados têm botão "Incluir em Jornada" **no detalhe** (`/simulados/[id]`) ← não implementado
- [x] Admin consegue atribuir aluno a uma Jornada publicada
- [x] Sistema calcula datas de liberação corretamente **sem `exam_date`** (`intervalo = meses×30 / total`)
- [x] Sistema calcula datas de liberação corretamente **com `exam_date`** (`intervalo = (exam_date - 7d - started_at) / total`)
- [x] E-mail de boas-vindas disparado assincronamente na atribuição (via Resend)
- [x] Job de liberação progressiva implementado e idempotente
- [x] E-mail de liberação disparado assincronamente quando simulado é liberado (via Resend)
- [x] Admin consegue cancelar matrícula de aluno
- [x] Admin consegue adicionar dias ao `expires_at` de uma matrícula
- [x] Admin vê progresso dos alunos na tela da Jornada (`completed / total`)
- [x] Validações de negócio implementadas nas APIs (publicar sem simulado, effective_end_date < hoje, aluno já matriculado, etc.)
- [ ] **Validações testadas** ← sem testes automatizados

### Implementado após Sprint B

- [x] **Edição de dados do aluno** — campos nome, telefone, CPF, observações e concursos de interesse editáveis pelo admin em `/admin/alunos/[id]`
- [x] **Histórico de atividades** — tabela `student_activity_log` com timeline visual na página do aluno
- [x] **Log de edição de campos** — registra campo, valor anterior e novo valor
- [x] **Log de mudança de status** — registra transição de status do aluno
- [x] **Log de atribuição de jornada** — registra início, expiração e quantidade de simulados
- [x] **Log de cancelamento de jornada** — registra qual jornada foi cancelada
- [x] **Log de extensão de prazo** — registra prazo anterior, novo prazo e dias adicionados
- [x] **Log de conclusão de simulado** — registra acertos, percentual e tempo gasto
- [x] **Jornadas inscritas** — seção na página do aluno com progresso e barra percentual
- [x] Migration `008_student_activity_log.sql` criada e aplicada

### Pendências identificadas no Sprint B

- [ ] Botão "Incluir em Jornada" na página de detalhe do simulado (`/simulados/[id]`)
- [ ] Botão "Atribuir a Jornada" no perfil do aluno (`/admin/alunos/[id]`) — previsto na spec seção 3.1
- [ ] Recálculo de `scheduled_release_at` ao editar `exam_date` com alunos ativos — spec seção 2.4
- [ ] Reenvio manual de e-mail de boas-vindas da Jornada pelo admin — spec seção 5
- [ ] Migration aplicada no Supabase (production/staging)
- [x] Cron declarado em `vercel.json` para chamar `/api/admin/jornadas/release-job` uma vez por dia às 04h00 de Brasília (`07:00 UTC`), protegido por `CRON_SECRET` e compatível com o limite diário atualmente aplicado pela Vercel ao projeto; torna-se ativo após o próximo deploy de produção aprovado.

### Páginas implementadas

- [x] `/admin/jornadas` — listagem com filtros por status e busca por nome
- [x] `/admin/jornadas/nova` — formulário de criação com preview de `effective_end_date`
- [x] `/admin/jornadas/[id]` — detalhe com info, simulados e tabela de alunos com progresso
- [x] `/admin/jornadas/[id]/editar` — abas Informações + Simulados com drag-and-drop
- [x] Sidebar — grupo "Jornadas" com ícones MapPin e Pencil

---


### Ajuste do Sprint Raio-X de Provas — 2026-05-29

- [x] Nome da análise gerado automaticamente no padrão `RaioX - Prova - [Concurso] - [Cargo] - [Ano] - [Banca]`.
- [x] Campo manual de nome da análise removido da tela de nova análise.
- [x] Nova análise agora carrega bancas cadastradas de `exam_boards`.
- [x] Banca da análise passa a ser selecionada por busca na própria tela.
- [x] Caso a banca não exista, a tela permite cadastrar e selecionar usando `/api/admin/exam-boards`.
- [x] API de análise reforçada para sempre derivar o título no backend a partir dos metadados informados.


### Ajuste do Sprint Raio-X de Provas — 2026-05-30

- [x] Caixa de banca reduzida: busca + tag verde de selecionada + resultados + cadastrar banca.
- [x] Removido card marrom duplicado da banca selecionada.
- [x] Entrada da nova análise alterada para texto bruto no mesmo padrão do Importador com IA.
- [x] Editor compartilhado passou a destacar indicações de imagem e imagens com marca-texto/realce visual.
- [x] Nomenclatura visual alterada para Assunto principal e Tópico de cobrança.
- [x] Raio-X aprofundado para detalhar o que foi cobrado dentro de cada assunto de Informática/TI.
- [x] Rotas de IA do Raio-X passam a usar a mesma configuração de modelo da importação (`OPENAI_IMPORT_MODEL`, com fallback para `OPENAI_MODEL`).

## Sprint C — Jornadas (Aluno) — ⬜ Pendente

Depende de Sprint B concluído e migration aplicada.

Escopo previsto:
- [ ] Página `/minhas-jornadas` — lista as jornadas do aluno com progresso
- [ ] Página `/minhas-jornadas/[id]` — detalhe da jornada com simulados e status de liberação
- [ ] Integração com `/meus-simulados/[id]` — simulados acessados via jornada
- [ ] Estados visuais: `locked`, `locked_late`, `available`, `in_progress`, `completed`, `expired`
- [ ] Atualização de `student_jornada_simulados.status` conforme tentativas do aluno

---

## Sprint D — Google + Pagamento — ⬜ Fase 2 (futuro)

- [ ] OAuth Google com merge de conta por email
- [ ] Integração com gateway de pagamento
- [ ] Checkout e gestão de assinaturas/jornadas pagas

---

## Sprint E — Raio-X de Provas — 🔄 MVP implementado para teste

### Decisões aplicadas

- [x] Nome oficial: **Raio-X de Provas**
- [x] Item separado no menu lateral
- [x] MVP sem upload de PDF; entrada inicial por texto bruto, no mesmo padrão do Importador com IA
- [x] Preparado para múltiplas disciplinas no futuro; padrão atual: Informática/TI
- [x] Campos do cabeçalho: Concurso, Cargo, Ano e Banca
- [x] Questões fora da disciplina selecionada devem ser ignoradas pela IA
- [x] IA tenta sugerir gabarito, com edição manual pelo professor
- [x] Opção de marcar questão como anulada
- [x] Editor aceita imagens inline onde o professor colocar
- [x] Badge para questão com imagem/análise visual
- [x] Dashboard com Mapa de Cobrança por assunto principal, tópico de cobrança e conhecimentos cobrados
- [x] Questões exibidas em cards no padrão operacional do Importador com IA
- [x] Ações por questão: Enviar para revisão, Publicar, Descartar, Criar variações
- [x] Seleção em massa com barra fantasma
- [x] Seção final de Clones da Prova preparada como “Em breve”

### Arquivos criados/alterados

- [x] `RODAR-NO-SUPABASE/011_raio_x_provas.sql`
- [x] `app/admin/raio-x-provas/*`
- [x] `app/api/admin/exam-analyses/*`
- [x] `app/components/Sidebar.tsx`
- [x] `app/components/AppShell.tsx`
- [x] `docs/INDICE_FUNCOES_SISTEMA.md`

### Pendências de teste

- [ ] Rodar migration `011_raio_x_provas.sql` no Supabase
- [ ] **Rodar migration `014_raio_x_visual_status.sql`** — enquanto não rodar, análise de prova usa workaround com valores antigos da constraint
- [ ] **Rodar migration `015_exam_contests_positions.sql`** — enquanto não rodar, botão "Cadastrar cargo/concurso" exibe erro explicativo ao usuário
- [ ] Testar análise com `OPENAI_API_KEY` configurada
- [ ] Testar questão com imagem colada no editor
- [ ] Testar envio para revisão exigindo assunto selecionado
- [ ] Testar geração de variações por questão
- [ ] Implementar futuramente geração real de clones da prova

---

## Sprint Raio-X de Provas — atualização de fluxo de revisão — ✅ Implementado em 2026-05-30

- [x] Nova análise agora possui campo de observações iniciais do professor.
- [x] Tela de criação exibe processamento premium com etapas, barra de progresso e botão "Ver questões analisadas" ao concluir.
- [x] Tela de detalhe reorganizada em dois modos: "Revisar questões" e "Ver Raio-X final".
- [x] Revisão passou a exibir uma questão por vez, com navegação por questão e progresso.
- [x] Cada questão possui caixa editável de classificação: assunto no banco, assunto principal, tópico de cobrança, dificuldade, perfil da cobrança e parecer do professor.
- [x] Raio-X final fica em card único, com texto editável pelo professor.
- [x] Botão "Refazer análise" oferece duas opções: refazer apenas o Raio-X ou refazer análise completa.
- [x] Prompt do Raio-X não tenta mais falar sobre adiamentos/cancelamentos; usa apenas dados informados e observações do professor.
- [x] Importador com IA recebeu opção "Prova completa" nos assuntos padrão para uso em textos de prova inteira.
- [x] Migration `013_raio_x_fluxo_revisao_final.sql` criada para adicionar `teacher_opinion` às questões analisadas.


### Ajuste Raio-X — normalização, progresso e status visual — ✅ Implementado

- [x] Campo de banca ajustado para autocomplete compacto, sem card/listagem permanente.
- [x] Concurso, Cargo, Ano e Banca normalizados no frontend e reforçados no backend.
- [x] `visual_analysis_status` padronizado para `none | pending | applied | review_required | failed`.
- [x] Criado SQL `014_raio_x_visual_status.sql` para corrigir a constraint do Supabase e migrar valores antigos.
- [x] Tela de processamento do Raio-X agora exibe barras individuais por tarefa com percentual.
- [x] Em caso de erro, o processamento informa a etapa, mantém contexto e oferece **Tentar novamente** ou **Voltar para edição**.

---

## Atualização — Raio-X: excluir análise + filtros na listagem + autocomplete concurso/cargo + C/E premium — ✅ Implementado em 2026-05-30

- [x] `DELETE /api/admin/exam-analyses/[id]` — exclui análise e suas questões analisadas.
- [x] Botão "Excluir" na listagem: hover na linha, confirmação inline.
- [x] Botão "Excluir" no detalhe: topo direito, confirmação em linha antes de redirecionar.
- [x] Filtros na listagem (Concurso, Cargo, Banca, Ano): dropdowns gerados dos valores existentes; "Limpar filtros" quando ativo.
- [x] Nova análise: Concurso e Cargo usam `FieldSearch` (autocomplete com sugestões do banco, digitação livre aceita).
- [x] Alternativas C/E no QuestionCard do Raio-X: corujinha na correta, Certo correto = verde, Errado correto = vermelho; hover direcional por tipo.

---

## Atualização — Raio-X: card de questão alinhado ao Importador com IA — ✅ Implementado

- [x] Card de questão do Raio-X compactado.
- [x] Barra de metadados reorganizada no padrão Ano/Banca/Dificuldade/Tipo/Status.
- [x] Editor rico compartilhado mantido, com a mesma base do Importador com IA.
- [x] Alternativas reduzidas e com botão circular para marcação de gabarito.
- [x] Ações movidas para rodapé, reduzindo poluição visual no topo.
- [x] Classificação da IA e Parecer do Professor agrupados em bloco compacto.

---

## Atualização — Normalização de assuntos Microsoft — ✅ Implementado em 2026-06-01

- [x] Regra oficial definida: `Windows` → `Microsoft Windows`, `Word` → `Microsoft Word`, `Excel` → `Microsoft Excel`, `PowerPoint` → `Microsoft PowerPoint`.
- [x] Cadastro individual de assuntos normaliza automaticamente esses quatro nomes antes de salvar.
- [x] Cadastro em massa de assuntos normaliza automaticamente esses quatro nomes antes de salvar.
- [x] Placeholders da área de Assuntos foram ajustados para a nova nomenclatura.
- [x] Prompts e fallbacks do Raio-X de Provas foram ajustados para usar os nomes completos nos assuntos principais.
- [x] Criado SQL `011_renomear_assuntos_microsoft.sql` para renomear/mesclar assuntos existentes no banco e preservar vínculos das questões.
- [x] Índice do sistema atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.

### Pendência operacional

- [ ] Rodar `RODAR-NO-SUPABASE/011_renomear_assuntos_microsoft.sql` no Supabase antes de validar a nomenclatura antiga no banco real.

## Sprint — Importador com IA / Órgão da questão — 🔄 Preparado

- [x] Importador com IA passa a detectar `Órgão:` / `Orgao:` em textos colados de portais como QConcursos.
- [x] Card de importação passa a exibir e permitir edição do campo Órgão antes do envio para revisão.
- [x] Fluxo de salvamento da importação passa a persistir `questions.orgao`.
- [x] Editor central de questão passa a carregar, editar e salvar `orgao`.
- [ ] Rodar migration `012_questions_orgao.sql` no Supabase.
- [ ] Rodar, se desejado, o script destrutivo `013_descartar_questoes_inseridas_hoje.sql` para remover questões criadas hoje.

## Atualização — Banco de Questões: relatório de uso em simulados — ✅ Implementado em 2026-06-08

- [x] `/questoes` passa a carregar os vínculos atuais da questão em `simulado_questions`.
- [x] Card da questão exibe a seção **Uso em simulados** na parte inferior.
- [x] Simulados vinculados aparecem como chips clicáveis para `/simulados/[id]`.
- [x] Questões removidas de simulados não aparecem no relatório, pois a remoção apaga o vínculo em `simulado_questions`.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Documentação de simulados atualizada em `docs/Sprint-simulados.md`.

## Atualização — Edição de Simulados: enviar questão para outro simulado + índice de acertos — ✅ Implementado em 2026-06-08

- [x] `/simulados/[id]/editar` ganhou ação por questão para enviar/vincular a questão a outro simulado sem sair da tela atual.
- [x] A ação mantém a questão no simulado original e usa o endpoint existente `POST /api/admin/simulados/[id]/questions`.
- [x] Cards de questões vinculadas e seletor do banco exibem índice real de acerto por questão.
- [x] O índice considera `simulado_answers` por `question_id`, com acertos, erros, total respondido e percentual.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Documentação de simulados atualizada em `docs/Sprint-simulados.md`.

## Atualização — Raio-X: duplicidade preventiva no banco de questões — ✅ Implementado em 2026-06-08

- [x] `/admin/raio-x-provas/[id]` passa a checar duplicidade no banco antes do envio para revisão/publicação.
- [x] A checagem usa `/api/admin/questions/check-duplicate` e considera questões existentes em qualquer status.
- [x] Questões duplicadas mostram aviso no card e ocultam **Publicar** e **Enviar para revisão**.
- [x] O bloqueio posterior via `ignored_temp_ids` do salvamento foi mantido como segunda camada.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Documentação do sprint atualizada em `docs/Sprint-raio-x.md`.

## Atualização — Raio-X Relatório: mapa de cobrança por tópico — ✅ Implementado em 2026-06-08

- [x] A seção **O que foi cobrado dentro de cada assunto** passou a exibir tags em lista com setas.
- [x] O Parecer do Professor deixou de aparecer como tag nos cards de tópico.
- [x] O parecer permanece como insumo editorial do Parecer EstudoTOP do relatório.
- [x] Índice e documentação do sprint atualizados.

## Atualização — Raio-X: recuperar status Revisada sem regenerar — ✅ Implementado em 2026-06-08

- [x] Análises com Raio-X já gerado podem voltar para **Revisada** ao salvar, sem regenerar relatório.
- [x] O botão **Ver Raio-X final** também recupera o status quando as questões ativas estão classificadas/revisadas.
- [x] Questões anuladas continuam sem bloquear a conclusão.
- [x] Índice e documentação do sprint atualizados.


## Atualização — Assuntos: normalização visual de conectivos — ✅ Implementado em 2026-06-10

- [x] Confirmado que a tela `/assuntos` possuía mais de uma renderização do nome do assunto.
- [x] O card fechado/truncado ainda usava `item.name` diretamente, por isso continuava exibindo `Internet E Rede...`.
- [x] Criada/reforçada a função `normalizeDisplayName()` em `app/lib/utils/text.ts` para exibição segura.
- [x] Cards, mensagens e confirmações da página `Assuntos` passaram a usar `normalizeDisplayName()` na exibição.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Não houve alteração de banco de dados nem SQL.

## Atualização — Seletor de questões do Simulado: filtros recolhíveis, cards compactos e modelo — ✅ Implementado em 2026-06-10

- [x] Corrigido erro de runtime em `/assuntos`: `normalizeDisplayName is not a function`.
- [x] A página `/assuntos` agora usa normalização visual local segura para evitar falhas de bundle/hot reload.
- [x] O modal **Selecionar questões** em `/simulados/[id]/editar` ganhou botão para recolher/expandir filtros.
- [x] Os cards do seletor de questões foram compactados apenas nessa tela, com menor fonte e menor espaçamento para caber mais questões na área visível.
- [x] Cada questão do seletor ganhou ação **Usar como modelo**, reaproveitando o fluxo existente de criação manual por modelo.
- [x] A tela `/simulados` passou a manter a sidebar visível: as camadas decorativas do fundo foram alteradas de `fixed` para `absolute`.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md`.
- [x] Não houve SQL nem alteração de banco.

### Ajuste — Seletor de questões do Simulado e Assuntos — 2026-06-10

- [x] Corrigida a rolagem do modal **Selecionar questões**: filtros e cards agora rolam juntos.
- [x] Barra de filtros do seletor agora recolhe de fato e mostra estado compacto.
- [x] Compactação visual do seletor mantida apenas nessa tela.
- [x] Nomes de assuntos no seletor e na página `/assuntos` passam por normalização local segura para exibir conectivos em minúsculo.

## Ajuste — Seletor de questões do Simulado: foco automático nos filtros e dropdown acima dos cards — ✅ Implementado em 2026-06-10

- [x] Filtros multi-seleção do modal **Selecionar questões** agora focam automaticamente o campo de busca ao abrir.
- [x] O usuário pode clicar no filtro e começar a digitar imediatamente, sem segundo clique no campo de busca.
- [x] Dropdowns dos filtros agora ficam acima dos cards de questões e dos botões do card, evitando sobreposição por trás.
- [x] Mantida a regra de compactação apenas nessa tela.
- [x] Não houve SQL nem alteração de banco.

## Sprint E-mails — correção do e-mail institucional de boas-vindas — ✅ Implementado em 2026-06-12

- [x] O reenvio manual em `/admin/alunos/[id]` agora usa o e-mail institucional **"🦉 Você chegou!"**.
- [x] O reenvio deixou de usar o fluxo de primeiro acesso/senha, evitando o envio do e-mail "Seu acesso foi liberado" com login/link indefinidos.
- [x] O template `studentWelcomeTemplate` foi redesenhado com fundo claro, interface clean, card branco, tipografia legível e espaçamento confortável entre parágrafos.
- [x] O cadastro administrativo de aluno também usa o mesmo template institucional de boas-vindas.
- [x] O status `welcome_email_status` passa a ser atualizado para `sent` após envio bem-sucedido e para `failed` em caso de erro.

## Sprint E-mails — reforço do template claro e reenvio institucional — ✅ Corrigido em 2026-06-12

- [x] `studentWelcomeTemplate` foi substituído por uma versão clara, sem qualquer bloco de primeiro acesso, login, senha, link ou botão de definição de senha.
- [x] O corpo do e-mail agora segue exatamente o texto institucional aprovado para o assunto **"🦉 Você chegou!"**.
- [x] `POST /api/admin/students/resend-welcome`, criação administrativa de aluno e helper `sendStudentWelcomeEmail` enviam o mesmo HTML claro e também uma versão `text/plain` do conteúdo.
- [x] O e-mail institucional possui marcador interno `ESTUDOTOP_WELCOME_CLEAN_V3` para diferenciar claramente o template novo de qualquer e-mail antigo em cache ou fluxo de primeiro acesso.

---

## Atualização — Categoria visual das Jornadas — ✅ Implementado em 2026-06-13

- [x] Campo de categoria incluído no modelo de Jornada.
- [x] Categorias oficiais: Área da Saúde, Policial, Tribunais e Administrativo.
- [x] Criação de Jornada permite selecionar a categoria com prévia visual.
- [x] Edição de Jornada permite alterar a categoria.
- [x] Cards da listagem usam a miniatura correspondente à categoria, sem alternância por índice.
- [x] Quatro imagens oficiais adicionadas em `public/jornadas/categories/`.
- [x] APIs de criação e edição validam os valores permitidos.
- [x] Índice funcional e documentação da Sprint Jornadas atualizados.
- [ ] Executar `app/supabase_migrations/011_jornadas_categoria.sql` no Supabase antes dos testes integrados.

---

## Atualização — Admin Simulados/Jornadas — 2026-06-17

- [x] Edição de questão aberta pelo Simulado em modo popup agora salva direto no banco e não exibe botão Publicar.
- [x] Perfil do aluno ganhou modal **Ver cronograma da jornada** dentro de Jornadas inscritas.
- [x] Modal do cronograma mostra datas previstas/reais, status e tentativas por simulado.
- [x] Admin pode liberar manualmente um simulado para um aluno sem alterar as datas dos demais.
- [x] Admin pode reverter liberação manual apenas se o aluno ainda não iniciou/concluiu o simulado.
- [x] Admin pode ajustar tentativas consumidas por aluno/simulado sem apagar histórico real.

---

## Atualização — Padronização de modais de confirmação/aviso/sucesso — ✅ Implementado em 2026-06-22

- [x] Levantamento completo de todos os modais do sistema feito a partir de `docs/INDICE_FUNCOES_SISTEMA.md` (seção 20 — mapa de modais).
- [x] `PremiumModal` (`app/components/ui/PremiumModal.tsx`) passou a ser o componente central para modais de confirmação/aviso/sucesso/erro, com prop `theme` (`"dark"` ou `"light"`) para acompanhar o tema da tela onde é usado, prop `icon` para casos com ícone customizado e `dismissible` para esconder o botão de fechar quando a confirmação é obrigatória.
- [x] Migrados para usar o `PremiumModal` por dentro: `app/questoes/duplicatas/page-client.tsx` (limpeza de duplicatas), `app/assuntos/page-client.tsx` e `app/disciplinas/page-client.tsx` (ativar/inativar/excluir), `app/minhas-jornadas/[id]/page-client.tsx` (aviso de progressão) e `app/meus-simulados/[id]/page-client.tsx` (`FinishConfirm` e `FullScreenModal`, este preservando o ícone grande e a cor do botão por contexto de acerto/erro durante a prova).
- [x] Nenhuma assinatura de função local existente foi alterada — apenas a casca visual interna passou a reaproveitar o componente central.
- [x] Modais com barra de progresso/steps (`questoes/page-client.tsx`, `questoes/gerar-ia/page-client.tsx`), o `DarkOverlay` genérico (`admin/jornadas/[id]/page-client.tsx`) e os modais funcionais de formulário/cronograma (`admin/alunos/[id]/page-client.tsx`) foram deixados de fora desta rodada por decisão do usuário.
- [x] `tsc --noEmit` e `eslint` rodados nos arquivos alterados — sem novos erros introduzidos.
- [x] Índice atualizado em `docs/INDICE_FUNCOES_SISTEMA.md` (seção 20.1, 20.2, 20.3, 20.4 e nova 20.7).

---

## Sprint Resultados — Etapa 1 Parecer da Coruja — ✅ Implementado em 2026-06-24

- [x] Criado documento oficial `docs/Sprint-resultados.md` para centralizar todas as decisões pedagógicas, visuais e técnicas da Sprint Resultados.
- [x] Tela de resultado do aluno passou a usar a Etapa 1 com Coruja por faixa, título dinâmico, resultado numérico, parecer-base, sinais comportamentais e convite para continuar.
- [x] Adicionadas 5 corujas oficiais em `public/images/resultados/`, uma para cada faixa de aproveitamento.
- [x] Implementadas 5 faixas oficiais: 0–10%, 11–40%, 41–74%, 75–99% e 100%.
- [x] Implementados 25 pareceres-base aprovados, com 5 variações por faixa.
- [x] Sinais comportamentais entram depois do parecer-base e respeitam o limite de até 2 sinais positivos e até 2 pontos de atenção.
- [x] Eventos de inatividade superiores a 60 segundos passam a ser registrados durante a execução do simulado.
- [x] Uso da tesourinha passa a ser registrado por questão durante a execução do simulado.
- [x] Anti-cheat detecta outra janela/aplicativo por `window.blur`, com tolerância contínua de 10 segundos, preservando registro imediato para troca de guia/minimização e evitando duplicidade entre eventos.
- [x] Durante o `window.blur`, a prova exibe contagem regressiva central de 10 a 1; voltar ao simulado remove o alerta instantaneamente, e chegar ao fim registra a ocorrência pela API já existente.
- [x] API de resultado passa a retornar métricas comportamentais para alimentar o Parecer da Coruja.
- [x] Detalhe administrativo do simulado passa a exibir tempo médio de resolução junto da nota média.
- [x] Índice atualizado para apontar `docs/Sprint-resultados.md` como fonte oficial da Sprint Resultados.
- [ ] Executar `app/supabase_migrations/014_resultados_behavior_metrics.sql` no Supabase antes dos testes integrados.

### Ajuste — Jornada do aluno: cronograma e resultado — ✅ Implementado

- [x] Tabela **Liberações individuais** em `/minhas-jornadas/[id]` mantém os botões de simulados concluídos alinhados e com mesma largura.
- [x] Simulado concluído exibe **Resolvido** em verde e **Ver resultado** na mesma célula de status.
- [x] Cabeçalho e células do cronograma foram alinhados por coluna para melhorar organização visual.
- [x] Ajuste visual restrito à área do aluno, sem alteração de API, banco ou regra de liberação.

### Ajuste — Edição de Jornada em dark premium — ✅ Implementado em 2026-07-08

- [x] Tela `/admin/jornadas/[id]/editar` ajustada para manter o padrão dark premium de Jornadas.
- [x] Aba Informações convertida para componentes `variant="jornada"`.
- [x] Aba Simulados / alteração de ordem convertida para cards e botões dark premium.
- [x] Nenhuma regra de banco, API ou fluxo de reordenação foi alterada neste ajuste visual.



## Ajuste — Jornada Admin: estados dos simulados no detalhe — ✅ Implementado

- [x] Na tela de detalhe da Jornada, simulados futuros agora aparecem como **Programado**.
- [x] O estado **Bloqueado** deixou de ser usado na lista administrativa geral de simulados da Jornada, pois bloqueio depende da matrícula/progressão individual do aluno.
- [x] Arquivo alterado: `app/admin/jornadas/[id]/page-client.tsx`.

---

## Governança Técnica Oficial — ✅ Implantada em 2026-07-10

- [x] Criada a Constituição Técnica oficial do EstudoTOP Simulados.
- [x] Criada a Política de Git e Versionamento, contemplando os fluxos por ZIP, Codex e Claude Code.
- [x] Criada a Política de Banco de Dados e Migrations.
- [x] Definido `supabase/migrations/` como único diretório oficial para novas migrations.
- [x] Reconhecido o banco Supabase atual como fonte operacional da estrutura em funcionamento.
- [x] Criada a Política de Assets.
- [x] Definido `public/` como única estrutura oficial para assets usados em runtime.
- [x] Criada a Política de Desenvolvimento com as 10 etapas obrigatórias de toda Sprint.
- [x] Criada a Política de Documentação.
- [x] Criada a Política de Deploy.
- [x] Criados os checklists oficiais de Sprint e Deploy.
- [x] Atualizado `docs/INDICE_FUNCOES_SISTEMA.md` com a seção de Governança Técnica Oficial.
- [x] Estabelecido que documentos aprovados permanecem congelados e só mudam quando houver alteração permanente da regra correspondente.
- [x] Nenhuma migration foi criada, alterada ou executada nesta atualização documental.

### Documentos oficiais criados

- `docs/00-CONSTITUICAO-TECNICA.md`
- `docs/01-POLITICA-GIT.md`
- `docs/02-POLITICA-MIGRATIONS.md`
- `docs/03-POLITICA-ASSETS.md`
- `docs/04-POLITICA-DESENVOLVIMENTO.md`
- `docs/05-POLITICA-DOCUMENTACAO.md`
- `docs/06-POLITICA-DEPLOY.md`
- `docs/07-CHECKLIST-SPRINT.md`
- `docs/08-CHECKLIST-DEPLOY.md`

---

## Consolidação — Índices de performance do módulo de questões — ✅ Convertido em migration oficial em 2026-07-10

- [x] O SQL avulso `performance-indexes.sql` (raiz do projeto, órfão, sem referências no código ou documentação) foi convertido em migration oficial.
- [x] Migration criada: `supabase/migrations/20260710120000_add_question_performance_indexes.sql`.
- [x] Finalidade: índices de performance do módulo de questões — filtros da listagem administrativa (`/questoes`), classificação de dificuldade em lote (`classify-difficulty`) e detecção de duplicatas por fingerprint (`exam_board_id`, `question_fingerprint`).
- [x] Conferência somente-leitura em `pg_indexes` do banco operacional realizada antes da conversão: 5 índices já existem com nome e definição idênticos (mantidos com `if not exists`, no-op), 4 ainda não existem (`idx_questions_year`, `idx_questions_status_difficulty`, `idx_questions_no_difficulty`, `idx_questions_board_fingerprint`).
- [x] Índices omitidos por redundância comprovada: `idx_question_subjects_question_id` e `idx_question_subjects_subject_id` — o banco já possui os equivalentes `question_subjects_question_id_idx` e `question_subjects_subject_id_idx`.
- [x] `performance-indexes.sql` removido da raiz, sem cópia paralela.
- [ ] **A migration NÃO foi executada.** Sua execução no Supabase depende de autorização explícita (MIG-012). O banco não foi alterado.

---

## Sprint Segurança do Banco — correções preparadas — 🔄 Migrations criadas em 2026-07-10, aguardando autorização para execução

### Bloqueadores críticos auditados no banco operacional (somente leitura)

1. **`public.admin_update_auth_user_email(uuid, text)`** — SECURITY DEFINER, altera `auth.users`/`auth.identities`, com EXECUTE para PUBLIC, `anon` e `authenticated` (ACL confirmada em `pg_proc`). Permite troca de e-mail de qualquer conta com a anon key (account takeover). Sem consumidores no código atual (alteração de e-mail usa `auth.admin.updateUserById`).
2. **`public.exam_contests`** — policy "Admin full access to exam_contests" (`ALL`, `USING true`, `WITH CHECK true`) + grants completos para `anon`/`authenticated`.
3. **`public.exam_positions`** — policy "Admin full access to exam_positions" idêntica + mesmos grants.
4. **`public.question_alternatives.is_correct`** — policy "Students can read question alternatives" (`SELECT`, `USING true`) + grants completos expõem o gabarito via PostgREST. Nenhum cliente browser consulta a tabela; todo acesso real é server-side (service role).

### Migrations criadas (em `supabase/migrations/`)

- [x] `20260710124000_restrict_admin_update_auth_user_email.sql` — revoga EXECUTE de PUBLIC/`anon`/`authenticated` na RPC e mantém somente `service_role`; não altera a lógica da função.
- [x] `20260710124100_protect_exam_contests_and_positions.sql` — remove as duas policies abertas e revoga todos os grants de `anon`/`authenticated`; RLS permanece habilitado sem policy (mesmo padrão de `20260702140000_protect_simulado_data_tables.sql`); APIs admin seguem via service role.
- [x] `20260710124200_protect_question_alternatives_answer_key.sql` — remove a policy pública de SELECT e revoga todos os grants de `anon`/`authenticated`; preserva a policy administrativa `is_admin()`; alternativas continuam chegando ao aluno pelas APIs `/api/student/**`.

### Impacto esperado

- Nenhum fluxo funcional muda: todas as rotas afetadas usam `createSupabaseAdminClient()` (service role, que bypassa RLS e grants) com `requireAdmin`/`getStudentFromRequest`.
- O que deixa de funcionar é apenas o acesso direto indevido via PostgREST com anon key.

### Estado

- [x] **Migrations executadas manualmente no SQL Editor do Supabase em 2026-07-10**, na ordem 124000 → 124100 → 124200, com autorização do responsável.
- [x] **Validação pós-execução realizada em 2026-07-10** (somente SELECT em catálogos):
  - `admin_update_auth_user_email(uuid, text)` — ACL final `{postgres=X, service_role=X}`: EXECUTE revogado de PUBLIC, `anon` e `authenticated`; exclusivo de `service_role`.
  - `exam_contests` e `exam_positions` — RLS habilitado, **zero policies**, ACL final `{postgres, service_role}` (grants de `anon`/`authenticated` removidos).
  - `question_alternatives` — policy pública "Students can read question alternatives" removida; policy administrativa "Admins can manage question alternatives" (`is_admin()`) preservada; ACL final `{postgres, service_role}`.
  - Fluxos reconfirmados no código: nenhum consumo client-side; tudo via service role (`requireAdmin`/`getStudentFromRequest`); e-mail via `auth.admin.updateUserById`.
- [x] **Os quatro bloqueadores críticos de segurança estão ENCERRADOS.**
- [x] **Banco pronto para preview** (DEP-009 sem pendência crítica conhecida).
- [ ] **Produção ainda não homologada** — dependem: criação de `student_help_messages`, bucket `profile-avatars` + `profiles.avatar_url`, e homologação completa em preview (DEP-003/DEP-012).
- [!] **Ledger:** as versões `20260710124000/124100/124200` **não constam** em `supabase_migrations.schema_migrations` (última entrada: `20260707200751`), pois a execução manual via SQL Editor não registra no ledger da CLI. O ledger já não espelha os arquivos locais (histórico não reproduzível — MIG-008/MIG-009); a estrutura real do banco operacional prevalece como fonte da verdade. Não usar `migration repair` sem decisão explícita.
- Observação de hardening futuro (não bloqueante): `is_admin()` é SECURITY DEFINER sem `search_path` fixado — corrigir em migration própria.

---

## Sprint Login + Sprint Cadastro — ✅ Implementadas e testadas em localhost (2026-07-11/12)

### Sprint Login (visual)
- [x] Página `/login` com logo oficial (`public/images/Logo 04 -transp.png` via `next/image`), frase mantida, card escuro atualizado ("Correção + Resultado + Diagnóstico = Aprovação") e coluna institucional visível no mobile. Autenticação intocada. Ver índice seção 2.0.

### Sprint Cadastro (gestão de alunos)
- [x] **Desativar aluno** (reversível) e **Excluir definitivamente** (irreversível, só sem histórico; 409 `STUDENT_HAS_HISTORY` com dependências) — modais premium + Zona de perigo. Ver índice seção 10.–1.
- [x] `isActiveProfile` corrigido: somente `active` → `profiles.is_active = true`; guards de aluno rejeitam `inactive`.
- [x] Reconciliação de contas incompletas (Auth/profile sem `students`) reutilizando o mesmo UUID — `lib/server/studentAccountRepair.ts`.
- [x] **Aprovação explícita do cadastro** (`POST /api/admin/students/[id]/approve`, idempotente) dispara o e-mail de boas-vindas pela função central `app/lib/server/sendStudentWelcomeEmail.ts`; mudança genérica de status nunca envia e-mail; reativação preservada sem Resend. Ver índice seção 10.–2.
- [x] **Links canônicos de e-mail**: `lib/server/publicAppUrl.ts` (fonte única `NEXT_PUBLIC_APP_URL`, sem fallback para a origem da request). Ver índice seção 11.0.
- [x] Importador com IA corrigido: chamadas a `analyze-batch` e `exam-boards/search` passaram a usar `adminFetch` (401 silencioso eliminado).

### Migration desta atualização
- [x] `supabase/migrations/20260711130000_students_approval_fields.sql` — `students.approved_at`, `approved_by` (FK profiles), `welcome_email_attempted_at`. **Já aplicada manualmente no Supabase em 2026-07-11** (colunas confirmadas por SELECT em catálogo). Como as demais execuções manuais, não consta no ledger da CLI.

### Correção — crash ao abrir o menu abaixo de `lg` (2026-07-12)
- [x] Causa: `app/components/Sidebar.tsx` usava nomes fixos de canal realtime (`sidebar-question-queue-counts`, `sidebar-help-messages-count`). Abaixo de `lg`, o `Sidebar` desktop (oculto por `display:none`, mas montado) e o `SidebarContent` do drawer coexistem; o segundo colidia com o canal já inscrito e o Supabase lançava `cannot add postgres_changes callbacks after subscribe()`, derrubando a página ("This page couldn't load") ao clicar no menu.
- [x] Correção: nomes de canal únicos por instância via `useId()`. Os breakpoints de navegação já eram complementares (`lg`) — nenhum ajuste de responsividade foi necessário; o botão/menu sempre esteve presente em 800px.

### Pendências conhecidas
- [x] Importador: sugestões de tópicos avaliados permanecem acima do card seguinte, e a inclusão do primeiro tópico seleciona automaticamente a questão não duplicada.
- [x] Nova questão: o `RichTextEditor` compartilhado passa a receber sua variante dark, alinhando toolbar e controles ao fundo escuro sem alterar colagem, HTML ou formatação.
- [x] Quatro `fetch` sem Bearer corrigidos com `adminFetch`: carregamento geral dos logs e atividades da sessão em `app/admin/logs/page-client.tsx`, upload de imagem em `app/questoes/nova/page-client.tsx` e geração em `app/questoes/[id]/variacoes/page-client.tsx`.
- [x] `/api/admin/upload-image` implementada com `requireAdmin`, validação de MIME, assinatura binária e limite de 5 MB; upload server-side para o bucket público `question-images` com nome imprevisível e erros sanitizados.
- [x] `supabase/migrations/20260801150000_create_question_images_bucket.sql` aplicada no ambiente pelo responsável em 2026-08-01; consulta somente-leitura confirmou o bucket público `question-images`, limite de 5 MB e MIME types JPEG/PNG/WebP. A execução não foi realizada pelo Codex.
- [ ] `NEXT_PUBLIC_APP_URL` duplicada no `.env.local` (limpar) e definir o domínio público oficial quando existir.
- [x] Lint pré-existente de `app/questoes/nova/page-client.tsx` corrigido pontualmente, sem alteração do fluxo de colagem ou upload de imagens.
- [ ] Dívida já registrada: duplicação `lib/` × `app/lib/`.
## Integridade de contas de alunos — implementação local em 2026-07-13

- Criado `lib/server/studentAccountService.ts` para criação/reconciliação, rollback compensatório, validação de `auth.users + profiles + students`, sincronização de e-mail e erros sanitizados.
- Integrados os fluxos reais de criação administrativa, confirmação do cadastro público, alteração de e-mail e bloqueio de aprovação de conta incompleta.
- Criada a migration não executada `supabase/migrations/20260713090000_student_account_integrity.sql`.
- Criados os scripts `scripts/sql/student-account-integrity-audit.sql` (SELECT) e `scripts/sql/student-account-integrity-cleanup.sql` (controlado, sem Auth e com `ROLLBACK`).
- Criados testes em `tests/student-account-integrity/student-account-integrity.spec.ts`.
- Pendência crítica: a criação histórica de `student_registration_confirmations` não está no histórico SQL local; o baseline remoto deve ser auditado antes de aplicar a migration.
- Nenhuma limpeza de dados, migration, alteração remota ou Auth foi executada nesta implementação.

### Correção do cadastro público em produção — 2026-07-13

- Reproduzido em `simulados.estudotop.com.br`: solicitação do código retornava 200, mas a confirmação retornava 409 `INTERNAL_ERROR` antes da criação da conta.
- Causa confirmada: `auth.admin.listUsers({ perPage: 200 })` retornava 500 quando o lote incluía uma posição defeituosa do Supabase Auth; leituras isoladas confirmaram que as demais posições permaneciam acessíveis.
- `findAuthUserByEmail` agora degrada a consulta do lote com erro para leituras unitárias, ignora apenas posições que o próprio Auth não consegue serializar e continua procurando o e-mail nas demais contas.
- A proteção contra duplicidade permanece no Supabase Auth: se a posição ilegível for justamente a conta procurada, `createUser` rejeita o e-mail existente e o rollback/erro sanitizado continuam preservados.
- Nenhuma migration foi criada, alterada ou executada nesta correção.

### Ajuste do código incorreto no cadastro público — 2026-07-13

- Código de confirmação incorreto agora é informado explicitamente ao usuário.
- O campo é limpo e volta a exibir o placeholder `000000`.
- Um novo código de 6 dígitos é criado e enviado automaticamente; o código anterior só é invalidado depois do envio bem-sucedido.
- Reenvios automáticos repetidos possuem intervalo mínimo de 60 segundos para reduzir abuso do endpoint de e-mail.
- O erro local `Erro inesperado ao iniciar cadastro` foi identificado como ausência de `REGISTRATION_TOKEN_SECRET`; o segredo dedicado foi configurado somente no `.env.local` da estação, sem fallback para service role e sem versionar ou documentar seu valor.
- Nenhuma migration foi criada, alterada ou executada neste ajuste.

### Rastreabilidade de e-mails das Jornadas — 2026-07-13

- O cadastro do aluno passou a listar no card **Sistema** os e-mails de entrada em Jornadas e de liberação de simulados, além do e-mail de boas-vindas da conta.
- A inserção na Jornada agora envia duas comunicações distintas quando o primeiro simulado é liberado: entrada na Jornada e liberação do simulado.
- Liberações automáticas, manuais e reenvios validam também erros retornados pelo Resend antes de registrar o envio como concluído.
- Os nomes dos alunos no detalhe da Jornada agora apontam diretamente para o cadastro administrativo correspondente.
- Nenhuma migration foi criada, alterada ou executada neste ajuste.

### Intervalo de e-mails e aviso de duplicidade no cadastro — 2026-07-13

- A entrada em uma Jornada agora aguarda 10 segundos entre o e-mail da Jornada e o primeiro e-mail de liberação de simulado.
- O cadastro público informa explicitamente se o bloqueio ocorreu por e-mail, CPF ou pelos dois campos duplicados.
- A resposta pública informa somente os nomes dos campos conflitantes e não expõe valores nem dados da conta já existente.
- Nenhuma migration foi criada, alterada ou executada neste ajuste.

### Campos obrigatórios no cadastro público — 2026-07-13

- O envio do formulário identifica de uma só vez todos os campos obrigatórios não preenchidos.
- A mensagem informa nominalmente os campos ausentes e todos recebem destaque visual vermelho e `aria-invalid` para acessibilidade.
- O destaque de cada campo é removido individualmente assim que o aluno começa a corrigi-lo; a API preserva a validação no servidor e retorna a lista em `fields`.
- Nenhuma migration foi criada, alterada ou executada neste ajuste.

### Política única e segura de senhas — 2026-07-13

- Criada a política compartilhada `lib/auth/passwordPolicy.ts`: mínimo 8, máximo 64, maiúscula, minúscula, número, símbolo, sem sequência numérica crescente/decrescente de três dígitos, sem repetição tripla e sem dados pessoais normalizados.
- Criado `PasswordRequirements` e aplicado em `/alterar-senha`, `/primeiro-acesso` e `/redefinir-senha`, com retorno visual dinâmico, acessível e bloqueio do botão até senha e confirmação válidas.
- `complete-password-change`, `first-access` e o novo endpoint `reset-password` validam a mesma política no servidor com dados pessoais obtidos pelo usuário/token real.
- Redefinição e troca obrigatória deixaram de atualizar senha diretamente no navegador; flags auxiliares são alteradas somente depois do sucesso no Supabase Auth, com erro explícito para estado parcial.
- Gerador temporário centralizado, criptograficamente seguro, com mínimo de 12 caracteres e validação pela política. O reset administrativo não retorna mais a senha temporária no JSON.
- Não foram implementadas blacklist de senhas comuns nem expiração periódica. Reutilização não é comparada porque o Supabase não fornece verificação segura da senha anterior sem autenticação; nenhuma senha/hash paralelo é armazenado.
- Não existe atualmente alteração voluntária de senha no perfil; fluxo futuro deverá reutilizar a política central.

### Recuperação de senha somente para alunos aprovados — 2026-07-13

- [x] `/esqueci-senha` passou a usar `POST /api/auth/forgot-password`, sem chamada direta ao Supabase Auth no navegador.
- [x] O envio só ocorre para aluno `active`, com `approved_at`, perfil `student` e perfil ativo; pendentes e contas incompatíveis não recebem link.
- [x] A resposta pública é genérica para não revelar se uma conta existe ou está pendente.
- [x] O link usa a URL pública canônica de `NEXT_PUBLIC_APP_URL` e aponta para `/redefinir-senha`, sem origem local da janela.
- [x] `POST /api/auth/reset-password` revalida a aprovação antes de alterar a senha e não modifica status, ativação ou `must_change_password`.
- [x] Cobertura específica adicionada em `tests/password-recovery/password-recovery.spec.ts`.
- [x] A tela de redefinição processa e aguarda os formatos de callback do Supabase (`code` PKCE, `token_hash`, hash implícito e evento `PASSWORD_RECOVERY`) antes de enviar a nova senha, evitando a falsa mensagem de sessão expirada após abrir um link válido.

### Mensagem de login para aluno bloqueado — 2026-07-13

- [x] O login verifica `students.status = blocked` antes do redirecionamento de primeiro acesso, encerra a sessão autenticada e apresenta uma mensagem explícita de que o cadastro está bloqueado e o acesso não é possível.
- [x] A mensagem também permanece no ramo de perfil inativo, protegendo estados eventualmente dessincronizados entre `students` e `profiles`.
- Nenhuma migration foi criada, alterada ou executada nesta implementação.

### Correção — Busca de alunos por nome/e-mail/CPF/telefone — 2026-07-13

- **Bug:** na listagem `/admin/alunos`, buscar por termos com pontuação não encontrava o aluno. Ex.: `aluno.teste` não localizava `aluno.teste.redteam@estudotop.com.br`.
- **Causa raiz:** normalização assimétrica em `app/admin/alunos/page-client.tsx`. O termo removia `.`, `-`, `/` e espaços (`search.trim().toLowerCase().replace(/[.\-/\s]/g, "")`), mas nome e e-mail eram comparados apenas com `toLowerCase()` (sem remover pontuação). Além disso, telefone não era pesquisado e acentos não eram tratados.
- **Comportamento anterior:** `aluno.` encontrava, `aluno.teste`/`alunoteste` não; acentos e telefone não funcionavam.
- **Comportamento novo:** função pura `normalizeSearchValue()` (remove acentos, minúsculas, mantém apenas `[a-z0-9]`) aplicada ao termo E aos quatro campos (nome, e-mail, CPF, telefone). Busca parcial, sem acento, com/sem formatação de CPF/telefone, case-insensitive, ignorando pontuação. Busca só com pontuação (`...`) é tratada como vazia.
- **Arquivos alterados:** `app/admin/alunos/page-client.tsx` (+ este documento e o índice funcional).
- **Testes:** unitário da função (10/10 casos) + UI real em localhost contra o banco operacional com o aluno `Aluno Teste RedTeam` — `aluno.`, `aluno.teste`, `alunoteste`, `redteam`, `estudotop`, `72266707558`, `722.667`, `ALUNO.TESTE`, `  aluno.teste  `, e-mail completo → todos encontram; termo inexistente → "Nenhum aluno"; combinação com aba de status coerente (aluno `pending` não aparece em Ativos). tsc e build aprovados.
- **Preservado:** ordenação (valores originais), paginação, contadores, filtros de status, layout. Nenhuma alteração de banco/API.
- Nenhuma migration foi criada ou alterada nesta correção.

### Correção — Zona de perigo (visual) + performance da atribuição a Jornada — 2026-07-13

- **Botões da Zona de perigo** (`app/admin/alunos/[id]/page-client.tsx`): "Desativar aluno" e "Excluir definitivamente" usavam `variant="secondary"` (base `bg-white text-slate-800`, tema claro) e ficavam brancos/pálidos sobre o fundo escuro. Trocados para os variants dark do design system: `dark-warning` (âmbar) e `dark-danger` (vermelho), com fundo translúcido e texto legível. Nenhuma mudança de comportamento.
- **Lentidão ao inserir aluno em Jornada** (`POST /api/admin/jornadas/[id]/students`): a resposta HTTP aguardava, de forma síncrona, o envio do e-mail de boas-vindas, um `setTimeout` artificial de 10s e o loop de e-mails de liberação — ~12s+ de espera. Correção: os inserts (matrícula + agenda + status) e os logs de auditoria continuam antes da resposta; todo o envio de e-mails foi movido para `after()` do Next (segundo plano, pós-resposta). A atribuição agora responde assim que persiste; os e-mails seguem sendo enviados e seu status é rastreado em `student_jornadas`/`student_jornada_simulados` (visível em "Reenvio de E-mails" no cadastro). Resposta deixou de conter `email_summary`.
- Nenhuma migration criada ou alterada. Validado com tsc e build.

### Sprint Jornadas — separação de Duração × Janela de liberação — 2026-07-13

- **Regra estrutural:** `duration_days` passa a controlar SOMENTE a validade/expiração da matrícula; a distribuição dos simulados usa o novo campo `release_duration_days` (sem data da prova) ou `exam_date − 7` (com data da prova, soberana).
- **Migration:** `supabase/migrations/20260713150000_add_jornada_release_duration.sql` — adiciona `release_duration_days` (NOT NULL, `> 0`), backfill `= coalesce(duration_days, duration_months*30)` em todas as jornadas. **NÃO executada** (aguarda autorização).
- **Algoritmo:** `calcReleaseSchedule` (fonte única em `app/admin/jornadas/utils.ts`) — intervalo = janela / (total − 1); a cópia local em `students/route.ts` foi removida; `[id]/route.ts` (recálculo) e `students/route.ts` (atribuição) usam a mesma função.
- **Validação:** sem data da prova, `release_duration_days <= duration_days − 7` (POST, PATCH e ambos os forms). Com data da prova, o campo é desabilitado e ignorado.
- **Recálculo:** PATCH recalcula (síncrono) `scheduled_release_at` apenas dos simulados `locked` de matrículas ativas ao mudar `exam_date`/`release_duration_days`; preserva concluídos/iniciados/liberados.
- **UI:** novo campo "Todos os simulados serão liberados em [dias]" nos forms de criação e edição, abaixo da duração, desabilitado com aviso quando há data da prova.
- **Testes:** algoritmo validado unitariamente nos cenários-chave (sem prova release=90/180, 1 simulado, com prova D-7, entrada < 7 dias, planned>linked). tsc e build aprovados. Testes de UI/integração completos (criar/editar/enrolar/cron/e-mails) pendentes — exigem ambiente com jornadas e alunos de teste.
- Esta entrega inclui a migration `20260713150000_add_jornada_release_duration.sql` (não executada).

### Correção — expires_at das matrículas não acompanhava a duração da Jornada — 2026-07-14

- **Sintoma:** aluno matriculado numa jornada de 10 dias mostrava "acesso até" = entrada + 6 dias. Diagnóstico no banco: todas as matrículas tinham `expires_at = started_at + 6`, enquanto `duration_days = 10` (a jornada fora editada de 6 para 10 dias APÓS as matrículas, `editada_apos_ultima_matricula = true`).
- **Causa raiz:** `expires_at` é gravado uma vez na matrícula (`started_at + duration_days`) e não era recalculado quando o admin alterava a duração da jornada depois.
- **Correção:** `PATCH /api/admin/jornadas/[id]` passa a recalcular `expires_at = started_at + nova duração` das matrículas **ativas** ao alterar `duration_days` (`recalcEnrollmentExpirations`), no mesmo ponto do recálculo de cronograma.
- **Arquivo:** `app/api/admin/jornadas/[id]/route.ts` (+ índice funcional). Nenhuma migration.
- **Correção de dados aplicada (autorizada) em 2026-07-14:** UPDATE pontual nas 3 matrículas ATIVAS da "Jornada de Teste" (`3d618a08-...`) — `expires_at = started_at + duration_days` (10). Pablo (início 13/07) → acesso até 23/07; as de 09/07 → 19/07. Matrículas não ativas não foram tocadas.
- **Pendência:** esta correção de código, como toda a Sprint de Jornadas, só passa a valer para EDIÇÕES FUTURAS de duração com a migration `20260713150000` aplicada + deploy.
### Desempenho do editor de simulado — 2026-07-14

- [x] `/simulados/[id]/editar` deixou de carregar e serializar todo o banco de questões na abertura; o carregamento inicial ficou restrito ao simulado, às questões já vinculadas e às taxonomias.
- [x] O banco completo, as métricas de acerto e o mapa de questões por Jornada são carregados sob demanda, em endpoint administrativo protegido, somente ao abrir **Selecionar questões** ou **Criar questão**.
- [x] Filtros, contagens, uso como modelo e exclusão por Jornada foram preservados.

### Cards de simulados clicáveis no detalhe da Jornada — 2026-07-14

- [x] Em `/admin/jornadas/[id]`, clicar em qualquer área do card de um simulado vinculado abre `/simulados/[id]`.
- [x] A navegação vale para simulados liberados e programados, com foco visível por teclado e sem links aninhados.

### TopCoins nos cards de simulados do aluno — 2026-07-14

- [x] Todos os cards em `/meus-simulados` e `/minhas-jornadas/[id]` exibem o ícone e o valor calculado pela regra universal de TopCoins.
- [x] A informação é clicável e abre um modal premium compartilhado em popup global, montado fora do card por portal, explicando a moeda, o cálculo e as futuras vantagens na plataforma.
- [x] O aviso de TopCoins antes de iniciar um simulado reutiliza o mesmo modal.
- [x] O hero de `/extrato-topcoins` explica o que são TopCoins e quais fatores determinam o ganho.
- [x] Nenhum saldo, tentativa, resultado, API ou regra de persistência foi alterado.

### Nova regra oficial de TopCoins por acerto — 2026-07-15

- [x] TopCoins passam a premiar acertos: `correct_count × 4` na primeira tentativa, `correct_count × 2` na segunda e `correct_count × 1` da terceira em diante.
- [x] Cards e tela do simulado exibem o máximo possível da próxima tentativa com a mesma regra.
- [x] Modal e extrato explicam que o aluno parte de zero e acumula moedas por acerto.
- [x] Removidos o desconto por `wrong_count` e os divisores `ceil(total/2)` e `ceil(total/3)`.
- [x] Resultado pedagógico, respostas, notas e submit permanecem inalterados.
- Nenhuma migration foi criada, alterada ou executada.

### Coerência entre Jornadas e Meus Simulados — 2026-07-14

- [x] `/meus-simulados` deixou de exibir simulados provenientes de matrículas de Jornada canceladas ou expiradas.
- [x] A conclusão de uma tentativa sincroniza o item da Jornada para `completed` nas matrículas ativas e válidas.
- [x] O job de liberação reconhece a tentativa concluída como fonte de verdade e corrige vínculos históricos desatualizados antes de liberar o próximo item elegível.
- [x] A progressão usa regra mista: a conclusão libera imediatamente o próximo item se a data prevista já chegou; o cron diário das 04h00 atua como contingência quando a conclusão ocorreu antes da data.
- [x] Data vencida sem conclusão do simulado anterior não libera o item; foi removida a exceção que avançava pela data do item seguinte ou por ser o último da Jornada.
- [x] A liberação imediata usa transição atômica e dispara o e-mail do novo simulado em segundo plano, preservando idempotência.
- Nenhuma migration foi criada, alterada ou executada nesta implementação.

### Reset administrativo de senha no cadastro do aluno — 2026-07-14

- [x] A Zona de perigo de `/admin/alunos/[id]` ganhou o botão **Resetar senha** antes de desativar e excluir, com confirmação premium.
- [x] A senha atual é invalidada, `must_change_password` é marcado e o aluno recebe um link de 72 horas para criar uma nova senha; nenhuma senha é exibida ou retornada ao administrador.
- [x] O token do reset preserva o status da conta: concluir a nova senha não ativa, reativa ou desbloqueia o aluno.
- [x] O reset administrativo invalida links anteriores antes de gerar o novo token e identifica o e-mail com a data e hora da solicitação, evitando o uso acidental de botões antigos agrupados pelo cliente de e-mail.
- [x] Erros do Supabase Auth e do Resend são sanitizados; respostas de erro do Resend são verificadas antes de registrar o envio como concluído.
- [x] Nenhuma migration foi criada ou executada.

### Performance — funções da Vercel co-localizadas com o Supabase — 2026-07-15

- **Motivo:** medição em produção mostrou que `GET /api/student/jornadas` levava ~900ms de mediana mesmo retornando lista VAZIA — overhead fixo por request, não a query (índices ok). Causa principal: `vercel.json` sem `regions` → funções na região padrão da Vercel (US-East), enquanto o Supabase é `sa-east-1` (São Paulo); cada round-trip de auth/DB cruzava o continente.
- **Correção:** adicionado `"regions": ["gru1"]` (São Paulo) ao `vercel.json`, co-localizando as Serverless Functions com o banco. Reduz a latência de rede de TODA chamada de API (aluno e admin), não só Jornadas.
- **Escopo:** somente `vercel.json`. Sem alteração de código, banco, API ou regras. Passa a valer no próximo deploy de produção.
- **Pendência:** confirmar após o deploy que a Vercel aceitou `gru1` no plano atual (se não aceitar, escolher a região disponível mais próxima) e remedir a latência das APIs de Jornadas. As demais recomendações de performance (#2 auth por request, #3 SSR das telas, #4/#5) seguem em aberto.
- **Validação #1:** após o deploy, remedição em produção mostrou `GET /api/student/jornadas` caindo de ~900ms para ~139ms de mediana (6,4× mais rápido). Vercel aceitou `gru1`.
- Nenhuma migration foi criada ou alterada.

### Consistência do zeramento de tentativas nas telas — 2026-07-15

- A conclusão de um simulado passou a depender de tentativa concluída válida (`status = completed` e `counts_toward_limit = true`) no cadastro administrativo, dashboard, lista de Jornadas e detalhe da Jornada do aluno.
- Estados legados em que o contador havia sido zerado sem remover o histórico não exibem mais “Realizado/Resolvido”, nota, conclusão ou progresso apenas porque `student_jornada_simulados` permaneceu como `completed`.
- O zeramento administrativo atual continua removendo integralmente tentativas e dados derivados; anotações e auditoria permanecem preservadas.
- Nenhuma migration foi criada ou alterada.

### Reversão de liberação automática no cronograma individual — 2026-07-15

- O botão **Desliberar** passa a atender liberações automáticas e manuais no cadastro administrativo do aluno.
- A reversão somente é permitida para item `available`, com `released_at`, contador válido zerado e **Total real = 0**. Qualquer registro em `simulado_attempts`, inclusive legado desconsiderado, bloqueia a ação até a limpeza integral do histórico. A operação restaura `locked`, limpa `released_at`, preserva `scheduled_release_at` e registra a ação administrativa.
- O recurso permite remontar com segurança o cenário de teste da regra mista: ao concluir o anterior com a data do próximo já atingida, o próximo deve ser liberado imediatamente, sem aguardar o job das 04h.
- Nenhuma migration foi criada ou alterada.

### Performance #2 — verificação de auth por request paralelizada — 2026-07-15

- **Motivo:** `getStudentFromRequest` (guard usado por 20 rotas `/api/student/**`) fazia 2 round-trips SEQUENCIAIS ao Supabase por request: `auth.getUser(token)` (valida o JWT no GoTrue) e depois a busca na tabela `students`. O segundo só começava após o primeiro terminar.
- **Correção:** os dois passam a rodar em PARALELO via `Promise.all`. Um helper `decodeJwtSub(token)` lê apenas o claim `sub` do JWT (sem verificar assinatura) para pré-buscar o aluno em paralelo com `auth.getUser`. O pré-fetch só é aproveitado depois que `auth.getUser` valida o token E confirma `sub === user.id`; se o `sub` estiver ausente/divergente, faz uma busca sequencial pelo id realmente verificado (fallback).
- **Segurança preservada:** o token continua sendo validado por `auth.getUser` (assinatura + expiração). O `sub` decodificado nunca é confiado sozinho. Testado: sem token → 401; token lixo → 401; token com assinatura adulterada → 401 (mesmo com o `sub` decodificável, o pré-fetch é descartado); token válido → 200.
- **Escopo:** somente `lib/server/supabaseStudentAuth.ts`. Sem alteração de banco, API, contrato de resposta ou variáveis de ambiente. Nenhum novo segredo (evitou-se a alternativa de verificação local do JWT, que exigiria `SUPABASE_JWT_SECRET` e abriria mão de revogação imediata).
- **Impacto:** ganho modesto após o #1 (sobrepõe ~um round-trip de auth, dezenas de ms), sem tradeoff de segurança ou nova dependência.
- Nenhuma migration foi criada ou alterada.

### Sprint Resultados — tentativa atual vs resultado oficial — 2026-07-16

- A página de resultado passou a exibir imediatamente a tentativa recém-finalizada (`?attemptId=` na URL, validado no backend), preservando a primeira tentativa completa válida como resultado oficial quando o acesso é sem `attemptId`.
- Botão do header da página de resultado tornou-se dinâmico: **Voltar para a Jornada** (com contexto `?jornada=`) ou **Voltar para Meus Simulados** (simulado avulso).
- Aba **Desempenho por Assunto**: texto explicativo antes dos cards, exibição integral dos tópicos para revisar (sem truncar em 3 + "+N") e remoção do botão "Ir para revisão" de cada card.
- Página **Meus Resultados** ganhou texto explicando a regra da primeira tentativa completa como resultado oficial.
- Detalhes completos no documento oficial `docs/Sprint-resultados.md` (seção "Atualização 2026-07-16").
- Nenhuma migration foi criada ou alterada.

### Ajuda da Coruja na execução real + modal de preparação do feedback — 2026-07-16

- **Ajuda da Coruja corrigida em `/meus-simulados/[id]`:** `owl_help_enabled` propagado ao cliente (page.tsx, `GET /api/student/simulados/[id]` e snapshot da rota de tentativas); estado restaurado ao retomar tentativa; API `owl-help` passou a rejeitar questões certo/errado e questões com menos de duas alternativas erradas no servidor.
- **Coruja voadora premium:** componente `OwlHelpFlyingPrompt` com regra de 10 segundos na mesma questão, aparição grande no centro com fade, deslocamento até a faixa inferior, pouso com respiração/sombra dinâmica e balão ligado ao bico ("Você tem direito a X ajuda(s). Clique aqui!"). Interações na questão não reiniciam a contagem. Asset oficial `public/images/coruja-ajuda.jpg`.
- **Modal de preparação do feedback:** ao abrir o resultado da tentativa recém-finalizada (`?attemptId=`), o `FeedbackPreparingModal` exibe "Nossas corujas estão reunidas montando seu feedback" com contagem regressiva 5 → 0 e fechamento automático imediato; a contagem roda enquanto o resultado carrega. Acessos sem `attemptId` não exibem o modal.
- Detalhes nos documentos oficiais `docs/Sprint-simulados.md` e `docs/Sprint-resultados.md` (seções 2026-07-16).
- Nenhuma migration foi criada ou alterada.

### Limite manual da Ajuda da Coruja — 2026-07-18

- Admin define um limite inteiro positivo ao habilitar a ajuda; 10% das questões, mínimo 1, é somente sugestão inicial e fallback para simulados antigos sem limite salvo.
- O limite é propagado ao preview, PDF, execução do aluno, snapshot da tentativa, detalhe da Jornada e API `owl-help`; a validação efetiva e a escolha das alternativas erradas continuam no servidor.
- A chamada aparece após 10 segundos na mesma questão, sem reiniciar por mouse, resposta, tesourinha ou caderno, e anima do centro grande com fade até o pouso inferior.
- Migration `supabase/migrations/20260718120000_add_simulados_owl_help_limit.sql` executada com sucesso no banco operacional, conforme confirmação do responsável em 2026-07-19.
- Submit, respostas, timer, anti-cheat, TopCoins, resultado pedagógico e regras de Jornada permanecem inalterados.

### Refinamentos de interface e histórico de e-mails — 2026-07-18

- O limite da Ajuda da Coruja passou a aparecer dentro do próprio card de habilitação, com campo numérico compacto, sugestão discreta e setas premium integradas no lugar do spinner branco nativo do navegador.
- O login ganhou revelação de senha por botão acessível; após 10 segundos a senha volta automaticamente a ficar mascarada.
- O header do aluno não exibe mais a seta de dropdown nem trata o nome como botão enquanto não existir menu associado.
- O resultado do simulado preserva o texto `Tentativa concluída`.
- O modal administrativo **Reenvio de E-mails** ganhou as abas **E-mails** e **Histórico**. A linha do tempo usa registros internos existentes (`student_activity_log`, `admin_audit_logs` e timestamps de alunos/Jornadas/simulados), em ordem cronológica do primeiro envio ao mais recente, sem consultar o provedor e sem criar migration adicional.

### Voltar das instruções retorna à Jornada na aba Simulados — 2026-07-16

- O botão **Voltar** da tela de instruções de `/meus-simulados/[id]` passou a ser dinâmico: com contexto de Jornada (`?jornada=`), volta para `/minhas-jornadas/[studentJornadaId]?tab=simulados` (Etapa 02 · Simulados ativa); simulado avulso continua voltando para `/meus-simulados`.
- `/minhas-jornadas/[id]` aceita `?tab=dados|simulados|resultados|info` como aba inicial, validado no server component; valor ausente/inválido mantém a aba "Sobre".
- Detalhes em `docs/Sprint-simulados.md` (seção 2026-07-16).
- Nenhuma migration foi criada ou alterada.

### Contagem de 10s no modal de preparação + sininho/Ajuda ocultos — 2026-07-16

- A contagem regressiva do modal "Nossas corujas estão reunidas montando seu feedback" passou de 5 para **10 segundos** (constante `FEEDBACK_COUNTDOWN_SECONDS` em `app/meus-simulados/[id]/resultado/page-client.tsx`), com anel de progresso recalibrado.
- O sininho de notificações e o item "Ajuda" foram **temporariamente ocultos** do header do aluno pela flag `SHOW_STUDENT_HELP_MENU = false` em `app/components/Header.tsx`. A Central de Ajuda (modal, APIs e `/admin/ajuda`) permanece implementada; reativação = flag `true`.
- Detalhes em `docs/Sprint-resultados.md` e `docs/Sprint-central-de-ajuda.md` (seções 2026-07-16).
- Nenhuma migration foi criada ou alterada.

### PDF de anotações em Minhas Anotações — 2026-07-17

- O botão "Ver origem" de `/minhas-anotacoes` foi substituído pelo botão **PDF**, que gera e baixa um PDF premium A4 com todas as anotações do aluno, agrupadas por Jornada (com seção "Simulados avulsos") e por simulado, notas renumeradas por simulado, capa oficial (`public/images/minhas-anotações.png`, com fallback premium sem imagem), painel de dados do aluno, marca d'água e rodapé paginado.
- Novo módulo `app/lib/pdf/student-notes-pdf.ts`, no mesmo padrão técnico de `simulado-result-pdf.ts` (`@react-pdf/renderer`). Nenhuma API foi alterada (a Jornada de cada nota já vinha em `GET /api/student/notes`).
- Detalhes na seção 8 do `docs/INDICE_FUNCOES_SISTEMA.md`.
- Nenhuma migration foi criada ou alterada.

### Regra "liberados em X dias" + prévia dos cards da Jornada + quebra de página no PDF — 2026-07-17

- **Semântica oficial (decisão 2026-07-17):** "Todos os simulados serão liberados em X dias" passou a significar que o **último simulado sai no dia X de calendário** (dia da entrada = dia 1); janela efetiva = `release_duration_days − 1` em `calcReleaseSchedule` (fonte única). Data da prova continua soberana e inalterada. Matrículas existentes preservam as datas gravadas; a nova régua vale para novas matrículas e recálculos por edição da Jornada. Textos de ajuda dos formulários atualizados.
- **Cards do detalhe admin da Jornada:** o chip "Liberado no dia X" e a data de liberação passaram a usar `calcReleaseSchedule` (regra oficial com `release_duration_days`/`exam_date`), no lugar da fórmula antiga baseada em `duration_days ÷ total`.
- **PDF de anotações:** cada simulado agora inicia em página nova (exceto o primeiro de cada Jornada, que fica na página do banner).
- Detalhes na seção 9.2.1 e na seção 8 do `docs/INDICE_FUNCOES_SISTEMA.md`.
- Nenhuma migration foi criada ou alterada.

### Entregabilidade de e-mails — remetente respondível, reply-to e assuntos sem emoji — 2026-07-17

- **Contexto:** e-mails da plataforma caindo em spam. Autenticação DNS auditada e OK (DKIM `resend._domainkey`, SPF em `send.estudotop.com.br`/amazonses sa-east-1, DMARC `p=none`); domínio `estudotop.com.br` verificado no Google Postmaster Tools em 17/07.
- Remetente oficial de todos os envios trocado de `noreply@` para **`EstudoTOP <estudotop@estudotop.com.br>`**, com `replyTo` em todos os 12 pontos de envio (welcome, primeiro acesso, registro/confirmação, criação de aluno, jornada, liberações, release-job e reenvios).
- Assuntos sem emoji (prefixos 🦉/🎯 removidos); emojis no corpo dos templates preservados.
- Padrão obrigatório para novos envios documentado na seção 11 do `docs/INDICE_FUNCOES_SISTEMA.md`.
- **Pendências operacionais:** criar/encaminhar a caixa `estudotop@estudotop.com.br`; evoluir DMARC para `rua` + `p=quarantine`; teste pós-deploy via mail-tester e acompanhamento no Postmaster Tools.
- Nenhuma migration foi criada ou alterada.

### E-mail consolidado na matrícula em Jornada — 2026-07-17

- A inserção de aluno pendente em Jornada passou a executar a aprovação formal (`approved_at`, `approved_by`, `students.status`, `profiles.is_active`, auditoria) e gerar link individual de primeiro acesso válido por 72 horas.
- A matrícula envia no máximo um e-mail imediato: pendente recebe aprovação + primeiro acesso + Jornada + simulados disponíveis; aluno já aprovado recebe somente Jornada + simulados disponíveis, sem repetir boas-vindas à plataforma.
- Os avisos separados de “Bem-vindo à Jornada” e “Novo simulado liberado” foram consolidados no momento da matrícula. Simulados liberados posteriormente preservam o aviso individual existente.
- O envio confirmado atualiza o rastreamento da Jornada, da aprovação e dos simulados cobertos; falhas têm a mensagem limitada a 500 caracteres e são registradas sem desfazer aprovação ou matrícula.
- Nenhuma migration foi criada ou alterada.

### Links de e-mail válidos entre localhost e produção — 2026-07-17

- Links próprios de primeiro acesso deixaram de depender do `REGISTRATION_TOKEN_SECRET` do ambiente que iniciou o envio: tokens aleatórios de 256 bits passam a usar SHA-256 portátil no armazenamento e na validação.
- A validação mantém fallback para o HMAC legado, preservando links antigos quando o segredo correspondente estiver disponível; novos links funcionam entre localhost e produção mesmo com segredos diferentes, desde que os ambientes compartilhem o mesmo banco operacional.
- Códigos numéricos de confirmação continuam protegidos por HMAC; links comuns usam `getPublicAppUrl()` e links de recuperação de senha continuam sob emissão/validação do Supabase.
- Teste automatizado comprova que o hash do link permanece igual ao trocar o segredo de localhost pelo de produção.
- Nenhuma migration foi criada ou alterada.

### Rótulos compactos no menu superior do aluno — 2026-07-17

- Os itens `Minhas Jornadas`, `Meus Simulados` e `Minhas Anotações` do header desktop foram reduzidos para `Jornadas`, `Simulados` e `Anotações`; `Meu Painel` e `Resultados` já estavam no formato solicitado.
- Ícones, rotas, estados ativos e os menus lateral/mobile foram preservados.
- O header ganhou três composições responsivas: compacto abaixo de `lg`, duas linhas entre `lg` e `2xl` e uma linha a partir de `2xl`; assim logo, navegação, TopCoins, perfil e saída não se sobrepõem em notebooks.
- O modal explicativo inicial foi reconstruído em cards responsivos: seis novas ilustrações panorâmicas WebP, derivadas dos cartazes originais, são combinadas com títulos e descrições em HTML para manter tipografia legível em qualquer escala.
- Em desktop/notebook, cada etapa usa ilustração e texto lado a lado; em tablet/celular, os blocos são empilhados. O modal respeita a altura útil do viewport e mantém rolagem interna de contingência sem cortar conteúdo ou controles em 1366×768.
- Nenhuma migration foi criada ou alterada.

### Responsividade premium para notebooks 1366px — 2026-07-17

- Criada a camada de densidade visual para a faixa `@media screen and (min-width: 1024px) and (max-width: 1366px)` em `app/globals.css` (bloco final documentado), sem zoom, sem transform e sem alterar a escala tipográfica oficial.
- `AppShell.tsx` ativa a camada: `et-admin-sidebar-slot` reduz a sidebar admin de 288px para 256px apenas na faixa de notebook (sem tocar no arquivo protegido `Sidebar.tsx`) e `et-laptop-density` nos `<main>` do shell admin e da área do aluno reduz apenas os maiores espaçamentos (`p-10`, `p-8`, `p-16`, `px-10`, `px-8`, `py-10`, `py-12`, `gap-8/9/10`).
- As rotas de foco fora do shell — prévia do simulado, execução da prova e resultado — aplicam `et-laptop-density` no container raiz para receber a mesma densidade.
- O modificador `screen` na media query garante que impressão e exportações em PDF permaneçam inalteradas; telas ≥1440px, tablets e mobile não são afetados.
- Ver seção 1.2 do `docs/INDICE_FUNCOES_SISTEMA.md` para regras de manutenção e checklist.
- Nenhuma migration foi criada ou alterada.

### Header do aluno em uma linha e prova compacta em notebooks 1366px — 2026-07-17

- O header desktop da Área do Aluno deixou de quebrar em duas linhas em notebooks: a partir de `xl` (1280px) ele usa uma única linha compacta de 92px (logo, menu, TopCoins, usuário e Sair reduzidos proporcionalmente); a composição de duas linhas ficou restrita a 1024–1279px; em `2xl+` nada mudou.
- O `AppShell` acompanha as novas alturas (88/136/92/112px) no `min-h` do conteúdo do aluno.
- A tela de execução do simulado ganhou densidade de notebook via classes `et-laptop-exam-*` no bloco de banda 1024–1366px do `globals.css`: header da prova com 96px (antes 124px), escudo 56px, título 20px com quebra natural, cards de tempo/progresso com 58px em uma única faixa horizontal, e coluna lateral 310px → 284px (fora do modo foco), dando mais protagonismo à questão.
- O título deixou de usar `truncate` e adota escala menor de 21–26px fora da banda; os cards usam `nowrap` e larguras compactas para não deixar Progresso isolado em uma segunda linha.
- Sem zoom/transform; escala tipográfica oficial, mobile, tablet e telas ≥1536px preservados; nenhuma regra de negócio, API ou fluxo alterado.
- Ver seção 1.2 do `docs/INDICE_FUNCOES_SISTEMA.md`.
- Nenhuma migration foi criada ou alterada.

### Apresentação inicial dos recursos da prova — 2026-07-18

- Novas tentativas em `/meus-simulados/[id]` apresentam um modal premium e responsivo antes da primeira interação, explicando Tesoura, Ajuda da Coruja e Caderno com uma recriação HTML/CSS da tela, hotspots numerados e linhas vetoriais.
- Os callouts foram refinados com curvas sólidas, gradiente, contorno, glow e pontas alinhadas aos controles. O mock da Tesoura reproduz sua posição real antes da letra, seus estados de hover/eliminação e traz instrução explícita sobre como fazê-la aparecer.
- A entrada do modal usa aproximação central com overshoot e clarão laranja para ganhar destaque, preservando abertura direta quando `prefers-reduced-motion` estiver ativo.
- A confirmação é registrada por tentativa no `sessionStorage`; retomadas na mesma sessão do navegador não reapresentam o tutorial, enquanto uma nova sessão pode apresentá-lo novamente. O modal é bloqueante, acessível, não fecha por backdrop/Escape e respeita movimento reduzido.
- O timer oficial continua sincronizado com o `expires_at` do servidor. O tempo de resposta da primeira questão e a espera de 10 segundos da Coruja começam após a confirmação do tutorial.
- Nenhuma migration, API, dependência ou regra funcional da prova foi alterada.

### Coruja selecionada e relógio recolhível no Modo Foco — 2026-07-19

- O selo **Eliminada pela Coruja** permanece visível quando a alternativa afetada já estava selecionada.
- O Modo Foco inicia com o timer recolhido em um ícone premium e inequívoco de despertador; clicar revela o tempo por 5 segundos e depois restaura automaticamente o ícone no mesmo local.
- O relógio fica ancorado ao topo inicial da execução e rola com a página, deixando de permanecer sempre visível.
- Timer oficial, respostas, persistência da Coruja, APIs e regras de tentativa permanecem inalterados.

### Navegação visível em Desempenho por Assunto — 2026-07-19

- A ilustração da Coruja reserva uma faixa superior própria antes do card de desempenho e os controles da etapa ficam em uma camada acima da arte.
- O botão **Anterior** permanece integralmente visível em notebook e desktop sem remover a projeção visual da Coruja.

### Parágrafos do enunciado consistentes entre admin e aluno — 2026-07-19

- O enunciado exibido durante o simulado passou a usar a mesma classe `richtext-editor` do admin e do preview.
- Quebras de linha já existentes no HTML da questão permanecem visíveis mesmo quando estão dentro de uma tag de bloco, sem modificar o conteúdo armazenado, APIs, respostas ou regras da tentativa.

### Instruções e marcadores pré-prova refinados — 2026-07-19

- Os marcadores 2 e 3 do modal de recursos foram aproximados do início das curvas e mantidos dentro da moldura, evitando cortes inferior e lateral em 1366px.
- O card de segurança das instruções passou a orientar que a janela do simulado permaneça maximizada e não seja exibida lado a lado com outra janela.
- Eventos, tolerância de 10 segundos e demais regras do anti-cheat permanecem inalterados.

### Cards de Desempenho por Assunto sem truncamento — 2026-07-19

- Em 1366px, os cards passam a ocupar duas colunas, preservando três colunas somente a partir de 1536px.
- Nomes de assunto deixam de usar limite de duas linhas e tópicos extensos passam a quebrar em chips de altura flexível, mantendo todo o texto visível.
- Cálculos, agrupamentos, consolidação semântica e origem dos tópicos permanecem inalterados.

### Remoção da sugestão de IA para Tópicos avaliados no Importador — 2026-07-31

- `app/api/admin/questions/import/analyze/route.ts` e `app/api/admin/questions/import/analyze-batch/route.ts` deixaram de pedir `evaluated_topics` ao modelo (prompt e schema JSON) e passam a retornar sempre `evaluated_topics: []` por questão analisada, para não gastar tokens em um recurso considerado pouco assertivo pela IA.
- O campo **Tópicos avaliados** continua existindo no card de importação (`EvaluatedTopicsInput`) e passa a exigir preenchimento manual do admin; a validação que bloqueia o envio para revisão sem tópico informado não foi alterada.
- Nenhuma outra rota que usa IA no sistema foi alterada, incluindo a detecção de tópicos avaliados para questões já existentes (`api/admin/questions/[id]/detect-evaluated-topics/route.ts`), usada fora do fluxo de importação.
- Nenhuma migration foi criada ou alterada nesta atualização.
- `npx tsc --noEmit` e `npm run build` executados sem erros após a alteração.

### Navegação por teclado nos seletores de busca (combobox) — 2026-08-01

- Identificado que o seletor de assuntos (`SubjectMultiSelect`) e outros seletores no mesmo padrão ("digite para filtrar" + lista de sugestões) só permitiam selecionar um item com o mouse; as setas do teclado não navegavam pela lista aberta.
- Corrigidos com navegação por teclado (`ArrowUp`/`ArrowDown` para destacar, `Enter` para confirmar, `Escape` para limpar o destaque), seguindo o padrão já existente em `EvaluatedTopicsInput.tsx`: `SubjectMultiSelect.tsx`, `SearchableSelect.tsx` (dark e light), `EntitySearch`/`BoardSearch` em `raio-x-provas/nova`, `FilterSelect` em `raio-x-provas` (listagem), `BoardFilterDropdown`/`OrgaoFilterDropdown`/`SubjectFilterDropdown` em `questoes/page-client.tsx` e suas cópias locais em `questoes/revisar/page-client.tsx`, e a busca de banca por questão em `questoes/importar/page-client.tsx`.
- Componentes com mais de uma instância simultânea na mesma tela (`SubjectMultiSelect`, `SearchableSelect`, `EntitySearch`, `FilterSelect`) passaram a gerar `id`s de listbox únicos via `useId()` para não colidir no DOM.
- Deixado fora do escopo por decisão do usuário: `SimpleSelectDropdown` e `YearFilterDropdown` (botão que abre lista fixa, sem campo de busca — situação diferente da relatada).
- Achado registrado sem correção: `FieldSearch` em `raio-x-provas/nova/page-client.tsx` é código morto (definida, nunca usada).
- Nenhuma migration foi criada ou alterada nesta atualização.
- `npx tsc --noEmit` e `npm run build` executados sem erros; `npx eslint` nos 7 arquivos alterados sem nenhum erro/warning novo em relação à base antes da alteração (contagem idêntica arquivo a arquivo).

### Sugestões confiáveis de tópicos avaliados no Importador — 2026-08-01

- O catálogo de tópicos ativos passou a ser armazenado em cache por assunto e requisições simultâneas são compartilhadas entre os cards do importador, evitando carregamentos repetidos e sugestões ocasionalmente indisponíveis.
- `EvaluatedTopicsInput` agora mostra o carregamento, informa falhas sanitizadas e oferece **Tentar novamente** sem impedir o preenchimento manual.
- Tópicos digitados manualmente passam a integrar imediatamente o catálogo temporário compartilhado por assunto e ficam disponíveis nas sugestões dos outros cards da mesma tela antes do envio para revisão. O salvamento da questão e a sincronização existente com a tabela `topics` permanecem inalterados.
- Correspondências exatas e nomes iniciados pelo termo digitado ganharam prioridade na lista de até seis sugestões.
- API, banco, autenticação, validação e salvamento permaneceram inalterados. Nenhuma migration foi criada ou alterada nesta atualização.

### Contagem, questões vinculadas e exclusão de tópicos — 2026-08-14

- `/topicos` passa a paginar a leitura de todas as questões para calcular o uso sem o limite padrão de consulta do Supabase.
- Nome e contagem do tópico abrem a lista completa das questões vinculadas, com código, status e acesso à edição; assim questões em revisão, prontas para publicação ou arquivadas deixam de parecer vínculos invisíveis.
- A verificação administrativa de exclusão também percorre todas as páginas no servidor. Tópicos sem questões podem ser excluídos diretamente no modal; tópicos em uso continuam protegidos.
- O popup de uso de `/topicos` mostra todas as questões vinculadas em sequência, já abertas no editor dark oficial. Cada salvamento atualiza localmente vínculos e contagens e remove da lista a questão que deixou de pertencer ao tópico; fechar o popup preserva disciplina, assunto e busca selecionados.
- O editor e `PATCH /api/admin/questions/[id]` já impedem salvar uma questão sem ao menos um tópico avaliado e permanecem como a fronteira oficial dessa validação.
- Nenhuma migration foi criada ou alterada nesta atualização.

### Persistência de tópicos no envio para revisão — 2026-08-14

- `POST /api/admin/questions/import/save` passa a confirmar explicitamente os tópicos na tabela `topics` assim que a questão é criada como `pending_review`, sem aguardar publicação.
- A sincronização usa assunto + nome normalizado, não duplica tópicos existentes e reativa um tópico compatível que estivesse inativo.
- O trigger existente continua como garantia atômica do banco; a confirmação no Route Handler protege também ambientes em que esse trigger esteja ausente ou desatualizado.
- Se os tópicos não puderem ser persistidos, a questão recém-criada é removida e o item retorna como falha, sem sucesso parcial.
- Nenhuma migration foi criada ou alterada nesta atualização.

### Lista completa de tópicos ao focar o seletor — 2026-08-16

- O campo compartilhado de **Tópicos avaliados** passa a abrir, ao receber foco, todos os tópicos ativos ainda não selecionados para o assunto da questão, sem exigir digitação inicial.
- Conforme o administrador digita, a lista é filtrada em tempo real. A lista completa possui rolagem e preserva seleção por mouse, navegação por teclado, preenchimento manual, cache por assunto e variantes clara/escura.
- A alteração vale para todos os fluxos que usam `EvaluatedTopicsInput`, incluindo importação, criação, edição, revisão, banco de questões, geração por IA e criação de questão em simulado.
- Nenhuma migration foi criada ou alterada nesta atualização.

### Redesign dark premium da gestão de Tópicos — 2026-08-16

- `/topicos` passa a usar hero institucional dark, formulário lateral de criação e painel principal de gestão em glassmorphism, com filtros agrupados, tabela refinada, chips de nome, badges de status, mini-card de uso e ações compactas.
- O estado vazio e a composição responsiva foram ajustados para desktop, notebook, tablet e mobile, preservando o overflow horizontal controlado da tabela quando necessário.
- Criação, listagem, busca, filtros, edição inline, ativação/inativação, exclusão protegida, mensagens, popup de questões vinculadas, API, autenticação e regras de negócio permanecem inalterados.
- Nenhuma migration foi criada ou alterada nesta atualização.

### Padronização dark premium de Tópicos, Assuntos e Disciplinas — 2026-08-16

- `/assuntos` e `/disciplinas` passam a usar a mesma linguagem visual de `/topicos`: hero institucional, formulário lateral compacto, painel principal glass, filtros agrupados, botão laranja com microinteração, estados vazios e cards internos dark responsivos.
- Os modais de feedback, confirmação, ativação/inativação e exclusão de `/topicos` declaram o tema black explicitamente; as confirmações de `/assuntos` permanecem no padrão black oficial e as de `/disciplinas` deixam o tema light para usar `PremiumModal theme="dark"` com ações dark.
- Criação, edição, busca, filtros, status, contagens, vínculos, validações, APIs administrativas, autenticação e regras de exclusão foram preservados.
- Nenhuma migration foi criada ou alterada nesta atualização.

### Padronização dark premium de Bancas — 2026-08-16

- `/bancas` passa a compartilhar a linguagem visual de Tópicos, Assuntos e Disciplinas: hero institucional com ação de nova banca, painel lateral compacto de busca/contagem, painel principal glass, cards dark responsivos e estado vazio premium.
- `/bancas/importar` passa a usar o mesmo fundo, hero, painel glass, campo multilinha dark, alerta âmbar de equivalências, ação primária com gradiente laranja e modal black para feedback de sucesso ou erro.
- Os modais de feedback e exclusão declaram `PremiumModal theme="dark"`; cancelar e excluir usam as variantes dark oficiais.
- Busca, acesso às questões, importação de bancas, exclusão com movimentação segura para a banca `ANÔNIMA`, API administrativa, autenticação e regras de negócio permanecem inalterados.
- Nenhuma migration foi criada ou alterada nesta atualização.

### Rascunho do importador sincronizado entre dispositivos — 2026-08-14

- O rascunho local de `/questoes/importar` continua ativo e passa a ser sincronizado com o servidor após as edições.
- Ao acessar em outro computador ou perfil de navegador com o mesmo administrador, o sistema oferece a retomada da versão remota; quando há versões local e remota, prevalece para oferta a mais recente pela data de salvamento.
- A API `/api/admin/import-draft` deriva o proprietário da sessão administrativa, limita o payload a 5 MB e não aceita `admin_id` do cliente.
- Limpar, descartar ou concluir todo o lote remove as cópias local e remota. Falha na sincronização remota mantém o funcionamento local.
- Migration criada: `supabase/migrations/20260814180000_create_admin_drafts.sql`. Ela não foi executada nesta atualização.

### Correção da contagem Aguardando revisão no Banco de Questões — 2026-08-17

- O dashboard de `/questoes` passa a consultar também a contagem exata de `pending_review`, eliminando a divergência em que o badge **Revisar** da sidebar mostrava questões pendentes e o card **Aguardando revisão** permanecia em zero.
- A listagem padrão continua excluindo `pending_review` e `ready_to_publish`; o fluxo de revisão permanece exclusivamente em `/questoes/revisar`.
- Sidebar, APIs, banco, migrations, filtros e regras de status não foram alterados.
- Nenhuma migration foi criada ou alterada nesta atualização.

### Acesso Ajuda reexibido no menu superior do aluno — 2026-08-17

- O item **Ajuda** voltou a aparecer no menu superior desktop da área do aluno usando o botão, ícone, estilo e integração já existentes em `Header.tsx`.
- O clique continua acionando `onOpenHelp` no `AppShell` para abrir `HelpCenterModal` sem navegação; fechar preserva a rota atual.
- O sininho de notificações permanece oculto por condição independente. Central, APIs, tickets, notificações, painel administrativo, autenticação e autorização não foram alterados.
- A Sprint restaura somente o acesso ao modal e não declara os demais problemas conhecidos da Central de Ajuda como resolvidos.
- Nenhuma migration foi criada ou alterada nesta atualização.

### Tickets de Ajuda — reconciliação aplicada em 2026-08-18

- O banco operacional respondeu `PGRST205` para `public.student_help_messages`; essa ausência explica conjuntamente as falhas de envio, histórico, painel administrativo e badge.
- A migration consolidada `supabase/migrations/20260817183516_reconcile_help_tickets.sql` foi executada pelo responsável em 2026-08-18, conforme confirmação registrada no fechamento. Ela cria/reconcilia a tabela, preserva registros históricos e acrescenta o motivo do contato.
- O modal do aluno exige motivo e mensagem, usa reCAPTCHA v3 no envio e apresenta erros específicos. As variáveis esperadas são `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` e `RECAPTCHA_SECRET_KEY`.
- O painel administrativo passa a se chamar **Tickets de Ajuda**, filtra por motivo e mantém os fluxos de resposta. O badge usa a API administrativa protegida, sem acesso direto à tabela pelo browser.
- Autenticação, autorização e ownership permanecem derivados no servidor. A resposta do admin só atualiza ticket aberto; a leitura e o reconhecimento do aluno continuam restritos ao próprio aluno.
- Estado: migration aplicada e variáveis de reCAPTCHA configuradas nos ambientes local e Vercel Production, conforme confirmação do responsável em 2026-08-18. Permanece pendente a homologação funcional ponta a ponta após o push antes de declarar a Central de Ajuda operacional em produção.

### Tickets de Ajuda — refinamento completo preparado em 2026-08-18

- Criada, sem execução, a migration `supabase/migrations/20260818071017_evolve_student_help_tickets.sql`: número permanente concorrente, conversa multi-turno, status encerrado, leitura separada aluno/admin, nota interna, contexto técnico e timeline operacional, com backfill dos tickets existentes.
- O aluno passa a ver uma Central de Ajuda clara e compacta, abrir detalhes no mesmo modal, continuar conversas respondidas e consultar tickets encerrados. Novo atendimento mantém reCAPTCHA; continuação não solicita novo desafio.
- O painel admin passa a usar fila compacta paginada, busca, filtros, quatro abas e detalhe sob demanda. Respostas administrativas podem ser editadas com auditoria; encerrar/reabrir permanece ação administrativa confirmada.
- O alerta identifica e abre o ticket exato. O badge administrativo continua contando tickets abertos, enquanto o indicador de novidade usa `admin_seen_at`.
- Autenticação, autorização, ownership e autoria continuam validados no servidor. Nenhuma regra administrativa foi exposta ao cliente.
- Em 2026-08-18, a estrutura da nova migration foi confirmada como disponível no banco operacional por consulta somente leitura. Permanece pendente homologar os fluxos aluno/admin e a responsividade em ambiente integrado.

### Central de Ajuda — indicadores de novidade e filtros premium em 2026-08-18

- O item **Ajuda** do header do aluno passa a sinalizar respostas ainda não vistas com ponto laranja no próprio ícone.
- O badge administrativo passa a representar tickets novos para o admin, e não todos os tickets abertos. A fonte é `counts.new`, calculada por `status = open` e `admin_seen_at = null`.
- Motivo e Período em `/admin/ajuda` passam a usar dropdowns dark premium consistentes com os demais módulos administrativos.
- Nenhuma alteração de banco, migration, autenticação ou autorização foi necessária.

### Central de Ajuda — alerta do aluno atualizado em tempo de sessão em 2026-08-18

- Corrigida a causa do indicador ausente quando o admin respondia enquanto o aluno permanecia conectado: a consulta ocorria somente ao carregar sessão e perfil.
- O `AppShell` agora atualiza respostas não vistas imediatamente, a cada 30 segundos, ao recuperar foco/visibilidade e em mudanças de rota.
- Nenhuma alteração de API, banco, migration, autenticação ou autorização foi necessária.

### Rastreamento do vídeo de correção preparado em 2026-08-18

- A página de resultado passa a medir cobertura efetivamente reproduzida em HTML5, YouTube e Vimeo, acumulando intervalos distintos e desconsiderando seek.
- O limiar administrativo é exatamente 20%. Sem vídeo, o perfil mostra `-`; com vídeo abaixo do limiar, `Não assistiu`; ao atingir o limiar para a identidade atual, `Assistiu`.
- O perfil `/admin/alunos/[id]` consulta os progressos do aluno em lote, sem N+1, e preserva a regra existente do primeiro resultado oficial válido.
- A API deriva o aluno da sessão autenticada, exige tentativa concluída e nunca aceita `student_id`, percentual pronto ou identidade do vídeo vindos do cliente.
- Migration `supabase/migrations/20260818153000_create_correction_video_progress.sql` executada manualmente pelo responsável no Supabase operacional em 2026-08-18. A execução não foi realizada pelo agente.

### Meu Perfil do aluno implementado em 2026-08-18

- Criada a rota clean `/meu-perfil`, acessível pelo bloco de identidade do header desktop, pelo ícone de perfil no header compacto e pela opção **Meu Perfil** no menu lateral expansível do aluno.
- O aluno pode atualizar o próprio nome, telefone, foto e concursos de interesse; e-mail e CPF permanecem somente leitura. A API `/api/student/profile` deriva o UUID do token e ignora qualquer tentativa de indicar outro aluno.
- Os painéis de trajetória/Simulados e Jornadas foram removidos de `/meu-perfil`; resultados e Jornadas continuam em suas rotas próprias.
- Central de Ajuda, upload existente e recuperação de senha foram reutilizados. Não foram criados toggles sem persistência, troca direta de e-mail, exclusão automática nem URL fictícia de privacidade.
- Em `/meu-perfil`, a ação **Alterar avatar** abre um catálogo responsivo com 128 ilustrações originais: primeiro 90 corujas EstudoTOP estilizadas e, depois, 38 pessoas diversas. A seleção é validada no servidor por identificador fechado; URLs arbitrárias enviadas pelo cliente são rejeitadas. O upload legado permanece inalterado nos demais pontos que ainda o utilizam.
- Correção de compatibilidade em 2026-08-19: selecionar ou remover um avatar passa a persistir em `students.avatar_url` e sincroniza `profiles.avatar_url` somente quando essa coluna existe. O `AuthContext` usa a API autenticada do aluno para recuperar o avatar no fallback, evitando que ambientes sem a coluna em `profiles` rejeitem a seleção.
- Refinamento em 2026-08-19: a escolha de avatar passou a ser apenas uma pré-seleção local até o clique em **Salvar avatar**; cancelar ou fechar o modal não altera o perfil.
- O quadro **Dados pessoais** passou a iniciar em modo de leitura, com edição liberada somente pelo lápis premium no cabeçalho.
- O modal de interesses passou a pesquisar os órgãos/concursos efetivamente presentes em `questions.orgao`, atualizando o catálogo automaticamente com o banco de questões. Um texto fora da lista pode ser salvo somente em `students.desired_contests`, sem criar registro de catálogo, com limite, normalização e validação server-side.
- Refinamento visual em 2026-08-19: os blocos informativos de **Preferências**, **Privacidade e dados** e **Precisa de ajuda?** foram removidos de `/meu-perfil`. A página foi recomposta com fundo em camadas, cards translúcidos, interesses destacados e métricas com maior hierarquia visual; identidade, edição, segurança, interesses, trajetória, Jornadas e o acesso global à Central de Ajuda permanecem funcionais.
- Nenhuma migration foi criada ou alterada para esta funcionalidade.

### Evento de Simulado preparado em 2026-08-20

- Criada a base do módulo Evento, mantendo o Simulado como motor de questões, tentativas, resultados e TopCoins.
- Criada a role `professor`, com cadastro exclusivo pelo Admin, primeiro acesso, recuperação de senha, área restrita aos Eventos atribuídos, preview sem tentativa real e dashboard operacional com atualização periódica.
- Criado ingresso público por link com intenção opaca persistida no banco e em cookie `HttpOnly`; conta existente só é vinculada após autenticação. Cadastro novo por Evento válido nasce ativo e preserva a origem.
- Tentativas de Evento carregam contexto explícito. Resultado bloqueado continua calculado, mas não é exposto pelas APIs do aluno; TopCoins aguardam a liberação individual definitiva.
- Criadas áreas `/admin/eventos`, `/admin/professores`, `/professor/eventos`, `/evento/[slug]` e `/meus-eventos`, com guards server-side por papel, ownership e atribuição.
- Migration criada: `supabase/migrations/20260820120000_create_simulado_events.sql`. Nenhuma migration foi executada durante a implementação.

### Criação premium de Evento refinada em 2026-08-20

- O formulário de `/admin/eventos` passou ao tema dark premium, com iluminação, glow, estados de foco e composição responsiva coerentes com a área administrativa.
- Clicar em qualquer ponto dos campos de início ou término abre o seletor nativo de data e hora nos navegadores compatíveis.
- Início, término e duração em minutos agora são controlados e sincronizados sem efeitos encadeados: alterar o término recalcula a duração; alterar a duração ou o início recalcula o término. Valores não positivos e término anterior ao início são bloqueados.
- Corrigido o envio do formulário: o botão **Criar Evento** agora declara `type="submit"` explicitamente.
- A migration `supabase/migrations/20260820120000_create_simulado_events.sql` foi executada manualmente pelo responsável no banco operacional em 2026-08-20; nenhuma migration foi executada pelo agente nesta atualização.
- O seletor de Simulado na criação passou ao componente pesquisável dark premium do sistema. A tela de gerenciamento ganhou edição de nome, Simulado, início, término, duração e política de resultados, preservando a sincronização temporal e as proteções server-side para troca do Simulado.
- O gerenciamento do Evento passou a oferecer **Copiar link de cadastro**, copiando a URL pública completa `/evento/[slug]` e apresentando confirmação na própria tela.
- Cada card da listagem de Eventos também oferece a cópia do link público por um botão compacto com ícone e nome acessível **Copiar link de cadastro pro evento**.

### Bloqueadores de fechamento do Evento corrigidos em 2026-08-20

- A liberação de resultados por Admin, Professor, alteração da política para `released` ou conclusão sob política liberada usa um fluxo compartilhado e idempotente. O resultado e os TopCoins permanecem válidos mesmo se o Resend falhar; envio e erro ficam registrados por participante.
- Criação e edição do Evento permitem selecionar zero, um ou vários professores ativos, preservam os vínculos atuais e validam os IDs no servidor.
- Eventos encerrados podem ser reabertos pelo Admin com um novo término futuro, sem alterar política de resultados ou histórico.
- O cadastro administrativo do Professor passou a manter o perfil inativo durante a montagem da conta, detectar duplicidades também no Auth e compensar falhas na ordem vínculos → professor → perfil → Auth, com logging explícito para falhas de compensação.
- A migration existente já contém todos os campos e relacionamentos necessários; nenhuma migration adicional foi criada e nenhuma migration foi executada nesta correção.

### Modo aula do Professor implementado em 2026-08-20

- A dashboard do Evento apresenta uma questão oficial por vez, com rich text, imagens, alternativas variáveis e suporte a Certo/Errado.
- O estado inicial não revela gabarito nem estatísticas. Exibir/Ocultar dados atua somente na interface do Professor, e qualquer navegação restaura o estado virgem.
- Distribuição, acertos, erros, brancos concluídos, percentuais e tempo médio são agregados no servidor usando exclusivamente a tentativa representativa de cada participante do Evento.
- O acesso permanece protegido pelo guard de Professor ativo associado ao Evento e o painel reutiliza o polling único da dashboard.
- Os links de cadastro dos Eventos agora são montados no servidor a partir de `NEXT_PUBLIC_APP_URL`. A origem local do navegador não é mais copiada; configurações ausentes ou apontando para localhost são rejeitadas com aviso administrativo.

### Painel Participantes do Professor implementado em 2026-08-20

- A dashboard passou a possuir as três áreas funcionais: Visão geral, Questões/Modo aula e Participantes.
- Participantes exibem identidade mínima, status individual, ingresso, início, conclusão, tempo concluído, tentativas no Evento, resultado oficial e situação da liberação.

### Fechamento consolidado do Evento de Simulado em 2026-08-20

- Bloqueios de operação sem Simulado e de mutações em Eventos arquivados foram aplicados na API e na interface.
- A retomada de tentativa válida após o encerramento foi preservada, mantendo novas tentativas bloqueadas.
- Pré-evento, regras, estados individuais, presença online, métricas representativas e histórico arquivado foram completados.
- A presença usa `user_sessions` com heartbeat de 30 segundos e janela online de 90 segundos; nenhuma estrutura adicional de presença foi necessária.
- A nota oficial é visível ao Professor mesmo quando ainda bloqueada para o aluno; a tela não altera política, resultado ou `result_released_at`.
- O recorte usa somente tentativas do Evento, exclui preview e respeita a tentativa representativa. Busca, filtro, paginação visual e polling central de dez segundos preservam legibilidade e atualização.

### Segurança final do Evento de Simulado preparada em 2026-08-20

- O heartbeat passou para rota estudantil autenticada, com identidade derivada exclusivamente do token e ownership validado pela participação no Evento. `session_touch` e `login_success` também deixaram de confiar em identidade enviada pelo cliente.
- O ingresso público não revela mais se um e-mail possui conta antes da comprovação de posse. reCAPTCHA v3 é validado no servidor e a resposta inicial é idêntica para contas existentes e novas.
- A confirmação usa token opaco de 256 bits, hash SHA-256 persistido, validade de 24 horas, Resend e cookie `HttpOnly`. Após a confirmação, conta existente segue para login/recuperação e conta nova para cadastro com e-mail fixado e contexto preservado.
- Cooldown de 60 segundos evita reenvio repetido. Criada, sem execução, a migration `supabase/migrations/20260820170000_limit_event_join_intents.sql`, que deduplica e limita a uma intenção pendente por Evento/e-mail.
- As variáveis existentes `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `RESEND_API_KEY` e `NEXT_PUBLIC_APP_URL` são reutilizadas; nenhum novo segredo foi introduzido.

### Correção — link público do Evento redirecionava para /login — ✅ Corrigido em 2026-08-21

- Identificado em produção: `GET /evento/<slug>` sem sessão retornava `307` para `/login` antes mesmo de a página carregar.
- Causa raiz: `proxy.ts` (raiz do projeto, equivalente ao `middleware.ts` nesta versão do Next.js) mantém sua própria lista de rotas públicas, independente da lista usada pelo `AppShell.tsx`. A Sprint do Evento havia atualizado apenas o `AppShell`; o `proxy.ts` não conhecia `/evento/` e bloqueava o visitante anônimo antes de a rota pública ser alcançada.
- Correção: adicionada a condição `pathname.startsWith("/evento/")` ao cálculo de `isPublic` em `proxy.ts`, no mesmo padrão já usado para `/r/`.
- Validado localmente com build de produção (`next start`), sem cookies: `/evento/<slug>` responde `200`; URLs desconhecidas e todas as rotas privadas (Admin, Professor, Aluno) continuam retornando `307 → /login` normalmente.
- Lição registrada para futuras rotas públicas: uma rota só é efetivamente pública quando adicionada tanto em `proxy.ts` quanto em `app/components/AppShell.tsx`.
- Nenhuma migration foi criada ou alterada para esta correção.

### Refinamento do ingresso e cadastro pelo Evento de Simulado — ✅ Implementado em 2026-08-21

- Removido o terceiro e-mail ("crie sua senha") do cadastro de aluno novo originado por Evento. O fluxo passa a enviar somente dois e-mails: continuação do cadastro e código de confirmação.
- Os dois e-mails passaram a reutilizar o `shell()` oficial dos e-mails de Jornada (`app/lib/email/jornadaEmailTemplates.ts`), via `lib/email/studentRegistrationTemplates.ts`. O e-mail de continuação, antes HTML solto direto em `app/api/events/[slug]/route.ts`, passou a usar a nova função `eventContinueRegistrationTemplate`. **Correção em 2026-08-21:** a identidade visual usada aqui inicialmente (shell escuro `#050816`/`#0b1020`) não era a oficial da Jornada — ver entrada abaixo.
- Depois do código correto, `POST /api/auth/confirm-registration` cria o token de definição de senha (mesma tabela/propósito `first_access` já usada pelo primeiro acesso por e-mail) e devolve o token bruto diretamente na resposta, sem envio por Resend. `/cadastro` ganhou a etapa "Crie sua senha", reaproveitando `PasswordRequirements` e `validatePassword` (política única do sistema) e enviando o token para `POST /api/auth/first-access`, endpoint existente e inalterado.
- `students.approved_at` passou a ser preenchido na criação da conta por Evento, garantindo que "Esqueci minha senha" continue funcionando caso o aluno feche o navegador antes de criar a senha inicial.
- `/evento/[slug]` ganhou uma tela clara e específica depois do envio do e-mail de continuação ("Enviamos um e-mail para você"), com e-mail parcialmente mascarado e aviso sobre Spam/Promoções; a etapa de captura do e-mail permanece no visual escuro premium.
- Cadastro convencional (fora de Evento), cadastro administrativo, Professor e recuperação de senha não foram alterados.
- Nenhuma migration foi criada ou alterada nesta correção.

### Correção — exclusão definitiva de aluno com participação em Evento sem tentativa — ✅ Implementado em 2026-08-21

- Identificado: `simulado_event_participants.student_id` usa `on delete restrict` no banco, mas a lista `HISTORY_CHECKS` de `app/api/admin/students/[id]/route.ts` (exclusão definitiva de aluno) nunca foi atualizada quando a Sprint do Evento criou essa tabela — alunos com participação em Evento, mesmo sem nenhuma tentativa real, ficavam presos sem conseguir ser excluídos definitivamente.
- Correção: antes de excluir `students`, o endpoint agora remove participações em Evento sem tentativa representativa (`representative_attempt_id is null`) — só alcançável nesse ponto do fluxo porque a checagem de `simulado_attempts` já garantiu ausência de tentativa real. Participação com tentativa real continua protegida (bloqueada pela checagem de tentativas, como já era).
- Nenhuma migration foi criada ou alterada nesta correção.

### Correção — identidade visual oficial dos e-mails restaurada e reutilizada no Evento — ✅ Implementado em 2026-08-21

- **Causa raiz real:** não houve regressão nos e-mails de Jornada. `app/lib/email/jornadaEmailTemplates.ts` (arquivo efetivamente usado pelos 6 pontos de envio de e-mail de Jornada) só foi tocado duas vezes em toda a história (commit-base de 10/07 e `3557a8d` de 17/07, "consolida emails de matrícula") e a mudança de 17/07 foi puramente aditiva — o `shell()` (fundo claro `#f8fafc`, cabeçalho navy `#0f172a`, eyebrow laranja "ESTUDOTOP SIMULADOS", cards `#fff7ed`/`#f8fafc`) nunca mudou.
- O problema real: existe um segundo arquivo quase homônimo, `lib/email/jornadaEmailTemplates.ts` (raiz, sem `app/`), presente desde a linha de base e **nunca importado por nenhum ponto de envio real** (confirmado por busca em todo o projeto) — usa um shell escuro `#050816`/`#0b1020` completamente diferente. A correção anterior desta mesma data (E-mail 1 e E-mail 2 do Evento) usou esse arquivo órfão como referência visual por engano.
- Correção: exportado `shell()` de `app/lib/email/jornadaEmailTemplates.ts`. `publicRegistrationCodeTemplate` (e-mail de código, compartilhado entre cadastro convencional e Evento) e `eventContinueRegistrationTemplate` (e-mail de continuação do Evento), ambos em `lib/email/studentRegistrationTemplates.ts`, passaram a construir o corpo do e-mail e reutilizar esse `shell()` — confirmado por render direto que o cabeçalho é agora byte-idêntico ao da matrícula de Jornada.
- Conteúdo, textos, assuntos, destinatários e validade dos links/códigos não foram alterados — só a camada visual.
- O arquivo órfão `lib/email/jornadaEmailTemplates.ts` (raiz) não foi removido nesta correção — segue como pendência registrada, por não fazer parte do pedido original (é puramente uma limpeza de código morto).
- Nenhuma migration foi criada ou alterada nesta correção.

### Correção — busca de aluno na Jornada e organização de Atividades atribuídas — ✅ Implementado em 2026-08-21

- **Busca dentro da Jornada (`/admin/jornadas/[id]`):** a filtragem client-side de `filteredAvailableStudents` já era case-insensitive, com trim e substring — sem bug de lógica. A causa real era de apresentação: o resultado alimentava um `<select>` nativo fechado, sem retorno visual imediato ao digitar. Substituído por uma lista de resultados visível (nome, e-mail, indicação "Matrícula cancelada — reinserir" quando aplicável) com botão **Adicionar**/**Reinserir** por linha, mantendo a mesma API (`POST /api/admin/jornadas/[id]/students`) e a mesma regra de elegibilidade (matrícula `cancelled` não bloqueia nova inserção).
- **Remoção de aluno da Jornada pelo perfil (`/admin/alunos/[id]`):** revisão completa do modal "Gerenciar Atividades" (antigo "Gerenciar Jornadas", já existente e documentado) e da API `PATCH /api/admin/jornadas/[id]/students/[studentId]` — nenhum bug de código encontrado; a ação já cancela a matrícula (`status → cancelled`) preservando histórico, com confirmação premium e log de auditoria. Renomeado de "Gerenciar Jornadas" para "Gerenciar Atividades" (rótulo do botão e cabeçalho do modal) para alinhar com o pedido, sem alterar a lógica.
- **Atividades atribuídas (`/admin/alunos/[id]`):** cada Jornada já era exibida em bloco próprio (não misturada), mas o cronograma completo ficava sempre expandido para todas simultaneamente. Adicionado toggle **Expandir/Recolher** por Jornada (estado local, sem nova consulta), com o cronograma completo oculto por padrão — reduz poluição visual quando o aluno tem várias Jornadas. Botão **Gerenciar Atividades** também passou a ficar visível permanentemente na aba (antes só aparecia quando o aluno não tinha nenhuma Jornada).
- Nenhuma migration foi criada ou alterada nesta correção.

### Correção — identidade visual única para todas as comunicações por e-mail — ✅ Implementado em 2026-08-21

- Excluídos os dois arquivos órfãos confirmados por busca completa no projeto (nunca importados por nenhum ponto de envio real): `lib/email/jornadaEmailTemplates.ts` (raiz) e `app/lib/email/studentRegistrationTemplates.ts`. O `shell()` oficial de `app/lib/email/jornadaEmailTemplates.ts` (fundo claro `#f8fafc`, cabeçalho navy `#0f172a`, eyebrow laranja "EstudoTOP Simulados", cards `#fff7ed`/`#f8fafc`, botão `#ea580c`) passa a ser a única fonte visual de e-mail do sistema.
- Convertidos para `shell()`, preservando todo o conteúdo/textos/assuntos/destinatários: `jornadaEnrollmentTemplate` e `simuladoReleasedTemplate` (reenvio de boas-vindas e liberação de simulado da Jornada, ambos ainda usavam um estilo claro diferente, com pílula laranja em vez do cabeçalho navy); `studentWelcomeTemplate` em `app/lib/email/studentWelcomeTemplate.ts` (cadastro administrativo de aluno/professor, mesmo problema); `studentWelcomeTemplate` em `lib/email/studentWelcomeTemplate.ts` (link de primeiro acesso/reset de senha, usava o shell escuro órfão); `adminInviteConfirmationTemplate` em `lib/email/studentRegistrationTemplates.ts` (código não utilizado por nenhum fluxo, convertido por consistência); HTML inline em `app/lib/server/sendFirstAccessEmail.ts` (reset de senha administrativo) e em `lib/server/simuladoEvents.ts` (resultado de Evento liberado).
- Validado por render direto de cada template: todos usam o mesmo cabeçalho `#0f172a`/eyebrow `#fb923c`, nenhum resquício do shell escuro `#050816`/`#0b1020`, escaping de HTML preservado/reforçado em todos.
- Nenhuma migration foi criada ou alterada nesta correção.

### Correção — experiência do aluno cadastrado exclusivamente por Evento — ✅ Implementado em 2026-08-21

- **Diagnóstico:** alunos com cadastro exclusivamente originado por Evento (`students.origin_event_id` preenchido, coluna criada pela Sprint do Evento) continuavam vendo os itens "Jornadas" e "Simulados" no menu superior e no menu lateral/hambúrguer, e recebiam o modal/tutorial inicial das Corujas mesmo sem contexto de Jornada ou Simulado avulso.
- **Derivação dinâmica:** nova rota `GET /api/student/nav-access` retorna, a partir das relações reais do aluno (sem gravar nenhuma flag nova): `has_jornadas` (existe ao menos uma `student_jornadas` com `status != 'cancelled'`, mesmo critério já usado em `/minhas-jornadas`) e `has_event_origin` (`students.origin_event_id is not null`). `AuthContext` (`app/contexts/AuthContext.tsx`) busca essa rota uma única vez quando `profile.role === "student"` e expõe `studentNavAccess` via `useAuth()` — fonte única consumida por `Header.tsx`, `Sidebar.tsx` (menu lateral/hambúrguer, usado também pelo botão flutuante de menu em telas ≥ lg) e `AppShell.tsx`, evitando requisições duplicadas.
- **Menu "Jornadas":** visível quando `hasJornadas` é verdadeiro. **Menu "Simulados":** visível quando o aluno não tem origem exclusiva de Evento (`!hasEventOrigin`) — os dois itens são independentes; possuir Jornada não concede, por si só, acesso ao módulo geral de Simulados (o `event.simulado_id` também nunca concedeu isso, comportamento preexistente). Sem flicker: os itens só são renderizados depois que `studentNavAccess` resolve.
- **Tutorial das Corujas:** `StudentJourneyExplainerModal` deixa de abrir automaticamente quando `hasEventOrigin && !hasJornadas` (aluno exclusivamente de Evento). A supressão é apenas contextual — nada é gravado como "já visto"; o contador de logins em `localStorage` (limite de 10 exibições automáticas) só avança quando o aluno sai desse estado, preservando o tutorial normal caso ele receba uma Jornada depois.
- **Card "Meus Eventos" (`app/meus-eventos/page-client.tsx`):** reorganizado com hierarquia clara (rótulo do evento + badge de status traduzido; nome; Professor/Professores só quando houver; Data e horário em formato longo `"21 de agosto de 2026 · 00h30"` + "Horário de Brasília"; "Sua situação" isolada do status do Evento) e sem estados técnicos crus (`active`, `scheduled` etc. nunca aparecem — novo helper `lib/ui/eventStatus.ts`). Ação principal reflete o estado (Ver evento / Entrar no evento / Continuar simulado / Ver meus resultados), sem botão quando não há ação disponível (resultado bloqueado, não realizado). Nenhuma regra de tentativa/encerramento/resultado foi recriada — o card só consome os mesmos dados já calculados por `/api/student/events`.
- Nenhuma migration foi criada ou alterada nesta correção.

### Extensão — gerenciamento administrativo de alunos em Eventos — ✅ Implementado em 2026-08-21

- **Estrutura reutilizada, sem migration:** a relação oficial de participação já existia desde a Sprint do Evento (`simulado_event_participants`, unicidade por `(event_id, student_id)`, coluna `source` com `check` já aceitando `'admin'` além de `'public_link'`/`'registration'`). Nenhuma coluna ou tabela nova foi criada.
- **Duas portas, uma única API:** `POST /api/admin/events/[id]/participants` (adicionar) e `DELETE /api/admin/events/[id]/participants/[studentId]` (remover) são chamadas tanto pela tela do Evento (`/admin/eventos/[id]`, seção Participantes: busca, lista, adicionar, remover) quanto pelo modal "Gerenciar Atividades" do perfil do aluno (`/admin/alunos/[id]`, agora com abas Jornadas/Eventos). Uma ação em qualquer um dos dois caminhos reflete no outro após o recarregamento (`router.refresh()`/`load()`), sem lógica duplicada.
- **Elegibilidade do Evento:** reaproveita `effectiveEventStatus()` (`lib/server/simuladoEvents.ts`) — aceita adição em `scheduled` e `active`; rejeita em `closed`/`archived` (mesma regra já usada pelo ingresso público). Evento reaberto volta a aceitar automaticamente.
- **Elegibilidade do aluno:** somente `status = 'active'`. Ao contrário da Jornada, a adição administrativa a um Evento **não** aprova automaticamente cadastros pendentes nem reativa contas inativas — comportamento deliberadamente diferente, conforme pedido explícito desta correção.
- **Idempotência:** checagem de participação existente antes do insert, mais tratamento do código `23505` (unique violation) como fallback — nunca duplica ao adicionar duas vezes ou ao o aluno abrir o link público depois de já ter sido adicionado pelo Admin.
- **Preservação histórica sem coluna nova:** a remoção verifica `simulado_attempts.event_participant_id` (FK `ON DELETE RESTRICT` já existente) antes de agir. Sem tentativa registrada → `DELETE` físico da linha (reversível, aluno pode ser adicionado de novo). Com tentativa registrada → remoção bloqueada com mensagem explicativa; nenhum dado é apagado.
- **Limitação conhecida e não resolvida nesta entrega:** hoje não existe um estado de "participação cancelada com histórico preservado" para o caso em que o aluno já tem tentativa — a única ação possível nesse caso é manter a participação. Implementar "cancelar acesso futuro preservando histórico" exigiria uma coluna nova (ex.: `cancelled_at`) em `simulado_event_participants`; não foi criada nesta entrega por não haver autorização explícita — registrada como pendência.
- **Auditoria:** `system_activity_logs` (`event_participant_added`/`event_participant_removed`, mais tentativa negada por estado do Evento) e `student_activity_log` (histórico do aluno), seguindo o mesmo padrão já usado pelas ações de Jornada.
- **Sem e-mail novo:** a adição/remoção administrativa não dispara nenhum e-mail — a Sprint do Evento não define esse fluxo e nenhum foi criado.
- **Painel "Acompanhamento do aluno" → aba "Atividades atribuídas" (correção durante a mesma entrega):** essa aba (dentro de `/admin/alunos/[id]`, componente `AlunoActivityPanel`) é distinta do modal "Gerenciar Atividades" e só listava Jornadas — um aluno cadastrado exclusivamente por Evento aparecia como "Nenhuma atividade atribuída" mesmo já participando de um Evento. Adicionada a seção "Eventos" (`AssignedEvents`), exibida **antes** da seção "Jornadas" (`AssignedActivities`) — mostrando nome, status traduzido, data de entrada, datas do Evento, situação (sem tentativa / aguardando liberação / resultado disponível) e link direto para a tela administrativa do Evento. Os dois botões "Gerenciar Atividades" que existiam duplicados dentro de cada seção foram removidos e substituídos por um único botão ao final das duas seções, evitando redundância visual. Nenhuma seção nova foi criada fora da aba já existente, conforme pedido.
- Nenhuma migration foi criada ou alterada nesta correção.

### Nova função — exclusão definitiva de aluno com histórico — ✅ Implementado em 2026-08-21

- **Dois níveis de exclusão preservados:** a exclusão comum (`DELETE /api/admin/students/[id]`) continua bloqueando quando há histórico, sem nenhuma alteração de comportamento. Nova rota `POST /api/admin/students/[id]/hard-delete` é a exceção controlada: remove definitivamente o aluno e todo o histórico pedagógico, mesmo quando existem dados vinculados.
- **Reautenticação real do Admin:** novo helper `lib/server/verifyAdminPassword.ts` cria um client Supabase efêmero (chave anônima, `persistSession`/`autoRefreshToken` desligados — nunca o client de service role nem o de sessão do browser), chama `signInWithPassword` com o e-mail do Admin obtido do servidor (nunca do body) e a senha informada, e revoga a sessão gerada imediatamente após a checagem. `requireAdmin` (`lib/server/authGuard.ts`) passou a expor também `email` (extensão aditiva, sem impacto nos demais consumidores) — é a única fonte da identidade usada na reautenticação. Nunca aceita e-mail vindo do cliente. Rate limiting de tentativas de senha é o nativo do GoTrue/Supabase Auth sobre `signInWithPassword`.
- **Modal em duas etapas:** quando a exclusão comum é bloqueada por histórico, o aviso agora também oferece "Excluir aluno e todo o histórico". Uma segunda modal mostra nome, e-mail, CPF mascarado (`123.***.**9-00`) e o aviso de irreversibilidade; exige a senha do Admin e a digitação de "EXCLUIR" antes de habilitar o botão final "Excluir definitivamente".
- **Mapa de dados do aluno (via `information_schema`/`pg_constraint`, não por suposição):** duas famílias de tabela. (1) `simulado_attempts`, `simulado_results`, `simulado_feedbacks`, `topcoin_earnings` e `student_registration_confirmations` têm FK direta para `auth.users(id) ON DELETE CASCADE` — cairiam sozinhas ao remover o usuário do Auth, mas são apagadas explicitamente antes por determinismo/auditabilidade (`simulado_answers` cai junto via `attempt_id`). (2) `simulado_event_participants.student_id` e `student_jornadas.student_id` referenciam `public.students(id)` com `RESTRICT`/`NO ACTION` — não cascateiam do Auth e precisam ser removidas manualmente antes, senão a exclusão do usuário no Auth falha por violação de FK. As tabelas legadas `attempts` e `student_simulados` não têm nenhuma FK declarada — nunca cascateiam e ficariam órfãs se não fossem limpas explicitamente.
- **Ordem da operação:** `simulado_feedbacks` → `simulado_attempts` → `attempts` (legado) → `topcoin_earnings` → `simulado_event_participants` → `student_jornadas` → `student_simulados` (legado) → `student_correction_video_progress` → `student_simulado_notes` → `student_registration_confirmations` → Supabase Auth → `students` → `profiles`, com reverificação final das três camadas de identidade (mesmo padrão de segurança já usado pela exclusão comum: Auth primeiro, para nunca produzir conta invisível se algo falhar).
- **Auth como fronteira de segurança para Admin:** a rota rejeita com 403 quando `profiles.role !== 'student'` — isso já impede, por construção, que a tela de aluno seja usada para excluir a própria conta de Admin (a arquitetura garante que uma conta Admin nunca tem `role = 'student'`).
- **Logs e retenção:** `system_activity_logs` (`student_hard_deleted`, severidade padrão) e tentativa de senha incorreta registrada em `security_event_logs` (`admin.hard_delete_wrong_password`). Registros de segurança/sistema do próprio sistema (`security_event_logs`, `system_activity_logs`, `system_error_logs`, `user_sessions`) **não são apagados** — não têm FK para o aluno, e a política (`docs/SEGURANCA_LOGS_AUDITORIA.md`) recomenda retenção de 180 dias para segurança/auditoria; passam a referenciar um `actor_id` de conta já removida, comportamento aceitável e já previsto pela ausência de FK ali. Tickets de ajuda (`student_help_messages` e derivadas) já têm `ON DELETE CASCADE` a partir de `students` desde a criação dessa tabela — comportamento herdado, não alterado nesta entrega — e por isso são removidos junto com o aluno.
- Nenhuma migration foi criada — toda a operação usa apenas deletes explícitos via `supabase-js`, reaproveitando FKs e a estrutura já existente.
- **Não testado com dados reais nesta sessão:** por não haver autorização para escrita em produção fora desta funcionalidade em si, os testes end-to-end (criar aluno de teste com histórico completo, executar a exclusão definitiva, confirmar recadastro com o mesmo e-mail) não foram executados — apenas validados por leitura de schema, TypeScript, build e smoke test de guard (401 sem token). Recomenda-se validação manual em homologação antes de considerar a funcionalidade 100% fechada.

### Correção — exclusão definitiva desconectava a sessão do Admin — ✅ Implementado em 2026-08-21

- **Causa raiz:** `lib/server/verifyAdminPassword.ts` chamava `client.auth.signOut()` sem opções ao final da reautenticação. O escopo padrão do Supabase Auth é `"global"`, que revoga **todas** as sessões da conta no servidor GoTrue — inclusive a sessão real do navegador do Admin, mesmo a verificação rodando em um client Supabase totalmente separado e efêmero (a revogação acontece por conta de usuário, não por client). Resultado: ao confirmar a própria senha para excluir definitivamente um aluno, o Admin era deslogado da própria sessão e caía na tela de login — a exclusão em si funcionava corretamente, o problema era apenas o efeito colateral na sessão.
- **Correção:** trocado para `client.auth.signOut({ scope: "local" })`, que apenas descarta o estado desse client efêmero (que já não persiste nada, `persistSession: false`) sem revogar nada no servidor. A sessão real do Admin no navegador não é mais afetada.
- Comportamento esperado confirmado: após excluir definitivamente, o Admin permanece autenticado e retorna normalmente para `/admin/alunos`.
- Nenhuma migration foi criada ou alterada nesta correção.
