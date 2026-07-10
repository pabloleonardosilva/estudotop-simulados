# Checklist Oficial de Sprint
## EstudoTOP Simulados

**Documento:** 07-CHECKLIST-SPRINT.md  
**Versão:** 1.0  
**Status:** Oficial  
**Aplicação:** Obrigatória

---

# Finalidade

Este checklist deverá ser utilizado obrigatoriamente antes do encerramento de qualquer Sprint do EstudoTOP Simulados.

Seu objetivo é garantir que nenhuma entrega seja concluída sem passar pelas verificações mínimas de qualidade, estabilidade, documentação e segurança.

Nenhuma Sprint deverá ser considerada oficialmente concluída sem este checklist.

---

# 1. Planejamento

## SPR-001

☐ A solicitação foi completamente compreendida.

☐ O escopo da Sprint está claramente definido.

☐ Não existem dúvidas pendentes antes do início da implementação.

---

# 2. Análise Inicial

## SPR-002

☐ O arquivo `docs/INDICE_FUNCOES_SISTEMA.md` foi consultado.

☐ Todas as ocorrências da funcionalidade foram identificadas.

☐ Todos os arquivos impactados foram localizados.

☐ O impacto da alteração foi analisado.

---

# 3. Implementação

## SPR-003

☐ Apenas os arquivos necessários foram modificados.

☐ Nenhuma funcionalidade fora do escopo foi alterada.

☐ Nenhuma melhoria paralela foi realizada sem autorização.

☐ Componentes protegidos permaneceram preservados quando não faziam parte da Sprint.

---

# 4. Banco de Dados

## SPR-004

☐ A Sprint altera estrutura do banco?

Caso NÃO:

☐ Confirmado que nenhuma migration foi criada.

Caso SIM:

☐ Migration criada.

☐ Diretório correto.

☐ Nome correto.

☐ Documentação atualizada.

☐ Impacto avaliado.

---

# 5. Assets

## SPR-005

☐ Novos assets foram adicionados apenas em `public/`.

☐ Não foram criadas estruturas paralelas.

☐ Não existem assets duplicados.

☐ Assets antigos continuam funcionando.

---

# 6. Documentação

## SPR-006

☐ Documentação atualizada.

☐ Índice funcional atualizado quando necessário.

☐ Políticas atualizadas quando aplicável.

☐ Arquitetura atualizada quando aplicável.

---

# 7. Qualidade

## SPR-007

☐ Código revisado.

☐ Imports revisados.

☐ Nenhum arquivo temporário incluído.

☐ Nenhuma dependência desnecessária criada.

---

# 8. Validações Técnicas

## SPR-008

☐ `npx tsc --noEmit` executado com sucesso.

☐ `npm run build` executado com sucesso.

☐ Nenhum erro conhecido permanece aberto.

---

# 9. Testes

## SPR-009

☐ Funcionalidade principal validada.

☐ Fluxos relacionados validados.

☐ Não foram identificadas regressões.

☐ Funcionalidades existentes continuam operando normalmente.

---

# 10. Git

## SPR-010

☐ Arquivos alterados revisados.

☐ Worktree conferida.

☐ Commit preparado.

☐ Push ainda não realizado (salvo autorização).

---

# 11. Relatório da Sprint

## SPR-011

O relatório deverá informar obrigatoriamente:

☐ Objetivo da Sprint.

☐ Arquivos alterados.

☐ Arquivos criados.

☐ Arquivos removidos.

☐ Migrations.

☐ Validações executadas.

☐ Impactos conhecidos.

☐ Pendências restantes.

---

# 12. Critérios de Aprovação

Uma Sprint somente poderá ser considerada concluída quando todos os itens abaixo forem verdadeiros.

☐ Build aprovado.

☐ TypeScript aprovado.

☐ Documentação sincronizada.

☐ Índice atualizado quando necessário.

☐ Nenhum bloqueador crítico conhecido.

☐ Projeto retornou ao Estado Oficial definido na Constituição Técnica.

---

# Relação com outras Políticas

Este checklist complementa:

- Constituição Técnica;
- Política de Desenvolvimento;
- Política de Git;
- Política de Migrations;
- Política de Assets;
- Política de Documentação;
- Política de Deploy.

---

# Histórico

## Versão 1.0

Criado durante a Sprint de Consolidação Arquitetural e Sprint de Subida.

Este documento oficializa o procedimento obrigatório para encerramento de qualquer Sprint do EstudoTOP Simulados, garantindo que toda entrega seja validada, documentada e preparada para versionamento.