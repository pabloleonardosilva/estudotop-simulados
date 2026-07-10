# Constituição Técnica
## EstudoTOP Simulados

**Documento:** 00-CONSTITUICAO-TECNICA.md  
**Versão:** 2.0  
**Status:** Oficial  
**Aplicação:** Obrigatória

---

# 1. Finalidade

Esta Constituição Técnica estabelece as normas permanentes que regem o desenvolvimento do EstudoTOP Simulados.

Ela representa a autoridade máxima da documentação técnica do projeto.

Toda implementação, manutenção, correção, refatoração, auditoria, documentação ou implantação deverá obedecer obrigatoriamente às regras aqui descritas.

Caso exista conflito entre este documento e qualquer outro documento técnico, prevalece esta Constituição.

---

# 2. Escopo

Esta Constituição aplica-se integralmente a:

- código-fonte;
- banco de dados;
- migrations;
- documentação;
- assets;
- infraestrutura;
- versionamento;
- deploy;
- ferramentas utilizadas no desenvolvimento;
- Inteligências Artificiais utilizadas no projeto;
- desenvolvedores humanos.

São consideradas ferramentas de IA, entre outras:

- ChatGPT
- Codex
- Claude Code
- futuras ferramentas adotadas pelo projeto.

---

# 3. Missão da Governança

A governança do EstudoTOP Simulados existe para:

- preservar estabilidade;
- reduzir regressões;
- organizar a evolução do software;
- registrar decisões permanentes;
- padronizar o desenvolvimento;
- reduzir dependência de memória humana;
- facilitar manutenção futura.

A governança nunca deverá existir para gerar burocracia.

Sua finalidade é diminuir o custo de evolução do sistema.

---

# 4. Princípios Fundamentais

## CT-001 — Estabilidade acima da velocidade

Nenhuma entrega possui prioridade superior à estabilidade do sistema.

Sempre que existir conflito entre rapidez e segurança, deverá prevalecer a segurança.

---

## CT-002 — Alterações cirúrgicas

Toda Sprint deverá alterar exclusivamente aquilo que foi solicitado.

É proibido aproveitar uma Sprint para realizar:

- melhorias paralelas;
- refatorações não autorizadas;
- alterações estéticas fora do escopo;
- mudanças indiretas.

---

## CT-003 — Código e documentação evoluem juntos

Uma funcionalidade somente será considerada concluída quando:

- código estiver implementado;
- documentação correspondente estiver atualizada;
- índice funcional estiver atualizado quando aplicável;
- validações obrigatórias tiverem sido executadas.

---

## CT-004 — O banco de dados é patrimônio do projeto

O banco de dados representa um ativo permanente do EstudoTOP Simulados.

Nenhuma alteração estrutural poderá ocorrer sem:

- análise;
- documentação;
- validação;
- autorização.

---

## CT-005 — Build limpo é obrigatório

Nenhuma Sprint poderá ser encerrada caso exista:

- erro de TypeScript;
- erro de Build;
- imports quebrados;
- referências inválidas;
- inconsistências conhecidas.

---

## CT-006 — Decisões importantes devem ser documentadas

Nenhuma decisão arquitetônica relevante deverá permanecer apenas nas conversas.

Sempre que necessário deverão ser criados ou atualizados:

- documentos oficiais;
- políticas;
- ADRs;
- índice.

---

## CT-007 — Git representa a história oficial

O Git é o histórico oficial do projeto.

Nenhuma Sprint deverá permanecer indefinidamente sem versionamento.

---

## CT-008 — O projeto deve sobreviver às pessoas

A documentação deverá permitir que outro desenvolvedor ou outra IA consiga assumir o projeto sem depender do histórico das conversas.

---

# 5. Fontes Oficiais

Cada informação do projeto deverá possuir apenas uma fonte oficial.

## Código

```
Sistema/
```

---

## Assets públicos

```
public/
```

---

## Novas migrations

```
supabase/migrations/
```

---

## Documentação

```
docs/
```

---

## Índice funcional

```
docs/INDICE_FUNCOES_SISTEMA.md
```

---

## Banco operacional

Projeto Supabase atualmente utilizado pelo sistema.

---

# 6. Regra da Fonte Única

