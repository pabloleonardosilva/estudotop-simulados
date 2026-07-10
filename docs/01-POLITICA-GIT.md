# Política de Git e Versionamento
## EstudoTOP Simulados

**Documento:** 01-POLITICA-GIT.md  
**Versão:** 2.0  
**Status:** Oficial  
**Aplicação:** Obrigatória

---

# 1. Finalidade

Esta política estabelece as normas oficiais de versionamento do EstudoTOP Simulados.

Seu objetivo é garantir:

- rastreabilidade;
- segurança;
- facilidade de rollback;
- histórico confiável;
- organização das entregas;
- previsibilidade do desenvolvimento.

Todo código produzido deverá possuir histórico rastreável.

---

# 2. Princípios

O Git representa a história oficial do projeto.

Ele não deve ser utilizado apenas como backup.

Seu objetivo é registrar a evolução técnica do software.

---

# 3. Fluxos Oficiais de Desenvolvimento

O EstudoTOP Simulados possui atualmente três formas oficiais de desenvolvimento.

## GIT-001 — Desenvolvimento por ZIP

Quando o desenvolvimento ocorrer através de arquivos ZIP:

- o ZIP deverá conter apenas arquivos modificados;
- deverão ser preservados os caminhos relativos;
- não deverão ser enviados arquivos desnecessários;
- a documentação deverá acompanhar a entrega quando aplicável.

Após aplicação do ZIP recomenda-se executar as validações obrigatórias antes do commit.

---

## GIT-002 — Desenvolvimento pelo Codex

Quando o Codex alterar diretamente o projeto deverá:

- identificar arquivos alterados;
- validar TypeScript;
- validar Build;
- apresentar relatório;
- aguardar autorização para commit.

---

## GIT-003 — Desenvolvimento pelo Claude Code

O Claude Code seguirá exatamente o mesmo fluxo do Codex.

---

# 4. Commits

## GIT-004

Todo commit deverá representar uma entrega consistente.

Sempre que possível deverá ser adotado:

> **1 Sprint = 1 Commit**

Caso uma Sprint seja muito grande poderão existir múltiplos commits relacionados.

Nunca deverão existir commits contendo código quebrado.

---

# 5. Push

## GIT-005

Push para o repositório remoto somente poderá ocorrer mediante autorização explícita do responsável pelo projeto.

Nenhuma ferramenta poderá executar Push automaticamente.

---

# 6. Deploy

## GIT-006

Commit não significa Deploy.

A sequência oficial do projeto é:

```
Desenvolvimento

↓

Validação

↓

Commit

↓

Push

↓

Homologação

↓

Produção
```

---

# 7. Estado da Worktree

## GIT-007

Sempre que possível uma nova Sprint deverá iniciar com a Worktree limpa.

Caso existam alterações pendentes deverão ser avaliadas antes do início da nova Sprint.

Não é recomendado misturar alterações de Sprints diferentes.

---

# 8. Fluxo Diário Recomendado

O fluxo atualmente adotado pelo EstudoTOP Simulados é o seguinte.

Durante o dia:

- aplicar ZIPs quando necessário;
- utilizar Codex quando disponível;
- utilizar Claude Code quando necessário;
- testar normalmente.

Ao final da Sprint ou do dia:

- revisar alterações;
- validar o projeto;
- atualizar documentação;
- realizar commit.

O Push poderá ocorrer posteriormente.

---

# 9. Commits por Sprint

## GIT-008

Cada Sprint concluída deverá resultar em um commit sempre que possível.

Exemplos:

```
Sprint Jornadas

Sprint Simulados

Sprint Emails

Sprint Logs

Sprint Segurança Banco

Sprint Consolidação Arquitetural
```

Evitar mensagens genéricas como:

```
update

ajustes

alterações

correções
```

---

# 10. Validações Obrigatórias

## GIT-009

Antes de qualquer commit deverão ser executados obrigatoriamente:

```bash
npx tsc --noEmit
```

```bash
npm run build
```

Caso qualquer validação falhe:

o commit não deverá ser realizado.

---

# 11. Arquivos Temporários

## GIT-010

Os itens abaixo não fazem parte do projeto.

Exemplos:

```
node_modules

.next

coverage

dist

out

test-results

playwright-report

downloads

backups temporários

arquivos ZIP

arquivos RAR

arquivos 7z
```

Esses arquivos deverão permanecer protegidos pelo `.gitignore`.

---

# 12. Documentação

## GIT-011

Toda Sprint relevante deverá manter sincronizados:

- código;
- documentação;
- índice funcional;
- políticas, quando aplicável.

---

# 13. Migrations

## GIT-012

Sempre que uma Sprint criar, alterar ou remover migrations isso deverá constar explicitamente no relatório da entrega.

Caso nenhuma migration exista, deverá constar:

> Nenhuma migration foi criada ou alterada nesta Sprint.

---

# 14. Commits Automáticos

## GIT-013

Nenhuma ferramenta de IA deverá executar commits automaticamente.

Fluxo obrigatório:

1. implementar;
2. validar;
3. apresentar relatório;
4. aguardar autorização;
5. realizar commit.

---

# 15. Push Automático

## GIT-014

É proibido executar Push automático.

Todo Push exige autorização explícita.

---

# 16. Integração com as Políticas

Esta política complementa:

- Constituição Técnica;
- Política de Desenvolvimento;
- Política de Migrations;
- Política de Deploy.

Em caso de conflito prevalecerá a Constituição Técnica.

---

# 17. Checklist de Encerramento

Antes do commit deverá ser confirmado:

- Build aprovado;
- TypeScript aprovado;
- documentação atualizada;
- índice atualizado quando aplicável;
- migrations documentadas;
- arquivos revisados;
- relatório preparado.

---

# 18. Histórico

## Versão 2.0

Esta versão consolida oficialmente o fluxo de desenvolvimento atualmente utilizado pelo EstudoTOP Simulados.

Principais decisões incorporadas:

- coexistência oficial dos três métodos de desenvolvimento (ZIP, Codex e Claude Code);
- commits preferencialmente por Sprint;
- Push sempre mediante autorização explícita;
- validações obrigatórias antes do versionamento;
- documentação sincronizada com o código;
- Git como histórico oficial do projeto.