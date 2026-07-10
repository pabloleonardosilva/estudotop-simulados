# Política de Banco de Dados e Migrations
## EstudoTOP Simulados

**Documento:** 02-POLITICA-MIGRATIONS.md  
**Versão:** 2.0  
**Status:** Oficial  
**Aplicação:** Obrigatória

---

# 1. Finalidade

Esta política estabelece as normas oficiais para evolução da estrutura do banco de dados do EstudoTOP Simulados.

Seu objetivo é garantir:

- consistência estrutural;
- rastreabilidade das alterações;
- segurança durante deploys;
- previsibilidade da evolução do banco;
- preservação do patrimônio de dados do projeto.

Aplica-se a qualquer alteração realizada no PostgreSQL/Supabase.

---

# 2. Princípios

O banco de dados é um dos ativos mais importantes do EstudoTOP Simulados.

Toda alteração estrutural deverá ser:

- planejada;
- documentada;
- validada;
- rastreável.

Nunca deverá ser realizada alteração estrutural improvisada.

---

# 3. Banco Oficial

## MIG-001

O banco Supabase atualmente utilizado pelo sistema é considerado a fonte operacional oficial da estrutura de dados.

Isso significa que:

- representa a estrutura efetivamente utilizada pelo sistema;
- é o ponto de partida para novas evoluções;
- deverá ser preservado.

---

# 4. Diretório Oficial

## MIG-002

Toda nova migration deverá ser criada exclusivamente em:

```text
supabase/migrations/
```

Nenhuma nova migration poderá ser criada em:

```text
migrations/

app/supabase/

app/migrations/

qualquer outro diretório
```

Esses diretórios passam a ser considerados apenas histórico do projeto.

---

# 5. Estrutura de Nomes

## MIG-003

Toda migration deverá utilizar obrigatoriamente o padrão:

```text
YYYYMMDDHHMMSS_descricao.sql
```

Exemplo:

```text
20260710143000_create_student_notes.sql

20260711102000_add_topcoin_history.sql
```

Nunca utilizar nomes genéricos.

Exemplos proibidos:

```text
teste.sql

migration.sql

ajuste.sql

novo.sql
```

---

# 6. Quando Criar Migration

## MIG-004

É obrigatória a criação de migration sempre que houver alteração estrutural envolvendo:

- tabelas;
- colunas;
- índices;
- constraints;
- funções;
- triggers;
- views;
- RLS;
- grants;
- extensões;
- buckets;
- policies.

---

# 7. Quando NÃO Criar Migration

## MIG-005

Não deverá existir migration para alterações exclusivamente relacionadas a:

- React;
- Next.js;
- componentes;
- páginas;
- estilos;
- documentação;
- imagens;
- textos;
- validações apenas do frontend.

---

# 8. Alteração de Migration Existente

## MIG-006

É proibido editar migrations já aplicadas em ambiente compartilhado.

Caso seja necessária correção:

deverá ser criada nova migration.

---

# 9. SQL Avulso

## MIG-007

Arquivos SQL criados para:

- testes;
- consultas;
- auditorias;
- manutenção;

não substituem migrations.

Caso representem alteração estrutural definitiva deverão ser convertidos para migration oficial.

---

# 10. Banco Operacional

## MIG-008

Após a Sprint de Consolidação Arquitetural ficou estabelecido que:

o banco operacional atual representa a verdade estrutural do sistema em funcionamento.

As migrations passam a documentar a evolução futura do banco.

Não existe obrigação de reconstruir integralmente o histórico anterior por meio das migrations antigas.

---

# 11. Migrations Históricas

## MIG-009

Migrations antigas poderão permanecer no projeto para fins de documentação.

Sua existência não significa que devam ser executadas novamente.

Sempre que houver dúvida deverá prevalecer:

1. banco operacional;
2. documentação;
3. histórico da migration.

---

# 12. Auditorias

## MIG-010

Antes de deploys relevantes recomenda-se auditoria de:

- tabelas;
- índices;
- triggers;
- funções;
- RLS;
- grants;
- SECURITY DEFINER;
- buckets;
- auth;
- migrations aplicadas.

---

# 13. Ambientes

## MIG-011

Sempre deverá existir clareza sobre o ambiente onde a migration será executada.

Exemplos:

- desenvolvimento;
- homologação;
- produção.

Nunca executar migrations no ambiente incorreto.

---

# 14. Execução

## MIG-012

Nenhuma migration deverá ser executada automaticamente sem autorização explícita.

Antes da execução deverão ser avaliados:

- impacto;
- tempo;
- dependências;
- rollback;
- ambiente.

---

# 15. Alterações Manuais

## MIG-013

Alterações estruturais realizadas diretamente no banco deverão ocorrer apenas em situações excepcionais.

Quando ocorrerem deverão ser:

- documentadas;
- justificadas;
- refletidas posteriormente em migration oficial quando aplicável.

---

# 16. Relatórios de Sprint

## MIG-014

Toda Sprint deverá informar explicitamente uma das opções abaixo.

### Opção A

```
Nenhuma migration foi criada ou alterada nesta Sprint.
```

### Opção B

Lista completa contendo:

- migrations criadas;
- migrations alteradas;
- migrations removidas;
- impacto esperado;
- necessidade de execução.

---

# 17. Checklist Obrigatório

Antes da aprovação de uma migration deverá ser confirmado:

- diretório correto;
- nome correto;
- SQL revisado;
- documentação atualizada;
- índice atualizado quando necessário;
- impacto avaliado;
- rollback conhecido.

---

# 18. Relação com outras Políticas

Esta política complementa:

- Constituição Técnica;
- Política de Desenvolvimento;
- Política de Deploy.

Em caso de conflito prevalecerá a Constituição Técnica.

---

# 19. Histórico

## Versão 2.0

Esta versão incorpora oficialmente as decisões tomadas durante a Sprint de Consolidação Arquitetural.

Principais decisões:

- banco Supabase operacional reconhecido como fonte estrutural oficial;
- `supabase/migrations` definido como único diretório oficial para novas migrations;
- migrations históricas passam a possuir caráter documental;
- proibição de editar migrations já aplicadas;
- obrigatoriedade de informar migrations em toda Sprint.