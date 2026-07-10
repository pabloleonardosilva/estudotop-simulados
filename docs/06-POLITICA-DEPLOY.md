# Política de Deploy
## EstudoTOP Simulados

**Documento:** 06-POLITICA-DEPLOY.md  
**Versão:** 1.0  
**Status:** Oficial  
**Aplicação:** Obrigatória

---

# 1. Finalidade

Esta política estabelece as normas oficiais para preparação, homologação, publicação, monitoramento e reversão de deploys do EstudoTOP Simulados.

Seu objetivo é garantir que nenhuma versão seja colocada em ambiente público sem:

- validação técnica;
- segurança;
- rastreabilidade;
- plano de rollback;
- documentação;
- autorização explícita.

---

# 2. Princípios

## DEP-001 — Deploy não é continuação automática do desenvolvimento

Concluir código, criar commit ou realizar push não autoriza deploy.

Deploy é uma etapa separada e exige decisão explícita.

---

## DEP-002 — Produção deve receber somente versões validadas

Nenhuma versão poderá ser publicada enquanto existir:

- erro de TypeScript;
- erro de build;
- bloqueador crítico;
- falha de segurança conhecida;
- migration pendente indispensável;
- variável obrigatória ausente;
- integração externa não configurada.

---

## DEP-003 — Homologação precede produção

Sempre que tecnicamente possível, toda versão deverá ser validada em ambiente de preview ou homologação antes da publicação definitiva.

---

## DEP-004 — Rollback deve existir antes do deploy

Nenhum deploy poderá ser iniciado sem definição clara de como retornar à versão anterior.

---

# 3. Arquitetura Oficial de Produção

A arquitetura atualmente prevista para o EstudoTOP Simulados é:

- **Aplicação Next.js:** Vercel;
- **Banco de dados:** Supabase PostgreSQL;
- **Autenticação:** Supabase Auth;
- **Storage:** Supabase Storage, quando utilizado;
- **Envio de e-mails:** Resend;
- **Recursos de IA:** OpenAI;
- **Domínio e DNS:** provedor de domínio e Vercel;
- **Tarefas agendadas:** mecanismo aprovado para cron, inicialmente compatível com Vercel Cron ou solução equivalente.

Qualquer mudança nessa arquitetura deverá ser documentada antes da adoção.

---

# 4. Ambientes

## DEP-005 — Ambientes devem ser identificados explicitamente

Toda ação deverá indicar claramente o ambiente de destino.

Ambientes possíveis:

- local;
- desenvolvimento;
- preview;
- homologação;
- produção.

Nunca executar configuração, migration ou deploy sem confirmar o ambiente.

---

# 5. Pré-requisitos obrigatórios

Antes de qualquer deploy deverão estar confirmados:

- TypeScript aprovado;
- build aprovado;
- documentação atualizada;
- índice atualizado quando aplicável;
- Git organizado;
- commit criado;
- push autorizado;
- variáveis de ambiente revisadas;
- migrations analisadas;
- segurança validada;
- domínio definido quando aplicável;
- integrações externas configuradas;
- rollback planejado.

---

# 6. Variáveis de ambiente

## DEP-006

Toda variável necessária deverá ser configurada no ambiente correto.

As variáveis não deverão ser inferidas, copiadas cegamente ou expostas em relatórios.

