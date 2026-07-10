# Política de Documentação
## EstudoTOP Simulados

**Documento:** 05-POLITICA-DOCUMENTACAO.md  
**Versão:** 2.0  
**Status:** Oficial  
**Aplicação:** Obrigatória

---

# 1. Finalidade

Esta política estabelece as normas oficiais para criação, atualização e organização da documentação do EstudoTOP Simulados.

Seu objetivo é garantir que toda decisão técnica, arquitetura, funcionalidade e processo permaneçam documentados e sincronizados com o sistema.

A documentação faz parte do patrimônio permanente do projeto.

---

# 2. Princípios

Toda documentação deverá ser:

- verdadeira;
- objetiva;
- atualizada;
- rastreável;
- consistente com o código.

Nenhuma documentação deverá permanecer desatualizada após a conclusão de uma Sprint.

---

# 3. Diretório Oficial

## DOC-001

Toda documentação oficial deverá permanecer em:

```text
docs/
```

É proibido manter documentação técnica oficial em locais diferentes sem justificativa.

---

# 4. Índice Funcional

## DOC-002

O documento:

```text
docs/INDICE_FUNCOES_SISTEMA.md
```

é o índice funcional oficial do EstudoTOP Simulados.

Toda Sprint deverá consultá-lo antes de iniciar qualquer alteração.

---

# 5. Atualização do Índice

## DOC-003

O índice deverá ser atualizado sempre que ocorrer:

- criação de função;
- remoção de função;
- alteração significativa de função;
- mudança de localização;
- criação de novo módulo;
- reorganização estrutural.

Caso nenhuma dessas situações ocorra, o índice poderá permanecer inalterado.

---

# 6. Obrigatoriedade

## DOC-004

Sempre que uma funcionalidade relevante for criada, modificada ou removida, a documentação correspondente deverá ser revisada.

Código e documentação devem evoluir juntos.

---

# 7. Organização

## DOC-005

A documentação deverá ser organizada por assunto.

Exemplo:

```text
docs/

Constituição

Políticas

Arquitetura

Checklists

Sprints

Status

Índice
```

Não deverão existir documentos duplicados tratando o mesmo assunto.

---

# 8. Nome dos Arquivos

## DOC-006

Os documentos deverão utilizar nomes claros e permanentes.

Exemplos:

```text
POLITICA-GIT.md

POLITICA-MIGRATIONS.md

CHECKLIST-SPRINT.md
```

Evitar:

```text
novo.md

teste.md

documento2.md
```

---

# 9. Documentação de Sprint

## DOC-007

Toda Sprint relevante deverá registrar:

- objetivo;
- arquivos alterados;
- validações executadas;
- migrations;
- impactos;
- pendências.

Sempre que possível deverá existir um documento da Sprint correspondente.

---

# 10. Arquitetura

## DOC-008

Documentação arquitetural deverá permanecer separada das Políticas.

Exemplos:

```text
docs/arquitetura/

arquitetura-jornadas.md

arquitetura-simulados.md

arquitetura-topcoins.md
```

As Políticas definem regras.

Os documentos de arquitetura explicam como o sistema funciona.

---

# 11. Relatórios

## DOC-009

Relatórios produzidos durante auditorias deverão permanecer disponíveis para consulta enquanto forem relevantes.

Quando substituídos por versões mais recentes deverão ser arquivados.

---

# 12. Alterações

## DOC-010

Nenhuma alteração estrutural importante deverá ser realizada sem atualização da documentação correspondente.

---

# 13. Inteligência Artificial

## DOC-011

Ferramentas de IA utilizadas no projeto deverão consultar previamente:

- Constituição Técnica;
- Políticas;
- Índice Funcional.

Sempre que necessário deverão atualizar esses documentos.

---

# 14. Qualidade

## DOC-012

Toda documentação deverá buscar:

- clareza;
- objetividade;
- consistência;
- baixa redundância;
- fácil manutenção.

---

# 15. Relação com outras Políticas

Esta política complementa:

- Constituição Técnica;
- Política de Desenvolvimento;
- Política de Git.

Em caso de conflito prevalecerá a Constituição Técnica.

---

# 16. Histórico

## Versão 2.0

Esta versão oficializa a documentação como patrimônio permanente do EstudoTOP Simulados.

Principais decisões:

- `docs/` torna-se o único diretório oficial para documentação técnica;
- `INDICE_FUNCOES_SISTEMA.md` passa a ser consulta obrigatória antes de qualquer Sprint;
- documentação arquitetural passa a ser separada das Políticas;
- toda funcionalidade relevante deverá possuir documentação correspondente;
- código e documentação passam a evoluir obrigatoriamente em conjunto.