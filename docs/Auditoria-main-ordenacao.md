# Auditoria main-worktree - 08/09/2026

## Estado inicial (antes das alteracoes)

24 arquivos previamente modificados; preservados. Incluem trabalho de interface, parsers e filtros fora desta etapa.

```text
 M app/api/admin/questions/import/analyze-batch/route.ts
 M app/api/admin/questions/import/save/route.ts
 M app/components/questions/EvaluatedTopicsInput.tsx
 M app/components/questions/RichTextEditor.tsx
 M app/components/questions/SubjectMultiSelect.tsx
 M app/components/ui/PageBackground.tsx
 M app/components/ui/PageHeader.tsx
 M app/components/ui/PremiumButton.tsx
 M app/components/ui/PremiumCard.tsx
 M app/components/ui/PremiumInput.tsx
 M app/components/ui/PremiumSelect.tsx
 M app/components/ui/SearchableSelect.tsx
 M app/globals.css
 M app/lib/utils/question-splitter.ts
 M app/questoes/gerar-ia/page-client.tsx
 M app/questoes/importar/page-client.tsx
 M app/questoes/nova/page-client.tsx
 M app/questoes/page-client.tsx
 M app/questoes/page.tsx
 M app/simulados/[id]/editar/page-client.tsx
 M docs/INDICE_FUNCOES_SISTEMA.md
 M docs/Sprint-interface-grafica.md
 M docs/projeto-estudotop-simulados-prompt.md
 M docs/status-atual.md
```

Arquivamento: archiveQuestions, sendToReview, import/save, check-duplicate e duplicate-service identicos a Sistema. Nenhuma correcao funcional necessaria.

Falta: helper de ordenacao e consumidores textuais aprovados. Hotmart ausente nesta branch: nao sera importado. Diferencas de recuperacao de senha, autenticacao, eventos/reconciliacao e documentacao nao relacionada em Sistema ficam fora do escopo.

## Diferencas e decisoes

- Arquivamento ja completo: botoes individual/lote, confirmacao, status explicito archived, alternativas/assuntos/metadados, limpeza por IDs confirmados, falhas preservadas, duplicatas como sucesso operacional. Endpoints identicos a Sistema, sem alteracao nesta auditoria.
- Faltavam helper pt-BR e ordenacao de opcoes nos consumidores textuais. Aplicados nos componentes compartilhados e consumidores locais existentes, sem copiar paginas inteiras da outra branch.
- Main possui filtros e aviso de anulacao no Banco; controles de anular/desanular no editor de Simulado; lembretes, contador de participantes e busca no gerenciamento de Eventos. Tudo preservado.
- Main possui ProfessorAssignmentPicker, ausente em Sistema. Adaptado pontualmente para ordenar resultados por nome antes do limite de 30; selecionados e eventos de inclusao/remocao preservados.
- Hotmart e alteracoes de autenticacao/recuperacao de senha/reconciliacao exclusivas de Sistema nao foram importados. Nao representam pendencia desta entrega.
- Documentacao inserida nas secoes pertinentes, preservando os demais registros da main.

## Arquivos modificados nesta auditoria

- app/components/ui/SearchableSelect.tsx
- app/components/ui/PremiumSelect.tsx
- app/components/questions/SubjectMultiSelect.tsx
- app/questoes/page-client.tsx
- app/questoes/revisar/page-client.tsx
- app/simulados/page-client.tsx
- app/topicos/page-client.tsx
- app/simulados/[id]/editar/page-client.tsx
- app/admin/raio-x-provas/page-client.tsx
- app/admin/ajuda/page-client.tsx
- app/assuntos/importar/page-client.tsx
- app/assuntos/page-client.tsx
- app/components/questions/QuestionTemplatePicker.tsx
- app/questoes/gerar-ia/page-client.tsx
- app/simulados/novo/page-client.tsx
- app/admin/raio-x-provas/nova/page-client.tsx
- app/components/HelpCenterModal.tsx
- app/questoes/importar/page-client.tsx
- app/admin/eventos/[id]/page-client.tsx
- app/admin/jornadas/[id]/page-client.tsx
- app/admin/jornadas/[id]/editar/page-client.tsx
- app/admin/alunos/[id]/page-client.tsx
- app/meu-perfil/page-client.tsx
- app/components/questions/EvaluatedTopicsInput.tsx
- app/admin/eventos/page-client.tsx
- app/admin/raio-x-provas/[id]/page-client.tsx
- app/admin/logs/page-client.tsx
- app/admin/alunos/novo/page.tsx
- app/admin/jornadas/page-client.tsx
- docs/INDICE_FUNCOES_SISTEMA.md
- docs/status-atual.md
- app/admin/eventos/[id]/ProfessorAssignmentPicker.tsx

## Arquivos criados

- app/lib/utils/sort.ts
- docs/Auditoria-main-ordenacao.md

Arquivos removidos: nenhum.

## Validacao

- Busca de impacto em app/docs e comparacao direta entre as worktrees.
- Testes isolados do endpoint real, servico real de duplicidade e sincronizacao real de assuntos, com Supabase em memoria: archived, alternativas, assuntos, gabarito/metadados, dados opcionais, duplicidade contra archived, repeticao no lote, retry, falhas parciais/rollback, validacao de status, envio normal pending_review e ausencia de vinculos com Simulado.
- Funcao real da UI: confirmacao, cancelamento, espera pelo backend, sucesso/erro, falha parcial e limpeza limitada aos IDs confirmados.
- Edge headless com componentes reais isolados: PremiumSelect, SearchableSelect, SubjectMultiSelect, seletores locais de Questoes/Simulados e ProfessorAssignmentPicker da main. Ordem pt-BR/numeros, busca, teclado, selecao e ordem de status/anos aprovados.
- Comparacao AST contra snapshots iniciais: archiveQuestions, sendToReview, splitter, predicados de anulacao e toggleAnnulment intactos. Atributos JSX className/style de todos os consumidores tocados intactos.

## Pendencias e limites

Homologacao integral das rotas autenticadas e demais cenarios ponta a ponta com Supabase real permanece pendente. Nenhuma escrita externa executada. A homologacao parcial informada pelo usuario confirmou archived ao arquivar e draft ao desarquivar; os testes isolados nao substituem o aceite integrado.

Nenhuma migration criada ou alterada nesta Sprint. Sem alteracao de banco, assets ou politicas. Nao houve commit, push ou deploy.

## Resultado final das validacoes

- npx tsc --noEmit: aprovado no estado final.
- npm run build: aprovado (101 paginas estaticas geradas).
- Regressao do importador e fixture Edge: aprovadas, incluindo ProfessorAssignmentPicker da main.
- ZIP com 34 arquivos alterados/criados e manifesto; entradas e conteudo conferidos byte a byte.