Entre as variáveis conhecidas do projeto estão:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_IMPORT_MODEL
CRON_SECRET
REGISTRATION_TOKEN_SECRET
```

A lista definitiva deverá ser confirmada pelo código antes do deploy.

---

# 7. Segredos

## DEP-007

Segredos deverão existir apenas em ambientes seguros.

É proibido:

- inserir segredo no código;
- versionar `.env.local`;
- publicar chaves em documentação;
- expor valores em logs;
- utilizar prefixo `NEXT_PUBLIC_` em segredo privado.

---

# 8. Banco de dados e migrations

## DEP-008

Deploy de código não autoriza execução automática de migrations.

Toda migration deverá seguir a Política de Migrations.

Antes da execução deverão ser confirmados:

- ambiente correto;
- backup;
- impacto;
- dependências;
- ordem;
- autorização;
- estratégia de rollback.

Migrations históricas ou destrutivas nunca deverão ser executadas em lote.

---

# 9. Segurança do banco

## DEP-009

Nenhum deploy de produção poderá ocorrer com bloqueador crítico conhecido em:

- grants;
- policies RLS;
- funções `SECURITY DEFINER`;
- exposição de dados sensíveis;
- autenticação;
- autorização;
- APIs administrativas;
- APIs de aluno.

Bloqueadores identificados em auditoria deverão ser corrigidos e revalidados antes da produção.

---

# 10. Supabase

Antes da produção deverão ser revisados:

- projeto correto;
- URL;
- Auth;
- redirects;
- SMTP;
- templates;
- RLS;
- policies;
- grants;
- funções;
- triggers;
- Storage;
- buckets;
- cron, quando aplicável;
- ledger de migrations.

Nenhuma alteração deve ser feita no projeto Supabase errado.

---

# 11. Resend

Antes da produção deverão ser confirmados:

- domínio validado;
- remetente autorizado;
- chave correta;
- entregabilidade;
- links dos e-mails;
- URL final da aplicação;
- comportamento de erros;
- fluxos de boas-vindas;
- fluxos de Jornada;
- recuperação de senha.

---

# 12. OpenAI

Antes da produção deverão ser avaliados:

- chave;
- modelos utilizados;
- limites;
- custos;
- duração das rotas;
- tratamento de erro;
- retries;
- risco de duplicação;
- compatibilidade com o plano da Vercel.

Rotas longas deverão ser testadas em preview.

---

# 13. Cron e tarefas periódicas

## DEP-010

Toda tarefa automática deverá possuir:

- endpoint ou função identificada;
- frequência definida;
- segredo;
- idempotência;
- logs;
- tratamento de erro;
- mecanismo de reexecução seguro.

O endpoint de liberação de Jornadas deverá permanecer protegido por `CRON_SECRET`.

Nenhum cron deverá ser considerado ativo apenas porque o endpoint existe.

---

# 14. Preview e homologação

O deploy inicial deverá ocorrer preferencialmente em preview.

A homologação deverá validar, no mínimo:

- login administrativo;
- login do aluno;
- cadastro;
- primeiro acesso;
- alunos;
- questões;
- simulados;
- Jornadas;
- tentativas;
- respostas;
- resultados;
- TopCoins;
- Raio-X;
- anotações;
- e-mails;
- assets;
- PDFs;
- responsividade;
- permissões;
- erros e logs.

---

# 15. Domínio

Antes de conectar o domínio final deverão ser atualizados:

- `NEXT_PUBLIC_APP_URL`;
- Supabase Auth Site URL;
- redirect URLs;
- links de e-mail;
- callbacks;
- cron;
- webhooks;
- DNS;
- SSL.

A alteração de domínio deverá ocorrer somente após homologação da versão online.

---

# 16. Publicação em produção

## DEP-011

O deploy de produção exige autorização explícita do responsável pelo projeto.

A autorização para commit ou push não equivale à autorização para produção.

---

# 17. Monitoramento pós-deploy

Após a publicação deverão ser acompanhados:

- logs da Vercel;
- erros das APIs;
- falhas de autenticação;
- falhas de e-mail;
- erros do Supabase;
- execução do cron;
- rotas de IA;
- uploads;
- métricas de uso;
- feedback dos usuários.

O período inicial deverá receber monitoramento reforçado.

---

# 18. Rollback

## DEP-012

Antes do deploy deverá existir plano de rollback.

O plano poderá incluir:

- restaurar alias para deployment anterior;
- reverter commit;
- desabilitar cron;
- restaurar backup;
- aplicar migration de correção;
- pausar funcionalidade problemática.

Rollback de banco deverá ser tratado com cautela e nunca executado automaticamente.

---

# 19. Proibições

É proibido:

- fazer deploy sem autorização;
- publicar com build quebrado;
- executar migrations antigas em massa;
- usar banco não confirmado;
- expor segredos;
- alterar domínio antes da homologação;
- ativar cron sem proteção;
- publicar sem rollback;
- usar produção como ambiente de teste.

---

# 20. Relatório de deploy

Toda publicação deverá registrar:

- versão;
- commit;
- ambiente;
- data;
- responsável;
- migrations executadas;
- variáveis alteradas;
- integrações configuradas;
- testes realizados;
- riscos conhecidos;
- plano de rollback;
- resultado final.

---

# 21. Relação com outras Políticas

Esta política complementa:

- Constituição Técnica;
- Política de Git;
- Política de Migrations;
- Política de Desenvolvimento;
- Política de Documentação.

Em caso de conflito prevalecerá a Constituição Técnica.

---

# 22. Histórico

## Versão 1.0

Criada durante a Sprint de Subida e Consolidação Arquitetural.

Principais decisões oficializadas:

- deploy separado de commit e push;
- homologação antes de produção;
- autorização explícita para publicação;
- revisão obrigatória de variáveis, integrações e migrations;
- exigência de rollback;
- monitoramento pós-deploy;
- proteção das tarefas automáticas;
- produção proibida enquanto houver bloqueadores críticos de segurança.