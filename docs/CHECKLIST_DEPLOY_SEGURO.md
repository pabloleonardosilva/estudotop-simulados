# Checklist de Deploy Seguro

## Antes do deploy

- [ ] `npm run build` executado com sucesso
- [ ] `npm run lint` verificado e exceções formalmente aceitas
- [ ] `npx tsc --noEmit` verificado
- [ ] Migrations revisadas; nenhuma migration destrutiva sem rollback
- [ ] Backup recente confirmado com evidência
- [ ] Restore testado recentemente ou risco aceito formalmente
- [ ] `CRON_SECRET` configurado
- [ ] `REGISTRATION_TOKEN_SECRET` configurado
- [ ] `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor
- [ ] Variáveis `NEXT_PUBLIC_*` revisadas
- [ ] Cron protegido validado
- [ ] Storage e capacidade revisados
- [ ] Rollback e responsáveis definidos

## Depois do deploy

- [ ] Login admin testado
- [ ] Login aluno testado
- [ ] Jornada e simulado abertos
- [ ] Tentativa iniciada
- [ ] Resposta salva
- [ ] Tentativa enviada
- [ ] Resultado carregado
- [ ] Cron sem segredo retorna 401/403
- [ ] Cron com segredo executa corretamente
- [ ] E-mails transacionais básicos verificados
- [ ] Erros do hosting/Supabase revisados
