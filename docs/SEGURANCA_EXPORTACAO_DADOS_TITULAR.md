# Exportação de dados do titular

## Fluxo recomendado

1. Receber solicitação por canal oficial e registrar protocolo.
2. Validar identidade com sessão autenticada e confirmação adicional; admin não deve confiar apenas no ID informado.
3. Confirmar escopo e consultar somente o `student_id` validado.
4. Revisar o pacote para remover segredos, hashes, tokens, gabaritos protegidos e dados de terceiros.
5. Entregar por canal autenticado ou link privado de curta duração.
6. Registrar responsável, data, escopo e confirmação de entrega.

## Dados exportáveis

- cadastro seguro de `students`/perfil, sem hashes ou identificadores secretos;
- `student_jornadas` e `student_jornada_simulados`;
- `simulado_attempts`, respostas próprias e resultados;
- notas, feedbacks e atividade própria pertinente;
- registros de comunicação vinculados, se existirem e não contiverem dados de terceiros.

Formatos recomendados: JSON estruturado como fonte principal, CSV por coleção e PDF apenas como resumo futuro. O prazo interno deve ser definido com o jurídico e ser menor que o prazo legal aplicável.

## Não implementado nesta sprint

O endpoint `export-data` não foi criado. Ainda é necessário definir canal seguro de entrega, escopo de gabaritos/conteúdo protegido, retenção do arquivo e protocolo da solicitação. Uma resposta JSON direta em endpoint admin poderia vazar dados no navegador ou em logs/downloads locais.
