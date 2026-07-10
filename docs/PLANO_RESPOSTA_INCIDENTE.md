# Plano de resposta a incidente

## Incidente

Evento que comprometa ou ameace confidencialidade, integridade, disponibilidade ou continuidade: vazamento, acesso indevido, chave exposta, alteração de dados, indisponibilidade, falha de backup, upload malicioso, abuso de API ou invasão.

## Severidade

- Baixa: impacto localizado, sem dado sensível ou indisponibilidade relevante.
- Média: múltiplos usuários ou função importante afetada, com contenção simples.
- Alta: acesso indevido confirmado, perda de dados ou indisponibilidade crítica.
- Crítica: service role/chave ampla exposta, vazamento relevante, alteração em massa ou impossibilidade de recuperação.

## Fluxo

1. Identificar e registrar horário, escopo e fonte.
2. Conter sem destruir evidências.
3. Preservar logs, snapshots e artefatos com acesso restrito.
4. Erradicar causa e rotacionar credenciais.
5. Recuperar a partir de estado confiável e validar funções críticas.
6. Avaliar comunicação interna, titulares e orientação jurídica.
7. Produzir causa raiz, ações e lições aprendidas.

## Checklist imediato

- [ ] Responsável e severidade definidos
- [ ] Service role, anon key e credenciais afetadas avaliadas
- [ ] `CRON_SECRET` e `REGISTRATION_TOKEN_SECRET` rotacionados se necessário
- [ ] Usuário suspeito bloqueado
- [ ] Endpoint sensível pausado quando necessário
- [ ] Logs/evidências preservados
- [ ] Backup verificado e snapshot criado antes de correção destrutiva
- [ ] Escopo de dados e usuários afetados estimado
- [ ] Jurídico/privacidade consultados quando aplicável

## Comunicação e pós-incidente

Definir contatos internos: `[PREENCHER]`. A comunicação a titulares ou autoridades deve ser avaliada com orientação jurídica, sem prometer prazo ou obrigação não validados. O relatório final deve conter linha do tempo, causa raiz, impacto, recuperação e prevenção.
