# Segurança e continuidade operacional

## Objetivo

Manter autenticação, execução de simulados e preservação de resultados durante falhas, além de permitir recuperação controlada após indisponibilidade ou deploy malsucedido.

## Dependências críticas

| Dependência | Uso | Impacto da indisponibilidade |
|---|---|---|
| Supabase Postgres | dados pedagógicos e operacionais | sistema indisponível ou inconsistente |
| Supabase Auth | login e identidade | nenhum usuário autentica |
| Supabase Storage | avatares | perda visual; operação principal continua |
| Hosting/Vercel | aplicação e APIs | indisponibilidade total |
| Resend | e-mails transacionais | cadastro/liberação sem comunicação |
| OpenAI | geração, importação e explicações | funções de IA indisponíveis; simulados existentes continuam |
| DNS/domínio | acesso público | indisponibilidade externa |
| Variáveis de ambiente | integrações e segredos | falhas de autenticação, cron e integrações |

## Criticidade

- Crítica: login admin/aluno, abrir simulado, salvar respostas e submeter tentativa.
- Alta: resultados, acesso a Jornadas e liberação programada.
- Média: e-mails transacionais e PDFs.
- Baixa para continuidade imediata: importações e geração por IA.

## RPO e RTO recomendados

- RPO transacional recomendado: até 1 hora se o plano oferecer PITR; sem PITR, declarar formalmente a aceitação de até 24 horas com backup diário.
- RPO de Storage: 24 horas, com cópia externa diária ou política equivalente.
- RTO para login, tentativas e resultados: 4 horas.
- RTO para e-mail, IA e PDF: 24 horas.

## Antes do deploy

- [ ] Build e typecheck aprovados; lint revisado.
- [ ] Migrations revisadas e ordenadas.
- [ ] Backup recente confirmado com evidência.
- [ ] `CRON_SECRET` e `REGISTRATION_TOKEN_SECRET` configurados.
- [ ] Service role disponível somente no servidor.
- [ ] Plano de rollback e responsável definidos.
- [ ] Cron pausado se o deploy alterar Jornadas/liberações.

## Depois do deploy

- [ ] Login admin e aluno.
- [ ] Jornada e simulado liberado abertos.
- [ ] Tentativa iniciada, resposta salva e tentativa enviada.
- [ ] Resultado carregado.
- [ ] Cron sem segredo bloqueado e com segredo operacional.
- [ ] E-mails transacionais essenciais verificados.
- [ ] Erros e métricas da hospedagem verificados.

Falhas críticas exigem suspensão do deploy, preservação de evidências e execução do rollback documentado.
