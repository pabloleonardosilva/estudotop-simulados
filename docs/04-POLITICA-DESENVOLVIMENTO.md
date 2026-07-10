# Política de Desenvolvimento
## EstudoTOP Simulados

**Documento:** 04-POLITICA-DESENVOLVIMENTO.md  
**Versão:** 2.0  
**Status:** Oficial  
**Aplicação:** Obrigatória

---

# 1. Finalidade

Esta política estabelece as normas oficiais para desenvolvimento do EstudoTOP Simulados.

Seu objetivo é garantir que toda alteração preserve:

- estabilidade;
- previsibilidade;
- organização;
- qualidade técnica;
- arquitetura existente;
- facilidade de manutenção.

Aplica-se a qualquer implementação realizada no projeto, independentemente da ferramenta utilizada.

---

# 2. Princípios

O desenvolvimento do EstudoTOP Simulados é baseado em cinco princípios fundamentais.

## DEV-001 — Estabilidade acima da velocidade

Nunca sacrificar estabilidade para entregar mais rápido.

---

## DEV-002 — Alterações cirúrgicas

Modificar exclusivamente aquilo que foi solicitado.

É proibido realizar:

- melhorias paralelas;
- refatorações não autorizadas;
- alterações visuais fora do escopo;
- mudanças indiretas.

---

## DEV-003 — Compreender antes de alterar

Nenhuma implementação deverá começar sem análise prévia.

Primeiro compreender.

Depois implementar.

---

## DEV-004 — Código e documentação evoluem juntos

Nenhuma Sprint estará concluída enquanto:

- documentação;
- índice;
- políticas;

estiverem desatualizados.

---

## DEV-005 — Preservação da arquitetura

Toda implementação deverá respeitar a arquitetura existente.

Mudanças arquitetônicas somente poderão ocorrer mediante Sprint específica.

---

# 3. Fluxo Oficial de Desenvolvimento

Toda Sprint deverá seguir obrigatoriamente a sequência abaixo.

## Etapa 1

Consultar o índice funcional.

Documento oficial:

```
docs/INDICE_FUNCOES_SISTEMA.md
```

---

## Etapa 2

Localizar todas as ocorrências da funcionalidade.

Não alterar apenas o primeiro arquivo encontrado.

É obrigatório identificar todos os consumidores.

---

## Etapa 3

Identificar todos os arquivos impactados.

Sempre considerar:

- páginas;
- componentes;
- APIs;
- hooks;
- funções compartilhadas;
- documentação;
- banco;
- migrations.

---

## Etapa 4

Planejar a implementação.

Somente após concluir a análise deverá iniciar o desenvolvimento.

---

## Etapa 5

Alterar apenas os arquivos necessários.

Nunca modificar recursos não relacionados.

---

## Etapa 6

Executar validações.

Sempre que aplicável:

- TypeScript;
- Build;
- testes;
- validação manual.

---

## Etapa 7

Atualizar documentação.

Sempre que necessário atualizar:

- documentação;
- índice;
- políticas;
- arquitetura.

---

## Etapa 8

Preparar entrega.

Informar claramente:

- arquivos alterados;
- validações executadas;
- migrations;
- impactos.

---

# 4. Regra Oficial das Sprints

O EstudoTOP Simulados adota oficialmente o seguinte fluxo para qualquer Sprint.

Antes de alterar qualquer funcionalidade deverá ser seguido obrigatoriamente:

1. Consultar o arquivo de índice.
2. Localizar onde aquela funcionalidade aparece.
3. Identificar todos os arquivos impactados.
4. Alterar somente os arquivos necessários.
5. Validar.
6. Testar e retestar.
7. Atualizar o índice caso funções tenham sido criadas, removidas, alteradas ou movidas.
8. Trabalhar sempre sobre a versão mais recente do projeto.
9. Não modificar funcionalidades fora do escopo solicitado.
10. Informar claramente arquivos alterados, migrations e validações executadas.

Este fluxo passa a ser o padrão oficial de desenvolvimento do EstudoTOP Simulados.

---

# 5. Desenvolvimento por Ferramenta

O projeto admite atualmente três formas oficiais de desenvolvimento.

## DEV-006 — ChatGPT (ZIP)

As entregas em ZIP deverão:

- conter apenas arquivos modificados;
- preservar a estrutura original;
- não incluir arquivos desnecessários;
- informar claramente as alterações realizadas.

---

## DEV-007 — Codex

O Codex poderá alterar diretamente o projeto.

Deverá obrigatoriamente:

- validar;
- documentar;
- aguardar autorização para commit.

---

## DEV-008 — Claude Code

Segue exatamente as mesmas regras aplicáveis ao Codex.

---

# 6. Arquivos Protegidos

Alguns arquivos poderão ser classificados como protegidos.

Esses arquivos somente deverão ser modificados quando fizerem parte explícita da Sprint.

Exemplo conhecido:

```
app/components/Sidebar.tsx
```

Sempre que um arquivo protegido for alterado isso deverá constar explicitamente no relatório da entrega.

---

# 7. Estrutura Oficial

Toda implementação deverá respeitar a estrutura oficial do projeto.

Não deverão ser criados diretórios paralelos sem justificativa técnica.

Sempre deverá ser utilizada a estrutura definida nas Políticas Oficiais.

---

# 8. Banco de Dados

Sempre que houver alteração estrutural deverão ser obedecidas integralmente as regras da Política de Migrations.

---

# 9. Assets

Toda alteração em recursos visuais deverá obedecer integralmente a Política de Assets.

---

# 10. Refatorações

Refatorações não deverão ocorrer durante Sprints funcionais.

Caso exista necessidade de reorganização arquitetônica deverá ser criada Sprint específica.

---

# 11. Regressões

Toda implementação deverá considerar possíveis impactos em funcionalidades existentes.

Sempre que possível deverão ser realizados testes de regressão.

---

# 12. Entregas

Toda entrega deverá informar explicitamente:

- objetivo da Sprint;
- arquivos alterados;
- arquivos criados;
- arquivos removidos;
- migrations;
- validações executadas;
- pendências conhecidas.

---

# 13. Qualidade

Todo código desenvolvido deverá priorizar:

- clareza;
- simplicidade;
- baixo acoplamento;
- reutilização;
- facilidade de manutenção.

---

# 14. Encerramento de Sprint

Uma Sprint somente será considerada concluída quando:

- implementação concluída;
- documentação atualizada;
- índice atualizado quando necessário;
- TypeScript aprovado;
- Build aprovado;
- pronta para versionamento.

---

# 15. Relação com outras Políticas

Esta política complementa:

- Constituição Técnica;
- Política de Git;
- Política de Migrations;
- Política de Assets;
- Política de Documentação.

Em caso de conflito prevalecerá a Constituição Técnica.

---

# 16. Histórico

## Versão 2.0

Esta versão consolida oficialmente o fluxo de desenvolvimento adotado pelo EstudoTOP Simulados.

Principais decisões incorporadas:

- oficialização das 10 etapas obrigatórias de toda Sprint;
- consulta obrigatória ao Índice Funcional antes de qualquer alteração;
- adoção formal dos três fluxos de desenvolvimento (ZIP, Codex e Claude Code);
- proteção de arquivos estratégicos do projeto;
- oficialização das alterações cirúrgicas como padrão permanente;
- sincronização obrigatória entre código, documentação e índice;
- proibição de alterações fora do escopo sem autorização explícita.