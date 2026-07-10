# Exclusão e anonymização de dados

## Princípio

Pedidos devem ser validados e analisados antes de qualquer operação irreversível. O fluxo comum começa bloqueando/inativando a conta, suspendendo Jornadas ativas e preservando evidências necessárias.

## Cenários

- Aluno ativo: bloquear acesso e interromper novas operações antes da análise.
- Jornada ativa: cancelar/pausar matrícula conforme decisão operacional.
- Histórico pedagógico: preservar tentativas/resultados somente com finalidade e prazo definidos, preferencialmente anonymizados.
- Estatísticas: manter apenas registros sem identificação direta quando necessário.
- Segurança/obrigação: preservar o mínimo necessário após validação jurídica.

## Estratégia recomendada

- Nome: `Usuário anonimizado`.
- E-mail: endereço técnico único não entregável baseado em identificador irreversível, não necessariamente o UUID exposto.
- Telefone, CPF, avatar, Google ID e interesses: remover quando permitido.
- Auth: bloquear/remover identidade somente em etapa coordenada, após garantir integridade das FKs.
- Notas e feedbacks: remover ou anonymizar conforme escopo aprovado.
- Tentativas/resultados: preservar sem identificadores diretos quando houver justificativa.

## Não implementado nesta sprint

O endpoint `anonymize` não foi criado e nenhum dado real foi alterado. A tabela possui e-mail único, vínculo com Supabase Auth e relações históricas; uma operação parcial poderia bloquear login sem anonymizar tudo ou quebrar integridade. São necessários confirmação dupla, transação/RPC, política de retenção e teste em staging.
