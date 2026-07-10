# Mapeamento técnico-operacional LGPD

Este documento apoia a operação e não substitui parecer jurídico.

## Dados tratados

- Cadastrais: nome, e-mail, telefone, CPF, avatar, identificadores Supabase/Auth, status e concursos/interesses quando informados.
- Pedagógicos: Jornadas, liberações, simulados, tentativas, respostas, notas, resultados, desempenho, feedbacks e anotações.
- Técnicos e segurança: horários, último login, atividade, mudanças de resposta, violações de foco, eventos antifraude, IP e user-agent nos logs de auditoria.
- Auditoria: as tabelas da Sprint Segurança E armazenam IP, user-agent, rota, ator, entidade e metadata sanitizada para investigação e segurança, com acesso restrito a admin e retenção limitada conforme `SEGURANCA_LOGS_AUDITORIA.md`.
- Comunicação: e-mails transacionais, horário/status de envio e erros quando armazenados.

## Finalidades operacionais

- autenticação e gestão da conta;
- entrega, correção e histórico do serviço educacional;
- suporte e comunicações transacionais;
- segurança, prevenção de fraude e continuidade;
- melhoria pedagógica e estatísticas, preferencialmente agregadas/anonymizadas.

## Bases a validar juridicamente

Execução do serviço educacional e legítimo interesse para segurança são hipóteses operacionais prováveis. Obrigações legais, consentimento e retenções específicas devem ser validados pelo responsável jurídico; não são afirmados definitivamente aqui.

## Princípios técnicos

- coletar apenas o necessário;
- limitar acesso por função e propriedade;
- não exportar segredos, hashes, dados de terceiros ou gabaritos protegidos;
- bloquear a conta antes de qualquer exclusão irreversível;
- preservar histórico somente quando houver finalidade e prazo definidos;
- anonymizar estatísticas sempre que possível.

## Direitos e solicitações

Solicitações de acesso, correção, exportação, oposição ou exclusão exigem validação de identidade, registro interno, revisão do escopo e entrega segura. Prazo legal e exceções devem ser confirmados por orientação jurídica aplicável.
