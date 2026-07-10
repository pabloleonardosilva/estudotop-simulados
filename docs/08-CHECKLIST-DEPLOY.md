# Checklist Oficial de Deploy
## EstudoTOP Simulados

**Documento:** 08-CHECKLIST-DEPLOY.md  
**Versão:** 1.0  
**Status:** Oficial  
**Aplicação:** Obrigatória

---

# Finalidade

Este checklist deverá ser executado obrigatoriamente antes da publicação de qualquer versão do EstudoTOP Simulados em ambiente de produção.

Seu objetivo é reduzir riscos operacionais, evitar indisponibilidade, impedir perda de dados e garantir que a publicação ocorra de forma segura e controlada.

Nenhum deploy deverá ser realizado sem este checklist.

---

# 1. Aprovação

## DEPLOY-001

☐ A Sprint foi oficialmente concluída.

☐ O responsável autorizou o deploy.

☐ O deploy possui objetivo claramente definido.

☐ Existe plano de rollback.

---

# 2. Código

## DEPLOY-002

☐ O código corresponde exatamente à versão aprovada.

☐ Não existem alterações locais pendentes.

☐ O commit foi realizado.

☐ O push foi realizado para o repositório correto.

---

# 3. Build

## DEPLOY-003

☐ `npx tsc --noEmit` executado com sucesso.

☐ `npm run build` executado com sucesso.

☐ Não existem erros conhecidos.

---

# 4. Banco de Dados

## DEPLOY-004

Caso existam migrations:

☐ Diretório correto.

☐ Ordem correta.

☐ Ambiente correto.

☐ Impacto revisado.

☐ Rollback planejado.

☐ Autorização concedida.

Caso não existam:

☐ Confirmado que nenhuma migration será executada.

---

# 5. Variáveis de Ambiente

## DEPLOY-005

☐ Todas as variáveis obrigatórias estão configuradas.

☐ Nenhum segredo está exposto.

☐ URLs revisadas.

☐ Chaves revisadas.

☐ Ambiente confirmado.

---

# 6. Supabase

## DEPLOY-006

☐ Projeto correto.

☐ Banco correto.

☐ Auth revisado.

☐ Policies revisadas.

☐ RLS revisado.

☐ Storage revisado.

☐ Buckets revisados.

☐ Redirect URLs revisadas.

---

# 7. Resend

## DEPLOY-007

☐ API Key correta.

☐ Domínio validado.

☐ Remetente revisado.

☐ Templates revisados.

☐ Links revisados.

☐ Fluxos de e-mail testados.

---

# 8. OpenAI

## DEPLOY-008

☐ API Key correta.

☐ Modelos revisados.

☐ Limites conhecidos.

☐ Tratamento de erro validado.

☐ Custos estimados.

---

# 9. Cron

## DEPLOY-009

☐ CRON_SECRET configurado.

☐ Endpoint protegido.

☐ Frequência revisada.

☐ Cron habilitado somente quando necessário.

---

# 10. Assets

## DEPLOY-010

☐ Assets presentes em `public/`.

☐ Nenhum asset duplicado.

☐ Nenhuma referência quebrada.

☐ URLs públicas funcionando.

---

# 11. Documentação

## DEPLOY-011

☐ Documentação atualizada.

☐ Índice atualizado quando necessário.

☐ Relatório da Sprint concluído.

---

# 12. Homologação

## DEPLOY-012

Foram validados:

☐ Login administrativo.

☐ Login do aluno.

☐ Cadastro.

☐ Primeiro acesso.

☐ Recuperação de senha.

☐ Simulados.

☐ Jornadas.

☐ Questões.

☐ TopCoins.

☐ Raio-X.

☐ Anotações.

☐ PDFs.

☐ E-mails.

☐ Responsividade.

---

# 13. Segurança

## DEPLOY-013

☐ Nenhum endpoint administrativo permanece desprotegido.

☐ Nenhuma chave foi exposta.

☐ Nenhuma permissão indevida identificada.

☐ Nenhum bloqueador crítico conhecido permanece aberto.

---

# 14. Publicação

## DEPLOY-014

☐ Deploy iniciado.

☐ Deploy concluído com sucesso.

☐ Build da plataforma aprovado.

☐ Aplicação disponível.

---

# 15. Pós-Deploy

## DEPLOY-015

Monitorar:

☐ Logs da aplicação.

☐ Logs da Vercel.

☐ Logs do Supabase.

☐ Envio de e-mails.

☐ Execução do cron.

☐ APIs.

☐ Autenticação.

☐ Erros inesperados.

☐ Feedback dos usuários.

---

# 16. Encerramento

O deploy somente será considerado oficialmente concluído quando:

☐ Todos os itens deste checklist estiverem concluídos.

☐ A aplicação estiver acessível.

☐ Os serviços externos estiverem funcionando.

☐ Nenhum erro crítico tiver sido identificado.

☐ O sistema retornar ao Estado Oficial definido na Constituição Técnica.

---

# Relação com outras Políticas

Este checklist complementa:

- Constituição Técnica;
- Política de Git;
- Política de Desenvolvimento;
- Política de Migrations;
- Política de Assets;
- Política de Documentação;
- Política de Deploy.

---

# Histórico

## Versão 1.0

Criado durante a Sprint de Subida e Consolidação Arquitetural.

Este documento oficializa o procedimento obrigatório para publicação do EstudoTOP Simulados em ambiente de produção, estabelecendo um fluxo seguro, rastreável e padronizado para todos os deploys futuros.