Sempre que existirem duas possíveis fontes para a mesma informação, apenas uma poderá ser considerada oficial.

Exemplos de problemas que esta regra pretende evitar:

- app/public × public
- múltiplas pastas de migrations
- documentação duplicada
- assets duplicados
- estruturas paralelas

Quando identificadas, estruturas duplicadas deverão ser consolidadas.

---

# 7. Estado Oficial do Projeto

Considera-se que o projeto está em Estado Oficial quando TODOS os requisitos abaixo forem verdadeiros.

## Código

- Build aprovado;
- TypeScript aprovado;
- sem erros conhecidos.

## Banco

- migrations organizadas;
- sem alterações estruturais pendentes conhecidas.

## Assets

- organização conforme política oficial;
- ausência de duplicidades indevidas.

## Documentação

- sincronizada;
- índice atualizado quando necessário.

## Versionamento

- alterações prontas para commit;
- sem bloqueadores críticos conhecidos.

Nenhuma Sprint deverá ser considerada oficialmente concluída antes do retorno ao Estado Oficial.

---

# 8. Fluxo Oficial de Desenvolvimento

Todo desenvolvimento deverá seguir obrigatoriamente a sequência abaixo.

1. Consultar o índice funcional.
2. Identificar todas as ocorrências da funcionalidade.
3. Identificar todos os arquivos impactados.
4. Planejar a alteração.
5. Alterar somente os arquivos necessários.
6. Validar funcionamento.
7. Executar TypeScript.
8. Executar Build.
9. Atualizar documentação quando necessário.
10. Atualizar o índice quando necessário.
11. Preparar o versionamento.

Nenhuma dessas etapas poderá ser ignorada sem justificativa técnica.

---

# 9. Fluxo Oficial das Sprints

As Sprints do EstudoTOP Simulados seguem obrigatoriamente esta filosofia.

Uma Sprint inicia com:

- entendimento do problema;
- consulta ao índice;
- análise de impacto.

Uma Sprint termina somente quando:

- implementação estiver concluída;
- documentação estiver atualizada;
- validações executadas;
- projeto retornar ao Estado Oficial.

---

# 10. Ferramentas Oficiais

Atualmente o projeto admite três formas oficiais de desenvolvimento.

## ZIP

Entrega manual de arquivos modificados.

---

## Codex

Alteração direta no projeto.

---

## Claude Code

Alteração direta no projeto.

Todas obedecem exatamente às mesmas políticas.

Nenhuma possui privilégios especiais.

---

# 11. Organização do Conhecimento

O conhecimento técnico do projeto deverá permanecer registrado em:

```
docs/
```

Nunca deverá depender exclusivamente de:

- memória;
- histórico de chats;
- mensagens antigas.

---

# 12. Qualidade

Todo código desenvolvido deverá priorizar:

- legibilidade;
- simplicidade;
- baixo acoplamento;
- facilidade de manutenção;
- previsibilidade.

---

# 13. Segurança

Alterações envolvendo:

- autenticação;
- autorização;
- banco;
- storage;
- RLS;
- grants;
- funções SQL;
- SECURITY DEFINER;
- deploy;

deverão receber validação específica.

---

# 14. Evolução da Constituição

Esta Constituição deverá evoluir juntamente com o projeto.

Novas regras permanentes deverão ser incorporadas a este documento.

Nenhuma regra permanente deverá permanecer apenas nas conversas.

---

# 15. Disposição Final

Sempre que existir conflito entre:

- conversas;
- documentação secundária;
- práticas antigas;
- decisões informais;

prevalecerá esta Constituição Técnica.

Este documento representa a autoridade máxima da governança técnica do EstudoTOP Simulados.

---

# Histórico

## Versão 2.0

Esta versão consolida as decisões tomadas durante a Sprint de Consolidação Arquitetural e a Sprint de Subida para Produção.

Principais marcos registrados:

- criação da governança técnica oficial;
- definição das fontes oficiais do projeto;
- formalização do Estado Oficial do Projeto;
- institucionalização do fluxo oficial de desenvolvimento;
- institucionalização do fluxo oficial das Sprints;
- reconhecimento do banco Supabase operacional como fonte oficial da estrutura em funcionamento;
- unificação das regras permanentes do EstudoTOP Simulados.