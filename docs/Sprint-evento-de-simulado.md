# Sprint Evento de Simulado — Documentação Funcional, Técnica e Operacional

## Regra vigente no código local — tentativas por contexto (2026-09-09)

**Migration preparada anteriormente; não executada pelo agente:** `supabase/migrations/20260909160000_move_attempt_limits_to_contexts.sql`. Esta seção substitui as descrições históricas abaixo que atribuem o limite ao Simulado, permitem novos inícios avulsos ou propõem herdar o limite antigo no backfill. A auditoria posterior abaixo atualiza o estado observado do schema remoto; não presumir que a migration continue pendente no banco.

- `jornadas.max_attempts` e `simulado_events.max_attempts`: inteiro positivo, obrigatório, default 3; editável pelo Admin. A duplicação copia o limite do contexto de origem.
- Todas as Jornadas e todos os Eventos existentes recebem 3, independentemente dos valores antigos dos Simulados. **PCMG - Informática: 3 tentativas para cada um dos 8 Simulados**, sem compartilhar um saldo de 3 entre eles.
- A migration preenche e valida ambos os contextos antes de remover `simulados.max_attempts`. O Simulado deixa de exibir ou persistir seletor de tentativas, inclusive na criação, edição, duplicação e resumo/PDF administrativo.
- `resolveAttemptLimit` em `lib/server/attemptLimit.ts` resolve o limite pelo vínculo autenticado da Jornada ou participação no Evento. Não existe fallback para o Simulado. `getContextualSimuladoAttempts` continua isolando o consumo por aluno, Simulado e contexto; consumir tentativas em um contexto não reduz o saldo de outro.
- O DTO de execução/listagem usa `attempt_limit`; os cadastros dos contextos usam `max_attempts`. Cards, regras, cronogramas e o servidor consultam o limite atual. Novos snapshots registram `attempt_limit`; snapshots históricos não são reescritos.
- Novas execuções exigem Jornada ou Evento. Histórico e resultados avulsos permanecem consultáveis; a retomada de uma tentativa existente mantém o fluxo anterior. Reduzir o limite não encerra uma tentativa em andamento nem apaga consumo histórico; aumentar o limite libera somente a diferença disponível.
- Permanecem as regras de `counts_toward_limit`, correção, resultado oficial, `representative_attempt_id`, ranking e TopCoins. Esta entrega não implementa limite individual substituto: propostas históricas de `max_attempts_override` não são fonte de autorização no fluxo atual.

**Aplicação futura:** coordenar a implantação do código com a mudança de schema, pois o código novo exige as colunas dos contextos e o código antigo pode consultar a coluna removida. Preservar backup dos valores antigos antes da aplicação: após o commit SQL, restaurar esses valores exige recuperação explícita. A transação cancela todas as suas alterações em caso de falha; não há `CASCADE`, alteração de RLS ou reclassificação de tentativas. Nenhuma migration existente foi modificada.

**Validação local:** TypeScript e build aprovados; nenhum diagnóstico adicional de lint por arquivo/regra em comparação com HEAD. Os 17 testes novos passaram. Suíte ampliada: 373 passaram e 1 falhou (`tests/event-operations/active-attempt-metric.spec.ts:219`, busca textual de `label="Realizando"` já incompatível com o painel do Professor em HEAD; painel e teste não alterados nesta entrega). `git diff --check` aprovado. A migration não foi executada, nem mesmo pelos testes. Não houve homologação visual ou integrada com o novo schema; esta depende de código e schema compatíveis. Sem commit, push ou deploy.

**Projeto:** EstudoTOP Simulados  
**Módulo:** Evento de Simulado  
**Status:** especificação funcional consolidada — pronta para análise técnica e implementação  
**Data da consolidação:** 2026-08-20  
**Objetivo:** criar um novo recurso para aplicação coletiva e temporária de um único Simulado, com controle de acesso, cadastro simplificado de alunos, perfil de professor, dashboard de resultados em tempo real e liberação controlada dos resultados.

---

# 1. Princípio central

O **Evento de Simulado** é uma camada temporária de aplicação de um Simulado existente.

Ele **não substitui** o módulo de Simulados e **não se cruza funcionalmente com Jornadas**.

O Simulado continua sendo a fonte oficial de:

- questões;
- alternativas;
- tipo de prova;
- regras de navegação;
- tempo de prova;
- tentativas;
- modelo de pontuação;
- regra de tentativa válida;
- cálculo de resultado;
- TopCoins;
- gabarito;
- comentários;
- vídeo de correção;
- Parecer da Coruja;
- desempenho por assunto;
- página de resultado;
- dashboard e inteligência de resultados.

O Evento controla apenas o contexto temporário e coletivo da aplicação:

- período de inscrição e início;
- abertura automática ou antecipada;
- encerramento;
- vínculo de alunos;
- vínculo de professores;
- política de visibilidade dos resultados;
- recorte estatístico da aplicação;
- acesso do professor à dashboard em tempo real.

Regra arquitetural:

> O Simulado é a prova e o motor de resultados. O Evento de Simulado é a aplicação coletiva, temporária e controlada dessa prova.

---

# 2. Relação entre Simulado, Jornada e Evento

A arquitetura conceitual passa a ser:

```text
                    ┌── Jornada
Simulado ───────────┤
                    └── Evento de Simulado
```

As relações são independentes.

Um Simulado pode:

- não estar em nenhuma Jornada ou Evento;
- estar somente em Jornada;
- estar somente em Evento;
- estar simultaneamente em Jornada e Evento;
- estar em mais de uma Jornada;
- estar em mais de um Evento.

Jornada e Evento não dependem um do outro.

## 2.1 Regra de cardinalidade do Evento

> **1 Evento de Simulado = 1 Simulado.**

Um Evento nunca agrupa vários Simulados.

A Jornada continua sendo o recurso destinado a organizar vários Simulados em percurso de estudo.

---

# 3. Precedência de configurações

A configuração normal do Simulado permanece intacta.

O Evento não deve duplicar o editor de Simulado nem alterar permanentemente suas configurações.

Quando uma tentativa for originada dentro de um Evento, a regra de precedência será:

```text
Configuração do Evento
        ↓
Configuração do Simulado
        ↓
Comportamento normal da plataforma
```

Essa precedência vale somente para os aspectos que pertencem ao Evento.

## 3.1 Principal override da V1

O principal override da V1 é a **visibilidade do resultado**.

Exemplo:

```text
Simulado:
Mostrar resultado ao finalizar = SIM

Evento:
Resultados = BLOQUEADOS
```

Comportamento efetivo:

```text
Aluno conclui
→ resultado é calculado
→ resultado é armazenado
→ dashboard administrativa/professor recebe os dados normalmente
→ aluno não visualiza o resultado
→ resultado aguarda liberação
```

A configuração original do Simulado não é modificada.

Se o mesmo Simulado for acessado fora do Evento, continua seguindo suas regras normais.

---

# 4. Contexto da tentativa

Toda tentativa realizada através de Evento deve carregar ou permitir identificar inequivocamente o seu contexto.

Regra obrigatória:

> Nunca bloquear ou liberar resultado apenas porque determinado Simulado está vinculado a algum Evento. A regra deve considerar se **aquela tentativa específica** foi originada naquele Evento.

Isso permite que o mesmo Simulado seja usado simultaneamente:

- em Evento;
- em Jornada;
- de forma avulsa;

sem conflito de comportamento.

---

# 5. Estados oficiais do Evento

Os estados oficiais da V1 serão:

| Estado | Significado |
|---|---|
| `scheduled` / Agendado | Evento criado e ainda não iniciado. |
| `active` / Em andamento | Evento aberto para novas tentativas. |
| `closed` / Encerrado | Não aceita novos inícios, mas tentativas já iniciadas continuam. |
| `archived` / Arquivado | Exclusão lógica administrativa; histórico preservado. |

O estado dos resultados é independente do estado do Evento.

---

# 6. Criação do Evento

O Admin cria e configura o Evento.

A configuração deverá possuir, no mínimo:

- nome do Evento;
- Simulado vinculado;
- data de início;
- hora de início;
- data de término;
- hora de término;
- duração total em minutos;
- política de resultados: Bloqueado ou Liberado;
- professores atribuídos, opcionalmente;
- código interno curto do Evento;
- link público de ingresso;
- status.

## 6.1 Horário oficial

Todos os horários do Evento deverão ser tratados e apresentados explicitamente como:

> **Horário de Brasília**

A interface do aluno e do professor deve deixar isso claro.

## 6.2 Data, hora e duração

O Admin informa:

- data/hora de início;
- data/hora de término.

O sistema calcula automaticamente a duração total em minutos.

O campo de duração é editável.

Regras bidirecionais:

- alterar término recalcula duração;
- alterar duração recalcula término;
- alterar início deve recalcular duração ou término de forma coerente com o campo que estiver sendo preservado pela interface.

---

# 7. Início do Evento

O Evento inicia automaticamente na data e hora programadas.

Não depende de ação do Admin ou do professor.

## 7.1 Iniciar agora

Antes do horário programado:

- Admin pode iniciar;
- professor atribuído pode iniciar pela própria dashboard.

Ao clicar em **Iniciar agora**:

- o Evento passa imediatamente para Em andamento;
- os alunos vinculados deixam a tela de espera;
- novas inscrições continuam permitidas enquanto o Evento estiver dentro do prazo;
- o horário final originalmente configurado permanece inalterado.

O botão antecipa a abertura, não desloca automaticamente o encerramento.

---

# 8. Encerramento do Evento

O Evento pode ser encerrado de duas formas:

1. automaticamente, ao chegar à data/hora final;
2. manualmente, pelo Admin.

As duas formas obedecem à mesma regra.

## 8.1 Efeito do encerramento

Ao encerrar:

- nenhum novo aluno pode se vincular ao Evento;
- nenhuma nova tentativa pode ser iniciada;
- tentativas já iniciadas continuam normalmente;
- prevalece o tempo próprio do Simulado para quem já iniciou;
- o resultado não é liberado automaticamente;
- dashboard continua disponível e atualizando enquanto existirem tentativas em andamento.

Exemplo:

```text
Evento termina às 22:00
Aluno iniciou às 21:58
Simulado possui 60 minutos
→ aluno pode continuar até o limite normal da tentativa
```

## 8.2 Informação na dashboard

Se o Evento estiver encerrado, mas houver tentativas em andamento:

> **Evento encerrado — X alunos ainda estão realizando o Simulado.**

O professor continua acompanhando normalmente.

---

# 9. Reabertura do Evento

Um Evento encerrado pode ser reaberto pelo Admin.

A reabertura:

- volta a aceitar participantes e novas tentativas;
- exige nova data/hora de término;
- não apaga inscrições anteriores;
- não apaga tentativas;
- não apaga resultados;
- não reinicia estatísticas;
- não altera resultados já liberados;
- não muda automaticamente a política atual de resultados.

O Evento permanece sendo o mesmo Evento.

---

# 10. Arquivamento / exclusão lógica

A ação administrativa de excluir um Evento deverá ser implementada como **arquivamento/exclusão lógica**, não como destruição física do histórico.

Devem ser preservados:

- Evento;
- professores relacionados;
- participantes;
- origem cadastral dos alunos;
- tentativas;
- respostas;
- resultados;
- TopCoins;
- dashboard;
- estatísticas;
- histórico.

Arquivar serve para organização administrativa.

Nunca deve apagar o patrimônio pedagógico do aluno.

---

# 11. Duplicar Evento

O Admin poderá duplicar um Evento existente.

O novo Evento:

- recebe novo identificador;
- recebe novo código;
- recebe novo link;
- nasce Agendado;
- pode copiar configurações gerais;
- pode copiar professores atribuídos;
- não copia participantes;
- não copia inscrições;
- não copia tentativas;
- não copia respostas;
- não copia resultados;
- não copia estatísticas;
- **não copia o Simulado vinculado**.

Regra obrigatória:

> Um Evento duplicado nasce sem Simulado. O Admin deve vincular novamente um Simulado antes de colocá-lo em operação.

---

# 12. Troca do Simulado vinculado

O Admin pode trocar o Simulado vinculado enquanto não houver consolidação real do Evento.

Regras:

- teste do professor em **Ver como aluno** não bloqueia troca;
- enquanto houver aluno real com tentativa em andamento, a troca fica temporariamente bloqueada;
- se não houver mais tentativa real em andamento e nenhuma tentativa real concluída, pode voltar a trocar;
- após a primeira tentativa concluída por um aluno real, a troca do Simulado fica definitivamente bloqueada.

Tentativas de professor não entram nessa regra.

---

# 13. Link público do Evento

Ao criar o Evento, o sistema gera um link público específico.

Esse link é o meio principal de divulgação do Evento.

Exemplo conceitual:

```text
https://simulados.estudotop.com.br/evento/<identificador>
```

O aluno não precisa digitar código para ingressar quando usa o link oficial.

O código curto pode existir como identificador administrativo e operacional, por exemplo:

```text
ES-2547
```

Mas não é obrigatório no fluxo normal de ingresso.

---

# 14. Fluxo de ingresso do aluno pelo link

Ao abrir o link:

1. o sistema identifica o Evento;
2. a primeira tela solicita apenas o e-mail;
3. o sistema verifica se o e-mail já existe.

## 14.1 Aluno novo

Se o e-mail não existir:

```text
E-mail não encontrado
→ prossegue para cadastro
→ e-mail já vem preenchido
→ aluno conclui cadastro
→ conta nasce ATIVA
→ participação no Evento é criada
→ aluno segue o fluxo normal de autenticação/entrada
```

O cadastro originado por Evento é exceção controlada.

A regra normal de cadastro da plataforma permanece inalterada.

## 14.2 Aluno já existente

Se o e-mail já existir:

- não criar novo cadastro;
- informar que já existe conta;
- oferecer login;
- oferecer recuperação de senha;
- preservar o contexto do Evento;
- vincular definitivamente o Evento somente após autenticação bem-sucedida.

Mensagem conceitual:

> Já encontramos seu cadastro no EstudoTOP. Entre na sua conta para confirmar a participação neste Evento.

---

# 15. Persistência do contexto durante autenticação

O Evento iniciado pelo link não pode ser perdido durante:

- login;
- esqueci minha senha;
- recuperação de senha;
- redefinição de senha;
- redirecionamentos de autenticação;
- primeiro acesso.

Regra obrigatória:

> O sistema deve preservar com segurança a intenção de ingresso no Evento até que a autenticação seja concluída.

Após autenticação:

- validar novamente o Evento;
- validar se ainda aceita participantes;
- concluir associação;
- eliminar o estado pendente;
- redirecionar ao Evento.

A operação deve ser idempotente.

O mesmo aluno nunca pode receber duas participações no mesmo Evento.

---

# 16. Cadastro originado por Evento

O cadastro convencional da plataforma permanece com a regra atual.

Somente o cadastro originado por um link válido de Evento possui ativação automática.

Regra:

```text
Cadastro normal
→ segue o fluxo normal da plataforma

Cadastro via Evento válido
→ cria aluno ativo
→ vincula ao Evento
```

Essa exceção deve ser validada server-side.

Não pode ser acionada por simples parâmetro manipulável pelo navegador.

---

# 17. Aluno único, múltiplos Eventos

Nunca criar um cadastro por Evento.

A identidade do aluno é única.

Modelo conceitual:

```text
Aluno
├── Evento A
├── Evento B
└── Evento C
```

O sistema deve distinguir:

- alunos únicos;
- participações em Eventos.

Exemplo:

```text
1.000 alunos únicos
1.700 participações em Eventos
```

---

# 18. Origem cadastral

Alunos cadastrados por Evento continuam como alunos ativos normais da plataforma após o encerramento.

O sistema deverá preservar internamente a origem:

- origem do cadastro;
- Evento de origem;
- data do cadastro.

Isso permite medir aquisição por parceria e por Evento.

---

# 19. Ingresso enquanto o Evento está em andamento

Novos alunos podem entrar pelo link enquanto o Evento estiver Em andamento e dentro do prazo.

Eles podem:

- cadastrar;
- autenticar;
- vincular-se;
- iniciar o Simulado;

desde que o Evento ainda não esteja encerrado.

Após o encerramento:

- link continua acessível de forma informativa;
- não aceita novas inscrições;
- não aceita novos vínculos;
- não permite novas tentativas.

---

# 20. Link acessado novamente por participante existente

Se o aluno já estiver vinculado:

## Autenticado

Direcionar conforme o estado:

- Agendado → tela de espera;
- Em andamento → página do Evento;
- Encerrado → status/histórico/resultados disponíveis;
- Arquivado → histórico, conforme as regras do aluno.

## Não autenticado

- direcionar ao login;
- preservar contexto;
- retornar automaticamente ao Evento após autenticação.

---

# 21. Área do aluno

A navegação da área do aluno será condicional.

## 21.1 Minhas Jornadas

Aparece somente se o aluno possuir participação em Jornada.

## 21.2 Meus Eventos

Aparece somente se o aluno possuir participação em Evento.

A lista de Eventos deve mostrar:

- nome;
- professor(es), quando houver;
- status;
- situação individual;
- ações adequadas ao momento;
- botão **Ver meus resultados**, quando disponível.

---

# 22. Status visuais do aluno

Os cards podem utilizar tons diferentes para facilitar leitura, preservando o design clean e premium da área do aluno.

Estados/situações possíveis incluem:

- Agendado;
- Em andamento;
- Encerrado;
- Não realizado;
- Concluído;
- Resultado aguardando liberação;
- Resultado disponível.

As cores devem ser sutis, consistentes e não excessivamente saturadas.

---

# 23. Tela pré-evento do aluno

Antes da abertura, mostrar apenas:

- nome do Evento;
- professor(es);
- data e hora de início;
- indicação explícita de horário de Brasília;
- contagem regressiva.

Não exibir:

- questões;
- quantidade de questões;
- duração da prova;
- estatísticas;
- informações coletivas;
- qualquer pista do conteúdo.

---

# 24. Direcionamento do aluno logado

Se o aluno estiver vinculado a um Evento agendado e entrar na plataforma no contexto de espera, o fluxo deve levá-lo diretamente à tela de espera do Evento.

---

# 25. Regras exibidas antes do início

Antes de iniciar uma tentativa, o aluno deve visualizar um bloco de regras claras.

Incluir:

- início e término do Evento;
- horário de Brasília;
- até quando novas tentativas podem ser iniciadas;
- número de tentativas permitido pelo Simulado;
- número de tentativas restantes;
- aviso de que, após encerramento do Evento, não é possível iniciar nova tentativa;
- aviso de que tentativa iniciada antes do encerramento pode ser concluída normalmente;
- política atual de resultado;
- explicação de que o resultado poderá aguardar liberação;
- explicação de que a liberação dá acesso à experiência normal de resultado do Simulado;
- regras de alternância de guia/janela/aplicativo;
- aviso de que violações de foco podem ser tratadas como cola e podem encerrar a tentativa, conforme regras do Simulado.

As regras de segurança não devem ser recriadas em paralelo: devem refletir as regras reais do motor de Simulados.

---

# 26. Tentativas dentro do Evento

O Evento não cria regra própria de tentativas.

Continuam valendo:

- `max_attempts`;
- regra de contagem;
- tentativa válida;
- resultado real;
- demais regras existentes no Simulado.

Enquanto o Evento estiver aberto e o aluno ainda tiver tentativas válidas, pode realizar nova tentativa.

Depois do encerramento, não pode iniciar nova tentativa, mesmo que ainda exista limite disponível no Simulado.

---

# 27. Tentativa oficial / representativa

O resultado individual continua seguindo a regra oficial do Simulado.

A dashboard coletiva precisa representar cada aluno apenas uma vez.

Regra:

> Cada aluno deve contribuir com uma única tentativa representativa para as estatísticas coletivas do Evento.

Durante essa tentativa:

- a resposta atual é acompanhada em tempo real;
- se o aluno mudar de alternativa, a distribuição deve refletir a nova resposta;
- a alternativa anterior deixa de contar;
- cada aluno representa no máximo uma resposta por questão.

Tentativas posteriores permitidas pelo Simulado:

- continuam existindo no histórico individual;
- não distorcem percentuais coletivos;
- não acrescentam novas observações à estatística principal do Evento.

---

# 28. Dashboard de resultados pertence ao Simulado

O Evento não terá um motor estatístico paralelo.

A dashboard de resultados é recurso do módulo de Simulados.

O Evento fornece apenas um recorte:

> considerar as tentativas representativas originadas naquele Evento.

A mesma inteligência estatística deve ser reutilizada sempre que possível.

---

# 29. Dashboard do professor — princípio geral

A dashboard é o principal ambiente operacional do professor.

Ela deve permanecer acessível:

- antes do Evento;
- durante o Evento;
- depois do encerramento;
- após consolidação dos resultados;
- em Evento arquivado, enquanto o professor continuar atribuído.

Ela não é apenas uma tela ao vivo.

Também funciona como relatório histórico permanente daquela aplicação.

---

# 30. Perfil Professor

A Sprint cria uma terceira role oficial:

- Admin;
- Professor;
- Aluno.

## 30.1 Cadastro do professor

Somente o Admin cadastra professores.

Campos da V1:

- nome;
- e-mail;
- WhatsApp;
- status ativo/inativo.

Não incluir na V1:

- foto;
- avatar;
- biografia;
- especialidade;
- redes sociais;
- outros dados.

Após cadastro:

- professor recebe e-mail;
- link seguro para definir senha;
- depois acessa normalmente a plataforma.

Não existe autocadastro público de professor.

---

# 31. Professores por Evento

Um Evento pode possuir:

- zero professores;
- um professor;
- vários professores.

Professor não é obrigatório.

A atribuição pode ocorrer:

1. dentro do Evento, selecionando professores;
2. no perfil/cadastro do professor, atribuindo Eventos.

Um professor só pode acessar Eventos atribuídos a ele.

Acesso por URL direta a Evento não atribuído deve ser bloqueado server-side.

---

# 32. Professor e Jornada

A possibilidade futura de professor em Jornada é reconhecida, mas **não faz parte do escopo funcional desta Sprint**.

Não criar nesta Sprint:

- painel de Jornada para professor;
- permissões de professor em Jornada;
- regras de acompanhamento de Jornada;
- edição de Jornada por professor.

A role deve nascer de forma que evolução futura seja possível, sem implementar comportamento ainda não definido.

---

# 33. Entrada do professor no sistema

Fluxo oficial:

```text
Professor faz login
        ↓
Meus eventos
        ↓
Lista de Eventos atribuídos
        ↓
Escolhe um Evento
        ↓
Tela intermediária
        ├── Ver simulado como aluno
        └── Dashboard de resultados
```

Não direcionar automaticamente o professor para a dashboard.

---

# 34. Ver simulado como aluno — professor

O professor pode acessar o Simulado como aluno para:

- revisar;
- testar;
- preparar aula;
- verificar comportamento.

Esse acesso:

- pode ocorrer mesmo antes do Evento iniciar;
- não conta como participante;
- não entra na dashboard;
- não altera percentuais;
- não entra na média;
- não conta como conclusão real;
- não bloqueia troca definitiva do Simulado;
- não interfere em TopCoins;
- não interfere em resultados dos alunos.

Deve ser tecnicamente marcado como execução de teste/preview do professor.

---

# 35. Permissões do professor na V1

Professor pode:

- ver Eventos atribuídos;
- abrir tela intermediária;
- Ver simulado como aluno;
- abrir dashboard;
- acompanhar inscritos;
- acompanhar online;
- acompanhar andamento;
- visualizar estatísticas agregadas;
- visualizar dados por questão;
- visualizar participantes e resultados individuais;
- usar **Iniciar agora**;
- usar **Liberar resultados** quando aplicável.

Professor não pode:

- criar Evento;
- editar configuração estrutural;
- trocar Simulado;
- alterar datas;
- alterar professores;
- arquivar;
- excluir;
- reabrir;
- encerrar manualmente;
- alterar configuração do Simulado.

---

# 36. Dashboard pré-evento do professor

Antes do início, mostrar:

1. participantes inscritos;
2. participantes online naquele momento;
3. lista nominal dos inscritos;
4. contagem regressiva;
5. botão **Iniciar agora**.

O acesso **Ver como aluno** permanece na tela intermediária anterior.

---

# 37. Participante online

Para a experiência definida, participante online representa o aluno vinculado ao Evento que está autenticado/logado na plataforma naquele momento.

Como o aluno vinculado será conduzido para a tela de espera do Evento, o indicador deve representar de forma útil quantos participantes já estão presentes na plataforma aguardando ou realizando o Simulado.

A implementação técnica da presença deve evitar custo excessivo e falsos positivos, sem transformar a Sprint em um sistema complexo de telemetria.

---

# 38. Dashboard em andamento — visão geral

Durante o Evento, a primeira área da dashboard deve apresentar dados executivos, organizados em painéis/cards.

Exemplos de métricas:

- participantes inscritos;
- participantes online;
- não iniciados;
- realizando;
- concluídos;
- índice médio de acertos;
- índice médio de erros;
- questões em branco;
- tempo médio de resolução do Simulado;
- demais métricas gerais já suportadas pela dashboard de resultados do Simulado.

A dashboard deve atualizar em tempo real ou em tempo quase real de forma eficiente.

---

# 39. Dashboard — Painel de questões / modo aula

**Atualização visual de 2026-08-26:** o painel passou a usar composição clara premium nos estados de apresentação e revelação. Antes da revelação, alternativas permanecem neutras; o professor pode eliminá-las/reexibi-las localmente com a tesourinha e ajustar enunciado/alternativas em quatro níveis de tamanho. Depois da revelação, correta fica verde e recebe a coruja oficial dentro da bolinha, incorretas ficam vermelhas e cada alternativa exibe percentual, quantidade de alunos e minigráfico de dez barras derivado das estatísticas reais. Navegação, gabarito, cálculos, permissões e atualização silenciosa de dez segundos foram preservados.

O segundo grande painel é destinado à apresentação pedagógica.

O professor escolhe uma questão e ela aparece grande na tela.

## 39.1 Estado inicial: questão virgem

Exibir:

- número;
- enunciado completo;
- alternativas;
- imagens, quando houver.

Não exibir:

- gabarito;
- cores de correção;
- percentuais;
- estatísticas.

Esse modo deve ser adequado para projeção e compartilhamento de tela durante aula.

## 39.2 Exibir dados da questão

Botão:

> **Exibir dados**

Ao clicar, revelar:

- alternativa correta em verde;
- alternativas incorretas em vermelho/sinalização compatível com o design;
- percentual de marcações de cada alternativa;
- quantidade absoluta de respostas;
- acertos;
- erros;
- brancos;
- índice de acerto;
- tempo médio de resolução daquela questão.

Exemplo conceitual:

```text
A — 8,4%
B — 17,2%
C — 61,7% ✓
D — 10,1%
E — 2,6%

Tempo médio: 1min 34s
```

## 39.3 Ocultar dados

O professor pode voltar para o estado virgem usando:

> **Ocultar dados**

Mostrar/ocultar dados é apenas uma função da tela do professor.

Não:

- libera resultado;
- libera gabarito para aluno;
- altera tentativa;
- altera estado do Evento.

## 39.4 Navegação

A experiência deve facilitar:

- questão anterior;
- próxima questão;
- indicador X / total;
- seleção direta de questão.

---

# 40. Dashboard — Participantes

O terceiro painel é individual.

O professor pode visualizar os alunos daquele Evento.

Mostrar, conforme disponibilidade real de dados:

- nome;
- e-mail;
- WhatsApp, se aplicável;
- status;
- inscrição;
- início;
- conclusão;
- tempo;
- tentativas;
- resultado individual;
- percentual;
- tentativa oficial/representativa.

O professor possui acesso somente aos participantes de Eventos atribuídos a ele.

---

# 41. Dados coletivos nunca são mostrados ao aluno durante a prova

O aluno não deve ver:

- total de participantes;
- total online;
- média parcial;
- índice parcial de acertos;
- distribuição das alternativas;
- questão mais difícil;
- questão mais fácil;
- andamento dos demais participantes.

Esses dados pertencem exclusivamente à dashboard autorizada.

---

# 42. Resultado é sempre calculado

A política de bloqueio não interfere no cálculo.

Mesmo com resultados bloqueados:

```text
Aluno responde
→ respostas são persistidas
→ dashboard atualiza

Aluno conclui
→ resultado é calculado
→ resultado é armazenado
→ dashboard usa o resultado
→ Admin/professor autorizado pode visualizar
→ aluno pode continuar bloqueado
```

Nunca adiar cálculo para o momento da liberação.

---

# 43. Política de resultados do Evento

O Evento possui um seletor:

- **Bloqueado**
- **Liberado**

Esse seletor representa a política vigente para novos resultados.

---

# 44. Resultados = Liberado

Quando o seletor estiver em **Liberado**:

- não mostrar botão Liberar resultados;
- resultados pendentes devem ser liberados imediatamente ao alterar para esse estado;
- novos alunos que concluírem passam a receber automaticamente seus resultados;
- TopCoins seguem a liberação;
- experiência normal de resultado do Simulado é utilizada.

---

# 45. Resultados = Bloqueado

Quando estiver em **Bloqueado**:

- resultados continuam sendo calculados;
- dashboard continua recebendo tudo;
- Admin/professor vê os dados;
- aluno não recebe novo resultado automaticamente;
- TopCoins relacionados ao resultado ficam aguardando;
- aparece o botão **Liberar resultados** se houver resultados elegíveis ainda pendentes.

---

# 46. Botão Liberar resultados

O botão aparece somente quando:

- política atual = Bloqueado;
- existem resultados pendentes.

Ao clicar:

- libera todos os resultados elegíveis pendentes naquele instante;
- libera TopCoins correspondentes;
- registra data/hora da liberação por aluno/participação;
- envia e-mail de resultado disponível;
- **não altera o seletor**.

Exemplo:

```text
Resultados = BLOQUEADO
500 resultados pendentes

Professor:
[ Liberar resultados ]

→ 500 resultados são liberados
→ seletor continua BLOQUEADO
```

Se mais 30 alunos concluírem depois:

```text
30 novos resultados
→ permanecem bloqueados
→ botão volta a indicar resultados pendentes
```

---

# 47. Alterar seletor Bloqueado → Liberado

Ao mudar manualmente para **Liberado**:

1. liberar todos os resultados pendentes;
2. liberar TopCoins correspondentes;
3. registrar liberação por participante;
4. novos resultados passam a ser liberados automaticamente.

---

# 48. Alterar seletor Liberado → Bloqueado

É permitido voltar para Bloqueado.

Isso serve para:

- testes;
- homologação;
- controle pedagógico;
- suspensão de novas liberações.

Mas:

> resultados já efetivamente liberados para um aluno são definitivos.

O bloqueio posterior afeta somente resultados ainda não liberados.

---

# 49. Liberação individual definitiva

A plataforma deve distinguir:

## Estado do Evento

```text
Resultados:
Bloqueado / Liberado
```

## Estado da participação

```text
Resultado calculado:
SIM / NÃO

Resultado liberado:
SIM / NÃO

Data da liberação:
timestamp
```

Uma vez liberado para aquele participante:

- permanece acessível;
- não desaparece se o seletor voltar para Bloqueado;
- não desaparece se o Evento terminar;
- não desaparece se o Evento for reaberto;
- não desaparece se o Evento for arquivado.

---

# 50. TopCoins

TopCoins continuam sendo regra do Simulado.

No Evento:

- se resultado ainda não foi liberado → TopCoins vinculados ao resultado aguardam;
- quando o resultado for liberado → TopCoins seguem a regra normal;
- liberação definitiva do resultado implica preservação do respectivo histórico.

O Evento não cria nova fórmula de TopCoins.

---

# 51. Experiência ao concluir com resultado liberado

Se o resultado estiver liberado para aquele aluno no momento da conclusão:

- usar exatamente o fluxo normal do Simulado;
- exibir a tela intermediária com contagem regressiva já existente;
- encaminhar para a página normal de resultados.

Não criar uma segunda experiência de resultado.

---

# 52. Experiência ao concluir com resultado bloqueado

Se ainda não estiver liberado:

- não mostrar nota;
- não mostrar gabarito;
- não mostrar Coruja associada à faixa;
- não mostrar desempenho;
- não mostrar TopCoins;
- não mostrar qualquer pista indireta da nota.

Exibir confirmação de conclusão:

> Suas respostas foram registradas com sucesso.  
> Os resultados serão liberados conforme as regras definidas pelo professor.

A interface deve ser clean, clara e compatível com a área do aluno.

---

# 53. Conteúdo liberado

O Evento não cria controles separados para:

- nota;
- gabarito;
- Parecer da Coruja;
- comentários;
- desempenho por assunto;
- vídeo de correção;
- demais recursos.

Ao liberar o resultado, o aluno passa a receber **exatamente a experiência que a configuração normal do Simulado permitir**.

O Evento controla apenas a porta de acesso.

---

# 54. Ver meus resultados

Na área do aluno, o botão:

> **Ver meus resultados**

deve abrir a mesma experiência de resultado do Simulado já existente.

Usar a tentativa oficial correspondente ao Evento.

Não criar página de resultado específica para Evento.

---

# 55. Resultado permanente no histórico do aluno

Depois que o resultado for liberado para o aluno:

- permanece na área dele;
- permanece no histórico;
- permanece mesmo se Evento encerrar;
- permanece mesmo se Evento for arquivado;
- permanece independente da existência operacional do Evento na listagem do Admin.

O resultado pertence ao patrimônio pedagógico do Simulado/aluno.

---

# 56. E-mails da V1

A V1 terá apenas dois novos fluxos principais.

## 56.1 Cadastro/entrada no Evento

Quando aluno novo concluir cadastro pelo Evento:

- confirmar cadastro;
- informar que conta está ativa;
- nome do Evento;
- professor(es);
- data/hora de início;
- informar horário de Brasília;
- confirmar participação;
- levar para a plataforma.

Quando aplicável, participante existente também pode receber confirmação de vínculo, conforme decisão de implementação, sem duplicar mensagens desnecessárias.

## 56.2 Resultado liberado

Quando um resultado antes bloqueado for efetivamente liberado:

- informar que resultado está disponível;
- identificar Evento/Simulado;
- CTA para **Ver meus resultados**.

## 56.3 Padrão visual

Reutilizar os esquemas de e-mail já existentes no sistema:

- layout;
- identidade visual;
- tipografia;
- espaçamentos;
- botões;
- cabeçalho;
- rodapé;
- padrão de envio.

Não criar um sistema visual paralelo.

## 56.4 Falha de e-mail

Falha no envio nunca pode bloquear:

- cadastro;
- vínculo;
- resultado;
- TopCoins;
- liberação.

Operação principal deve persistir e a falha deve ser registrada.

---

# 57. Código curto do Evento

Pode existir um código curto para identificação, suporte e comunicação.

Formato sugerido:

```text
ES-2547
```

Regras:

- curto;
- fácil de ler;
- fácil de ditar;
- único;
- não usar como única barreira de segurança;
- link oficial continua sendo a forma principal de ingresso.

---

# 58. Segurança

A implementação deve exigir validação server-side em todos os fluxos sensíveis.

## 58.1 Cadastro automático

Ativação automática deve ocorrer somente quando:

- origem é um Evento válido;
- link/contexto é válido;
- Evento aceita novos participantes.

Não confiar em flag enviada pelo client.

## 58.2 Professor

Professor só acessa:

- Eventos atribuídos;
- participantes desses Eventos;
- dashboard desses Eventos.

Bloquear IDOR por troca de IDs/URLs.

## 58.3 Aluno

Aluno só acessa:

- própria participação;
- própria tentativa;
- próprio resultado;
- Evento ao qual está vinculado.

## 58.4 Resultado bloqueado

Bloqueio deve existir também no backend.

Não basta esconder componentes.

APIs não podem entregar ao browser:

- score;
- gabarito;
- faixa de desempenho;
- Coruja;
- tópicos errados;
- TopCoins derivados;
- qualquer informação capaz de revelar o resultado antes da liberação individual.

---

# 59. Tempo real

A dashboard deve aparentar atualização em tempo real.

Dados relevantes:

- inscritos;
- online;
- realizando;
- concluídos;
- respostas por questão;
- acertos;
- erros;
- brancos;
- distribuição por alternativa;
- tempo médio.

A implementação deve escolher mecanismo eficiente, evitando:

- consultar banco inteiro a cada segundo;
- queries desnecessariamente pesadas;
- recalcular histórico completo a cada mudança.

A tecnologia exata deve ser definida na análise técnica considerando a arquitetura atual do Supabase/Next.js.

---

# 60. Estatísticas por questão

Para cada questão, exibir:

- número;
- total de alunos representativos que responderam;
- acertos;
- erros;
- brancos;
- percentual de acerto;
- percentual de cada alternativa;
- tempo médio de resolução;
- alternativa correta;
- conteúdo completo da questão no modo aula.

As estatísticas devem considerar a tentativa representativa definida para o Evento.

---

# 61. Dashboard após o Evento

Depois do encerramento:

- dashboard permanece completa;
- professor continua acessando enquanto atribuído;
- dados deixam de ser transitórios e passam a representar consolidação histórica;
- nenhuma função analítica é removida apenas porque o Evento terminou.

Se ainda houver alunos resolvendo após o encerramento:

- dashboard continua atualizando;
- indicar quantidade ainda em andamento.

---

# 62. Eventos arquivados no painel do professor

Professor continua vendo Eventos arquivados enquanto permanecer atribuído.

Podem ser organizados em:

- Ativos;
- Encerrados;
- Arquivados;

ou outra organização equivalente.

Ao abrir, mantém:

- Ver simulado como aluno;
- Dashboard de resultados.

Controles operacionais incompatíveis com arquivamento devem ser ocultados/desabilitados.

---

# 63. Regras de UI — Admin

O recurso deverá possuir card administrativo próprio, seguindo a linguagem visual premium do sistema.

O card deve facilitar leitura de:

- nome;
- status;
- Simulado;
- início;
- término;
- duração;
- professores;
- participantes;
- resultados bloqueados/liberados;
- ações disponíveis.

Possíveis ações:

- abrir;
- editar;
- dashboard;
- iniciar agora;
- encerrar;
- reabrir;
- liberar resultados;
- duplicar;
- arquivar.

As ações exibidas dependem do estado.

---

# 64. Regras de UI — Professor

Área própria, sem acesso administrativo geral.

Entrada:

> **Meus eventos**

Listagem organizada por status.

Ao selecionar:

- **Ver simulado como aluno**
- **Dashboard de resultados**

A dashboard deve ser adequada para uso em aula e compartilhamento de tela.

---

# 65. Regras de UI — Aluno

A área do aluno deve permanecer clean.

`Meus eventos` aparece somente quando houver participação.

Prioridades visuais:

- nome;
- professor;
- status;
- horário;
- ação atual;
- resultado quando disponível.

Não mostrar telemetria coletiva.

---

# 66. O que não faz parte da V1

Para preservar o escopo, não incluir sem nova decisão:

- professor editando Simulado;
- professor criando Evento;
- professor encerrando Evento;
- professor reabrindo Evento;
- professor arquivando Evento;
- professor em Jornada;
- dashboard própria de Jornada;
- ranking público de alunos;
- comparação aluno x turma na área do aluno;
- chat de Evento;
- notificações de 24h/30min;
- múltiplos Simulados em um Evento;
- configuração separada de liberação de nota/gabarito/vídeo;
- cadastro público de professor;
- pagamentos;
- links comerciais;
- certificados;
- gamificação específica do Evento;
- novo motor de resultados;
- novo sistema de TopCoins.

---

# 67. Modelo de dados — diretrizes conceituais

A análise técnica deverá definir nomes finais, mas a modelagem precisa representar pelo menos:

## Evento

- id;
- nome;
- simulado_id;
- status;
- starts_at;
- ends_at;
- duration_minutes;
- result_policy;
- código;
- link/token/slug seguro;
- started_at real;
- closed_at;
- archived_at;
- created_by;
- timestamps.

## Participação do aluno

- event_id;
- student_id;
- joined_at;
- origem;
- tentativa representativa/oficial, quando necessário;
- result_released_at;
- demais flags estritamente necessárias.

Restrição única:

```text
(event_id, student_id)
```

## Professores do Evento

Relação muitos-para-muitos:

```text
(event_id, professor_id)
```

## Professor

- id/identidade;
- nome;
- e-mail;
- WhatsApp;
- status;
- vínculo com Auth/perfil.

A arquitetura final deve avaliar reutilização de `profiles` e evitar tabelas redundantes de identidade.

---

# 68. Migrations

Qualquer alteração estrutural deve obedecer à política oficial do projeto.

Novas migrations:

```text
supabase/migrations/YYYYMMDDHHMMSS_descricao.sql
```

Nunca executar automaticamente.

A Sprint deverá informar ao final:

- migrations criadas;
- impacto;
- dependências;
- ordem;
- necessidade de execução;
- rollback conhecido.

---

# 69. Integração com documentação oficial

Antes da implementação deverão ser consultados:

```text
docs/00-CONSTITUICAO-TECNICA.md
docs/01-POLITICA-GIT.md
docs/02-POLITICA-MIGRATIONS.md
docs/03-POLITICA-ASSETS.md
docs/04-POLITICA-DESENVOLVIMENTO.md
docs/05-POLITICA-DOCUMENTACAO.md
docs/06-POLITICA-DEPLOY.md
docs/07-CHECKLIST-SPRINT.md
docs/08-CHECKLIST-DEPLOY.md
docs/INDICE_FUNCOES_SISTEMA.md
docs/Sprint-simulados.md
docs/Sprint-resultados.md
docs/Sprint-jornadas.md
```

---

# 70. Índice funcional

Após implementação, `docs/INDICE_FUNCOES_SISTEMA.md` deverá documentar:

- módulo Evento de Simulado;
- rotas Admin;
- rotas Professor;
- rotas Aluno;
- APIs;
- componentes compartilhados;
- tabelas;
- migrations;
- regras de resultado;
- dashboard;
- contexto de tentativa;
- cadastro via Evento;
- permissões.

---

# 71. Fluxo de implementação recomendado

## Etapa 1 — Análise de impacto

- consultar Índice;
- mapear Simulados;
- mapear Resultados;
- mapear tentativa válida;
- mapear TopCoins;
- mapear cadastro;
- mapear Auth;
- mapear recuperação de senha;
- mapear dashboard atual de Simulados;
- mapear e-mails;
- mapear roles atuais.

## Etapa 2 — Banco e autorização

- Evento;
- participantes;
- professores;
- contexto de tentativa;
- liberação individual do resultado;
- constraints;
- índices;
- segurança.

## Etapa 3 — Role Professor

- cadastro Admin;
- e-mail de definição de senha;
- login;
- guard;
- Meus eventos;
- autorização por atribuição.

## Etapa 4 — Admin Evento

- listagem;
- card;
- criação;
- edição;
- professores;
- Simulado;
- datas;
- duração;
- resultados;
- duplicação;
- iniciar;
- encerrar;
- reabrir;
- arquivar.

## Etapa 5 — Link e cadastro do aluno

- entrada por e-mail;
- aluno novo;
- aluno existente;
- recuperação de senha;
- persistência de contexto;
- vínculo idempotente;
- ativação automática somente via Evento válido.

## Etapa 6 — Área do aluno

- Meus eventos condicional;
- lista;
- status;
- espera;
- regras;
- início;
- retomada;
- histórico;
- resultados.

## Etapa 7 — Resultado bloqueado/liberado

- política do Evento;
- liberação em lote;
- liberação automática;
- `result_released_at`;
- TopCoins;
- e-mail;
- proteção backend;
- fluxo pós-conclusão.

## Etapa 8 — Dashboard Professor

- pré-evento;
- geral;
- questão;
- modo aula;
- dados individuais;
- tempo real;
- histórico.

## Etapa 9 — Integração com dashboard do Simulado

- reutilizar consultas/lógica;
- aplicar filtro por Evento;
- garantir tentativa representativa;
- evitar duplicação estatística.

## Etapa 10 — Documentação e validações

- atualizar Sprint;
- atualizar Índice;
- TypeScript;
- build;
- testes;
- regressões;
- relatório final.

---

## 71.1 Fechamento dos bloqueadores de implementação — 2026-08-20

- A liberação de resultados foi centralizada em `releasePendingEventResults`, abrangendo Admin, Professor, mudança para política liberada e conclusão automática. Apenas participantes efetivamente liberados são processados; `result_release_email_sent_at` impede reenvio normal e `result_release_email_error` registra falhas sem reverter resultado ou TopCoins.
- A configuração administrativa do Evento permite atribuir zero, um ou vários professores na criação e edição. IDs são validados contra o cadastro oficial e a autorização do professor permanece baseada no vínculo persistido.
- A tela administrativa oferece reabertura de Evento encerrado com novo término futuro. O backend recalcula a duração e preserva todo o histórico e a política de resultados.
- A criação de Professor mantém o perfil inativo até concluir Auth, perfil, registro oficial e atribuições. Falhas executam compensação ordenada e são registradas; um marcador privado no metadata do Auth permite recuperar retries de cadastros incompletos sem converter contas de outros papéis.

## 71.2 Modo aula do Professor — 2026-08-20

- O painel de questões da dashboard do Professor renderiza o conteúdo oficial do Simulado pelo `QuestionDisplayCard`, incluindo rich text, imagens, alternativas variáveis e questões Certo/Errado.
- Cada questão abre no estado virgem. **Exibir dados** revela gabarito, distribuição por alternativa, quantidades, percentuais, acertos, erros, brancos concluídos e tempo médio; **Ocultar dados** restaura o estado virgem sem qualquer escrita no banco.
- A navegação anterior, próxima e direta sempre oculta os dados da nova questão para evitar revelação acidental.
- Os agregados são calculados no servidor somente com a tentativa representativa do participante e respostas do `event_id` atual. Trocas de alternativa substituem a resposta anterior; preview do Professor, outros Eventos, Jornadas e tentativas posteriores não entram no recorte.
- Branco representa somente tentativa representativa concluída sem resposta naquela questão. Participantes em andamento que ainda não alcançaram a questão não são classificados como branco.
- A mesma requisição protegida e o polling único de dez segundos da dashboard atualizam conteúdo e agregados. O endpoint exige Admin ou Professor ativo associado ao Evento.

## 71.3 Painel Participantes do Professor — 2026-08-20

- A terceira área da dashboard lista somente participantes do Evento autorizado, com nome, e-mail, ingresso, situação individual, início, conclusão, duração concluída, quantidade de tentativas naquele Evento, tentativa representativa, nota/percentual oficial e situação da liberação.
- O resultado oficial permanece visível ao Professor mesmo quando bloqueado para o aluno. `result_released_at` distingue **Resultado aguardando liberação** de **Resultado disponível** sem produzir qualquer escrita ou liberação individual.
- Tentativas são recortadas por `event_id` e `is_preview = false`; resultado e dados pedagógicos principais vêm exclusivamente de `representative_attempt_id`. Outros Eventos, Jornada, avulso e preview não entram.
- O status individual diferencia não iniciado, não realizado após encerramento/arquivamento, em andamento, concluído, desclassificado e expirado. Tentativa válida em andamento continua assim mesmo após o encerramento do Evento.
- A interface possui navegação clara entre Visão geral, Modo aula e Participantes, além de busca, filtro e paginação visual de 25 participantes. O mesmo polling central de dez segundos atualiza todos os painéis.

## 71.4 Fechamento consolidado do ciclo operacional — 2026-08-20

- Um Evento pode ser criado e duplicado sem Simulado, porém permanece em preparação: a ativação manual, a ativação efetiva pelo horário e a abertura de novas tentativas ficam bloqueadas até existir vínculo.
- Tentativas reais iniciadas dentro da janela continuam retomáveis depois do encerramento do Evento. O fechamento impede somente novas tentativas e preserva o prazo próprio da tentativa.
- As áreas do aluno atualizam o estado do Evento a cada dez segundos, mostram horário de Brasília, contagem regressiva, professores, tentativas utilizadas e restantes, política de resultado e regras de foco disponíveis no Simulado.
- A presença proporcional reutiliza `user_sessions`: a tela do aluno envia heartbeat a cada 30 segundos e a dashboard considera online a sessão ativa vista nos últimos 90 segundos. Não foi necessária migration adicional.
- A visão geral do professor usa apenas tentativas representativas do Evento para acertos, erros, brancos e tempo médio. O painel também separa inscritos, online, não iniciados, realizando, concluídos e resultados pendentes.
- Evento encerrado com tentativa em andamento exibe aviso explícito. Eventos arquivados permanecem consultáveis como histórico, são somente leitura no backend e na interface, e continuam podendo ser duplicados.

## 71.5 Correção final de segurança do ingresso e presença — 2026-08-20

- A presença deixou de usar o endpoint genérico de eventos de segurança. `POST /api/student/events/[id]/heartbeat` autentica o Bearer, deriva o aluno no servidor, exige participação no Evento e atualiza somente a sessão autenticada em `user_sessions`. O cliente envia heartbeat a cada 30 segundos nas telas do Evento e durante o Simulado do Evento; a dashboard considera online a atividade dos últimos 90 segundos.
- `session_touch` e `login_success` no endpoint genérico agora exigem Bearer válido e derivam UUID, papel, nome e e-mail no servidor. Campos de identidade enviados pelo navegador não determinam mais a sessão persistida.
- O ingresso público passou a exigir reCAPTCHA v3 server-side com ação `event_join_request`. A primeira resposta é neutra e não consulta nem revela a existência de conta.
- Um token opaco de 256 bits, associado no banco ao Evento, e-mail normalizado e validade de 24 horas, é enviado por Resend. Somente após o visitante abrir esse link o servidor decide entre login/recuperação ou cadastro, mantendo a intenção em cookie `HttpOnly`.
- Solicitações repetidas para o mesmo Evento/e-mail possuem cooldown de 60 segundos. Uma nova migration deduplica intenções pendentes e cria índice único parcial, garantindo no máximo uma intenção não consumida por Evento/e-mail mesmo sob concorrência.
- Aluno já autenticado pode ingressar diretamente: a API deriva a identidade do token e valida o Evento antes de criar o vínculo, sem solicitar novamente o e-mail.

## 71.6 Redução do cadastro por Evento para dois e-mails — 2026-08-21

- O fluxo de aluno novo originado por Evento passa a enviar exatamente dois e-mails: continuação do cadastro (posse do e-mail) e código de confirmação. O terceiro e-mail, que antes enviava um link separado para "criar senha", foi eliminado desse fluxo.
- Os dois e-mails reutilizam o `shell()` oficial de `app/lib/email/jornadaEmailTemplates.ts` (exportado nesta correção) — o mesmo usado pela matrícula/liberação de Jornada: fundo claro `#f8fafc`, cabeçalho navy `#0f172a` com eyebrow laranja "ESTUDOTOP SIMULADOS", card branco arredondado, blocos de destaque `#fff7ed`/`#f8fafc`. **Correção em 2026-08-21:** a primeira versão desta Sprint havia usado por engano o shell escuro `#050816`/`#0b1020` de `lib/email/jornadaEmailTemplates.ts` (arquivo na raiz, nunca importado por nenhum ponto de envio real — código órfão desde a linha de base). Ver seção 71.7.
- Depois do código correto, a conta do Evento já nasce ativa e recebe imediatamente, na própria resposta da API, um token de definição de senha (`purpose: "first_access"`, mesma tabela e mesmo mecanismo já usado pelo primeiro acesso por e-mail) — sem que esse token seja enviado por e-mail. A tela `/cadastro` evolui para uma etapa "Crie sua senha" dentro da mesma experiência, usando `PasswordRequirements`/`validatePassword` (política única do sistema) e enviando o token para `POST /api/auth/first-access` (endpoint existente, sem alteração).
- `students.approved_at` é preenchido automaticamente na criação de conta originada por Evento, para que o recovery convencional continue elegível mesmo que o aluno abandone a etapa antes de criar a senha. Desde 2026-09-03, esse recovery usa token próprio de uso único e Resend; ele não associa o Evento diretamente e preserva a intenção pendente para o fluxo de ingresso após o login.
- A tela pública `/evento/[slug]` recebeu uma segunda variação clara: a etapa antes de informar o e-mail permanece no visual escuro premium recém-criado; a etapa exibida depois do envio ("Enviamos um e-mail para você") passou a usar fundo claro, e-mail parcialmente mascarado e aviso sobre Spam/Promoções, para não ter aparência administrativa.
- Nenhuma migration foi criada ou alterada para esta correção.

## 71.7 Identidade visual oficial restaurada nos e-mails — 2026-08-21

- Auditoria via `git log`/`git diff` confirmou que `app/lib/email/jornadaEmailTemplates.ts` (arquivo realmente usado pelos 6 pontos de envio de e-mail de Jornada) não sofreu nenhuma regressão visual desde a linha de base (10/07) — a consolidação de 17/07 (`3557a8d`) foi puramente aditiva, preservando o `shell()` original (fundo claro, cabeçalho navy `#0f172a`, eyebrow laranja).
- A causa real do desalinhamento visual do Evento: `lib/email/jornadaEmailTemplates.ts` (raiz, nome quase idêntico) é código órfão desde a linha de base, nunca importado por nenhum ponto de envio real, com um shell escuro completamente diferente. A seção 71.6 havia usado esse arquivo por engano como referência.
- Correção: `shell()` de `app/lib/email/jornadaEmailTemplates.ts` foi exportado. `publicRegistrationCodeTemplate` (e-mail de código, compartilhado com o cadastro convencional) e `eventContinueRegistrationTemplate` (e-mail de continuação do Evento) passaram a reutilizá-lo diretamente — confirmado por render direto que o cabeçalho é byte-idêntico ao da matrícula de Jornada.
- O arquivo órfão `lib/email/jornadaEmailTemplates.ts` não foi removido — fica registrado como pendência de limpeza, fora do escopo desta correção.
- Nenhuma migration foi criada ou alterada para esta correção.

# 72. Testes funcionais obrigatórios

## Cadastro e ingresso

- aluno novo pelo link;
- ativação automática;
- aluno já existente;
- login;
- recuperação de senha;
- redefinição;
- retorno ao Evento;
- vínculo único;
- link encerrado;
- link ativo;
- reinscrição indevida bloqueada.

## Evento

- abertura automática;
- Iniciar agora pelo Admin;
- Iniciar agora pelo professor;
- término automático;
- encerramento manual;
- tentativa continua após encerramento;
- reabertura;
- arquivamento;
- duplicação;
- troca de Simulado antes da conclusão;
- bloqueio de troca após conclusão real.

## Professor

- acesso apenas a Eventos atribuídos;
- múltiplos professores;
- Ver como aluno não entra nas estatísticas;
- dashboard pré-evento;
- dashboard ao vivo;
- dashboard encerrado;
- dashboard arquivado;
- liberar resultados.

## Resultados

- resultado sempre calculado;
- bloqueado para aluno;
- liberado em lote;
- seletor continua bloqueado após botão;
- novos resultados continuam pendentes;
- Bloqueado → Liberado libera pendentes;
- Liberado → Bloqueado não recolhe resultados já liberados;
- resultado liberado permanece no histórico;
- TopCoins acompanham liberação;
- API não vaza dados bloqueados.

## Estatísticas

- cada aluno conta uma vez;
- mudança de alternativa atualiza distribuição;
- segunda tentativa não duplica estatística;
- professor teste não entra;
- acerto/erro/branco corretos;
- percentuais corretos;
- tempo médio correto;
- dashboard atualiza adequadamente.

## Área do aluno

- menu condicional;
- Evento agendado;
- espera;
- Evento aberto;
- regras;
- tentativas restantes;
- Evento encerrado;
- não realizado;
- concluído;
- aguardando resultado;
- Ver meus resultados.

---

# 73. Validações técnicas obrigatórias

Antes de encerrar a Sprint:

```bash
npx tsc --noEmit
```

```bash
npm run build
```

Também executar testes manuais e de regressão dos fluxos diretamente impactados.

Nenhum commit, push, migration ou deploy deve ocorrer automaticamente.

---

# 74. Critério de pronto da V1

A Sprint estará pronta quando:

- Admin criar Evento;
- Admin vincular um Simulado;
- Admin atribuir zero ou vários professores;
- Evento gerar link;
- aluno novo cadastrar-se pelo link sem aprovação manual;
- aluno existente entrar sem duplicar cadastro;
- recuperação de senha preservar o Evento;
- aluno ser vinculado uma única vez;
- pré-evento mostrar espera;
- abertura ocorrer automaticamente;
- professor puder Iniciar agora;
- encerramento impedir novos inícios;
- tentativa existente continuar;
- Evento puder ser reaberto;
- resultado for sempre calculado;
- dashboard atualizar com dados reais;
- professor enxergar geral, questões e alunos;
- modo aula funcionar;
- professor puder liberar resultados;
- política Bloqueado/Liberado funcionar conforme especificação;
- resultado liberado permanecer definitivo;
- TopCoins respeitarem a liberação;
- aluno usar a mesma página de resultados do Simulado;
- Eventos permanecerem no histórico do aluno;
- Evento puder ser arquivado sem perda;
- professor continuar acessando histórico enquanto atribuído;
- duplicação criar Evento vazio de Simulado;
- segurança impedir acessos indevidos;
- documentação e Índice estiverem sincronizados;
- TypeScript e build estiverem aprovados.

---

# 75. Regra de manutenção

Qualquer implementação ou alteração futura deste módulo deve consultar este documento antes de modificar o código.

A regra de precedência do projeto permanece:

1. Constituição Técnica;
2. políticas oficiais;
3. este documento da Sprint;
4. Índice funcional e documentação complementar;
5. decisões posteriores formalmente documentadas.

---

# 76. Síntese oficial

> **Evento de Simulado é a aplicação coletiva e temporária de um único Simulado existente. O Simulado continua sendo a fonte das regras da prova, tentativas, TopCoins, resultados e inteligência estatística. O Evento controla ingresso, janela temporal, professores, recorte das tentativas e visibilidade dos resultados. A dashboard do professor acompanha os dados em tempo real e permanece como histórico após o encerramento. Resultados sempre são calculados, mas somente se tornam visíveis ao aluno conforme a política do Evento; uma vez liberados para um participante, permanecem definitivamente em seu histórico.**

---

# 77. Correção — experiência do aluno cadastrado exclusivamente por Evento (2026-08-21)

Aluno com `students.origin_event_id` preenchido e nenhuma `student_jornadas` ativa/`!= cancelled` é tratado, na navegação, como "exclusivamente de Evento":

- Menu "Jornadas" (superior e lateral/hambúrguer) só aparece com pelo menos uma Jornada não cancelada.
- Menu "Simulados" (superior e lateral/hambúrguer) só aparece quando o aluno não tem origem exclusiva de Evento — independente de possuir Jornada. `event.simulado_id` nunca concede, por si só, acesso ao módulo geral de Simulados (regra já vigente, reafirmada).
- Modal/tutorial inicial das Corujas não abre automaticamente nesse estado; a supressão é contextual (nada é marcado como "já visto" — ver `GET /api/student/nav-access` e `AuthContext.studentNavAccess` no Índice Funcional, seção 25).
- Se o aluno deixar de ser exclusivamente de Evento (passa a ter Jornada), os dois menus e o tutorial voltam a seguir a regra normal automaticamente, sem qualquer ação manual de cadastro.
- Card de `/meus-eventos` reorganizado (status traduzido, Professor/Professores omitido quando ausente, data/hora em formato longo, "Sua situação" isolada, CTA por estado) — ver Índice Funcional, seção 25, para o detalhamento completo.

---

# 78. Extensão — gerenciamento administrativo de alunos em Eventos (2026-08-21)

O Admin passa a poder gerenciar participação em Evento pelos dois caminhos já usados para Jornada, sobre a mesma relação oficial (`simulado_event_participants`, sem tabela/coluna nova):

- **Dentro do Evento** (`/admin/eventos/[id]`, seção Participantes): buscar aluno ativo, adicionar, listar participantes atuais, remover quando seguro.
- **Dentro do perfil do aluno** (`/admin/alunos/[id]`, modal "Gerenciar Atividades", agora com abas Jornadas/Eventos): buscar Evento elegível, adicionar, listar Eventos atuais, remover quando seguro. A aba "Atividades atribuídas" do painel "Acompanhamento do aluno" também passou a listar os Eventos do aluno, ao lado das Jornadas.
- Ambos os caminhos chamam a mesma API (`POST`/`DELETE /api/admin/events/[id]/participants[/studentId]`) — nenhuma regra duplicada.
- Evento `scheduled` ou `active` (dentro da janela) aceita novo participante; `closed`/`archived` rejeita; reaberto volta a aceitar — reaproveita `effectiveEventStatus()`, a mesma função já usada pelo ingresso público.
- Só aluno com `status = 'active'` pode ser adicionado administrativamente — sem aprovação automática de cadastro pendente, diferente da regra de Jornada (decisão explícita desta extensão).
- Idempotente: nunca duplica participação, mesmo se o aluno for adicionado pelo Admin e depois abrir o link público.
- Histórico pedagógico nunca é apagado: remoção só é permitida quando o participante não possui nenhuma `simulado_attempts` vinculada (`event_participant_id`, protegida por `ON DELETE RESTRICT` desde a criação da tabela). Com tentativa registrada, a remoção é bloqueada e a participação permanece.
- **Pendência registrada, não implementada:** não existe hoje um estado de "participação cancelada com histórico preservado" para o aluno que já tem tentativa — a única ação disponível é manter a participação. Adicionar essa capacidade exigiria uma coluna nova em `simulado_event_participants`; não foi criada por não haver autorização explícita nesta entrega.

---

# 79. Correção — ingresso público no Evento não chamava o Resend em alguns casos (2026-08-22)

`POST /api/events/[slug]` gravava a intent em `simulado_event_join_intents` **antes** de chamar o Resend, e o cooldown de 60 segundos usava `created_at` da intent como se isso provasse envio real. Uma falha silenciosa do provider deixava uma intent sem e-mail correspondente, e qualquer nova tentativa dentro dos 60s seguintes recaía no cooldown — respondendo sucesso sem tentar o Resend de novo, sem nenhum registro no painel do provider.

- Correção final (ver seção 80 — a primeira tentativa de correção, invertendo a ordem para "Resend antes do insert", introduziu uma regressão distinta, corrigida no mesmo dia): a intent volta a ser gravada antes do Resend, mas a falha do envio passa a invalidar a intent explicitamente (`UPDATE` de `expires_at` para o passado) em vez de depender de `created_at` sem confirmação alguma.
- Mensagem de cooldown real agora é distinta da de sucesso, informando o tempo restante.
- Exclusão de aluno (comum e definitiva) passou a limpar as intents **não consumidas** do e-mail excluído — intents consumidas (histórico de auditoria) são preservadas.
- Nenhuma migration foi necessária — a estrutura existente (`created_at`, `consumed_at`, `expires_at`, índice único parcial) já era suficiente uma vez reordenada a lógica.

---

# 80. Correção — link de confirmação do Evento podia dar "inválido" por condição de corrida (2026-08-22)

A correção da seção 79 (gravar a intent só depois do Resend confirmar sucesso) resolveu o cooldown fantasma, mas abriu uma corrida nova: se o e-mail fosse entregue muito rápido, ou tivesse o link acessado automaticamente por um scanner de segurança do provedor de e-mail do destinatário, o clique podia acontecer antes de o `INSERT` terminar no banco — `POST /api/events/[slug]/confirm` não encontrava a intent e respondia "Link de confirmação inválido ou expirado", mesmo o e-mail tendo sido enviado com sucesso.

- Corrigido voltando a gravar a intent **antes** do envio, eliminando a corrida.
- Falha do Resend deixou de ser tratada com `DELETE` sem verificação de erro: agora é um `UPDATE` explícito de `expires_at` para o passado, invalidando a intent no mesmo instante — preservando a garantia da seção 79 (intent com `expires_at` no futuro só existe quando o envio foi de fato confirmado) sem reintroduzir a corrida entre e-mail entregue e token persistido.
- Nenhuma migration foi criada ou alterada.

---

# 81. Correção — home e navegação do aluno cadastrado exclusivamente em Eventos (2026-08-22)

A seção 77 já escondia corretamente "Jornadas"/"Simulados" para o aluno exclusivamente de Evento, mas com duas lacunas reais encontradas em teste: o menu superior nunca teve item "Eventos" (só o menu lateral tinha "Meus Eventos", via uma consulta própria e duplicada a `/api/student/events`), e o redirecionamento pós-login sempre mandava todo aluno para `/aluno` — página sem conteúdo relevante para quem só participa de Evento.

- **Definição de "somente Evento" corrigida e centralizada:** passou a exigir participação real (`simulado_event_participants`, contada pelo próprio `GET /api/student/nav-access`, novo campo `has_events`), e não mais apenas `students.origin_event_id`. Um aluno cadastrado fora de Evento e depois adicionado a um administrativamente (seção 78) também é reconhecido como "somente Evento" assim que tiver participação real e nenhuma Jornada — a origem de cadastro (`origin_event_id`) deixou de ser, sozinha, o sinal de "somente Evento" para efeitos de navegação (continua sendo usada apenas como proxy da regra de visibilidade do menu "Simulados", inalterada da seção 77).
- **Fonte única:** `isEventOnlyStudent()` e `studentHomePath()`, novas funções puras em `lib/student-nav.ts`, consomem o mesmo `AuthContext.studentNavAccess` (`hasJornadas`/`hasEventOrigin`/`hasEvents`) já buscado uma única vez por sessão. `Header`, `Sidebar` e `AppShell` chamam as mesmas funções — a consulta duplicada que o `Sidebar` fazia a `/api/student/events` só para saber se mostrava "Meus Eventos" foi removida.
- **Home contextual:** aluno "somente Evento" tem `/meus-eventos` como home (nunca um Evento específico automaticamente) — no redirect pós-login (rota pública → home por role) e no fallback de rota do aluno fora da lista permitida. Demais alunos continuam indo para `/aluno`/`/minhas-jornadas`, sem mudança de comportamento.
- **Sem flicker e sem trava:** o redirect pós-login aguarda `studentNavAccess` resolver antes de decidir entre `/aluno` e `/meus-eventos` (nunca mostra `/aluno` para depois trocar), com um timeout de segurança de 4s que garante o redirecionamento padrão (`/aluno`) mesmo se a chamada nunca responder.
- **Menu superior:** ganhou item "Eventos" (`/meus-eventos`), visível só com `has_events`. "Meu Painel"/logo, para aluno "somente Evento", passam a apontar para `/meus-eventos` em vez de `/aluno` — texto inalterado, só o destino.
- **Tutorial das Corujas:** condição de supressão passou a usar `isEventOnlyStudent()` (antes verificava só `hasEventOrigin && !hasJornadas`, sem considerar `hasEvents`) — corrige o caso de borda de um aluno com `origin_event_id` preenchido mas sem nenhuma participação real, que antes já teria o tutorial suprimido indevidamente. Segue sem persistir "visto" — supressão puramente contextual.
- Deep links (`/meus-eventos/[id]`, resultados, perfil, anotações) não foram alterados — a mudança afeta apenas a home/redirecionamento inicial.
- Nenhuma migration foi necessária. Nenhuma role, flag permanente ou coluna nova foi criada.

---

# 82. Correção — tela de login tinha destino pós-login próprio, não coberto pela seção 81 (2026-08-23)

Teste real (`contato@estudotop.com.br`, aluno com participação real em Evento e nenhuma Jornada) mostrou que a home ainda caía em `/aluno` ao entrar por `/login`, mesmo após a seção 81. Causa raiz: `app/login/page.tsx` (`handleLogin`) sempre teve sua **própria** decisão de destino pós-autenticação (`let destination = ... : "/aluno"`, seguida de `router.replace(destination)`), completamente independente do redirect do `AppShell.tsx` — a seção 81 corrigiu apenas o `AppShell`, então o login continuava usando o destino fixo antigo antes mesmo de o `AppShell` ter qualquer chance de agir.

- Correção: quando não há intenção de ingresso em Evento pendente (fluxo pré-existente e inalterado de `/api/events/join`, que só devolve `event_id` quando existe cookie `estudotop_event_intent` válido para aquela conta — usado exclusivamente para o aluno que acabou de clicar num link de Evento), o destino do aluno passa a ser calculado por `studentHomePath()` (`lib/student-nav.ts`), a partir de `GET /api/student/nav-access` — a mesma fonte única já usada por `Header`/`Sidebar`/`AppShell`. Se essa chamada falhar, o destino permanece `/aluno` (mesmo fallback seguro já usado pelo `AppShell`).
- O fluxo de auto-ingresso por intenção pendente (redirecionar direto para `/meus-eventos/[id]` do Evento recém-confirmado) não foi alterado — é um caso distinto e intencional, disparado só por quem acabou de confirmar o e-mail de um Evento.
- Nenhuma migration foi criada ou alterada.

---

# 83. Correção — "Evento não encontrado para sua conta" ao abrir Evento válido (2026-08-23)

Aluno realmente inscrito, com Evento `active` e Simulado vinculado, via `/meus-eventos` → "Entrar no evento" → `/meus-eventos/[id]`, recebia "Evento não encontrado para sua conta." — mesmo a listagem (`GET /api/student/events`) mostrando o Evento corretamente.

- **Causa raiz comprovada:** `GET /api/student/events/[id]` (`app/api/student/events/[id]/route.ts`) selecionava `simulados:simulado_id(...,focus_violation_limit)` — coluna que nunca existiu em `simulados` (confirmado via `information_schema.columns` e reprodução direta da query no banco operacional, erro real do Postgres: `42703: column s.focus_violation_limit does not exist`). O Supabase client descartava o `error` da query (`const { data: participant } = await ...`) e a rota tratava qualquer `participant` ausente — inclusive por falha da query — como "não encontrado", mascarando um erro de schema como 404.
- **`focus_violation_limit` nunca existiu:** não há coluna, migration ou menção em documentação para esse campo. A regra real de controle de foco é fixa e global — `simulado_attempts.focus_violation_count >= 3` desclassifica a tentativa (já documentado em `docs/Sprint-simulados.md`, "controle de foco") — nunca foi configurável por Simulado. Extraída para `FOCUS_VIOLATION_LIMIT = 3` em `lib/simulado-focus-violation.ts`, usada pelas duas rotas que aplicam a regra (`.../attempts/[attemptId]/focus-violation/route.ts` e `.../attempts/[attemptId]/route.ts`, que tinham o mesmo `>= 3` duplicado) e pelo texto exibido em `/meus-eventos/[id]` — elimina o risco de o texto da tela divergir da regra real.
- **Correção da query:** removida a coluna inexistente. Query equivalente testada diretamente no banco operacional confirma retorno correto da participação após a remoção.
- **Erro de banco não é mais mascarado como 404:** a rota agora captura `error` da query; se houver erro, registra via `logSystemError` (`source: "api.student.events.detail"`, com `event_id`/`student_id` em `metadata`, sem token/senha/segredo) e responde 500 genérico ("Não foi possível carregar o Evento agora."). Só responde 404 ("Evento não encontrado para sua conta.") quando a query teve sucesso e `participant` é `null` — comportamento preservado para quem realmente não participa do Evento.
- **Vínculo não foi tocado:** nenhuma participação foi recriada, nenhum `upsert` adicional foi feito — a correção é exclusivamente de leitura.
- Nenhuma migration foi criada ou alterada — a coluna inexistente nunca deveria existir; a correção alinha a query ao schema real.

---

# 84. Cronograma individual do Evento no perfil do aluno, com expandir/recolher e ajuste de tentativas (2026-08-24)

A aba **Atividades atribuídas** de `/admin/alunos/[id]` já tinha, para Jornadas, cronograma individual completo (modal com tentativas, liberação manual, confirmação destrutiva ao zerar). A seção **Eventos** era mais simples — só nome, situação, tentativas (contagem crua) e "Ver Evento". Esta Sprint trouxe o Evento ao mesmo padrão, sem alterar nada do que já funciona em Jornadas.

- **`AssignedEvents` (`app/admin/alunos/[id]/page-client.tsx`) redesenhado no padrão de `AssignedActivities`:** cada Evento ganhou botões **Cronograma**, **Ver Evento** e **Expandir/Recolher** no topo; card recolhido por padrão; 5 mini-cards de resumo (Situação, Tentativas, Resultado, Período, Simulado); bloco expandido com o detalhe do simulado vinculado (ou aviso "Este Evento ainda não possui simulado vinculado.", sem 404). Situação do aluno (`eventParticipationSituation()`, novo helper local): `Em andamento` (tentativa aberta) → `Sem tentativa registrada` (nenhuma conta) → `Resultado disponível` (liberado) → `Aguardando liberação de resultado` (padrão) — não confunde com o status do próprio Evento (`eventStatusLabel`), que segue exibido separadamente.
- **Dados enriquecidos em `app/admin/alunos/[id]/page.tsx`:** `StudentEventParticipation` ganhou `attempts_total`, `attempts_counting`, `attempts_in_progress` e os campos `latest_attempt_*`/`latest_result_*` (mesmos nomes/semântica de `StudentJornadaScheduleItem`, para consistência). A query de `simulado_event_participants` passou a trazer `simulado_events.result_policy` e `simulado_events.simulados(id, title, max_attempts, time_limit_minutes)`. As tentativas usadas no cálculo são filtradas **estritamente por `event_participant_id`** (nunca por `simulado_id` isolado) — o mesmo Simulado pode ter tentativas em Jornada ou avulsas fora do Evento, que nunca entram nesse resumo. A nota exibida segue a mesma regra já usada no cronograma de Jornada e na Área do Aluno: a primeira tentativa concluída que conta para o limite, não a última.
- **Modal "Cronograma do Evento" (novo, isolado do modal de Jornada):** mesmo padrão visual do modal "Cronograma individual" da Jornada (overlay, bordas azul/laranja, header, corpo, footer), mas com estado próprio — `scheduleModalEvent`, `eventScheduleProcessingId`, `eventAttemptDrafts`, `resetEventAttemptsTarget` — sem reaproveitar nem alterar `scheduleModalJornada`/`scheduleProcessingId`/`attemptDrafts`/`resetAttemptsTarget`. Mostra o simulado vinculado, período do Evento, entrada do aluno, situação, resultado (liberado/aguardando), tentativas válidas/total e nota/tempo/respostas quando houver. Input de tentativas com mínimo 0; salvar com `0` abre confirmação destrutiva específica ("Esta ação não apagará tentativas do mesmo simulado feitas fora deste Evento.") antes de zerar.
- **`PATCH /api/admin/events/[id]/participants/[studentId]` (novo, ação `set_attempts`; sincronização revisada em 2026-08-28):** valida admin, participação e Evento com Simulado vinculado; `attempts` deve ser inteiro ≥ 0. Duas funções **novas e isoladas** — `setEventParticipantAttemptsCount` e `resetEventParticipantHistory` — inspiradas no padrão já usado por `PATCH /api/admin/student-jornadas/.../simulados/[id]` (mesma lógica de tentativas placeholder `status: "abandoned"` ao aumentar, toggle de `counts_toward_limit` nas mais antigas ao reduzir), mas **nunca reaproveitando as funções de Jornada**: essas filtram apenas por `student_id + simulado_id`, o que apagaria/recontaria tentativas de Jornada e avulsas do mesmo Simulado. As funções de Evento filtram sempre por `event_participant_id` + `event_id` + `student_id` juntos. Para qualquer valor salvo, a API retorna `event_participation.attempts_counting` e `attempts_total`, e o cadastro atualiza imediatamente tanto o card quanto o modal do cronograma; o denominador continua sendo `simulados.max_attempts`. Zerar reseta o histórico só desse escopo (cascata de FK `ON DELETE CASCADE` cuida de `simulado_answers`/`simulado_results`/`topcoin_earnings` das tentativas apagadas), limpa `representative_attempt_id`/`result_released_at` e remove a notificação `event_result_released` anterior para não manter aviso de um resultado apagado.
- **Decisão documentada sobre TopCoins:** a rota **não chama** `resyncTopCoinEarnings` (helper de Jornada). Essa função opera por `student_id + simulado_id` somando TODOS os contextos e renumera `attempt_number` (usado no cálculo do valor ganho) — chamá-la aqui poderia alterar o valor de TopCoins já creditado a tentativas de Jornada/avulsas do mesmo Simulado, só porque o admin ajustou tentativas de um Evento. Como `topcoin_earnings.attempt_id` tem `ON DELETE CASCADE`, tentativas apagadas já perdem seus próprios ganhos automaticamente; tentativas placeholder criadas nascem `status: "abandoned"` (nunca contabilizadas como TopCoins), então a omissão não introduz inconsistência — apenas não amplia o escopo desta entrega para uma nova lógica de TopCoins por Evento.
- **Jornadas 100% preservadas:** `AssignedActivities`, o modal "Cronograma individual" da Jornada, `handleScheduleAction`, `performSetAttempts`, `handleSetAttempts`, `PATCH /api/admin/student-jornadas/.../simulados/[id]` e todas as suas regras (liberação, desliberação, confirmação destrutiva, TopCoins) não foram alterados.
- Nenhuma migration foi criada ou alterada — toda a funcionalidade usa `simulado_events`, `simulado_event_participants`, `simulado_attempts`, `simulado_answers`, `simulado_results` e `topcoin_earnings`, já existentes.

---

# 85. Tentativas e "Refazer Simulado" nos cards de Meus Eventos (2026-08-25)

O Evento não cria sua própria política de tentativas — quem determina isso é o Simulado vinculado (`simulados.max_attempts`). Esta Sprint expôs essa informação ao aluno em `/meus-eventos` (lista) e `/meus-eventos/[id]` (detalhe), e passou a permitir refazer o Simulado quando o Simulado ainda permite novas tentativas e o Evento continua aceitando novos inícios — sem em nenhum momento alterar a regra oficial:

> A primeira tentativa oficial/representativa do aluno é a responsável pela nota, percentual, estatísticas representativas e TopCoins oficiais do Evento. Tentativas adicionais nunca substituem isso.

- **Card de `/meus-eventos` (lista):** ganhou bloco "Tentativas" (`X de Y realizadas · Z restantes`, ou `Ilimitadas · realizadas N` quando `max_attempts` é nulo — nunca `999`/`∞`). A contagem usa exatamente `simulado_attempts.counts_toward_limit = true` do aluno naquele Evento (já filtrado por `event_id` e `is_preview = false` em `GET /api/student/events`, que passou a trazer também `simulados.max_attempts`) — nunca conta preview, tentativa administrativa, ou tentativa do mesmo Simulado em Jornada/avulso/outro Evento.
- **Novo CTA "Refazer simulado"** aparece somente quando: já existe ao menos uma tentativa que conta (`attemptsUsed > 0`); não há tentativa em andamento; o Evento está `active` (nunca `scheduled`, `closed` ou `archived`); e há tentativas restantes (ou o Simulado é ilimitado). Antes da primeira tentativa, continua "Entrar no evento"/"Iniciar Simulado" (inalterado). Com tentativa em andamento, continua "Continuar simulado" (inalterado, tem prioridade sobre Refazer mesmo se o Evento encerrou nesse meio-tempo — regra de retomada já existente). Resultado liberado e tentativas restantes: "Ver meus resultados" e "Refazer simulado" aparecem lado a lado (`/meus-eventos/page-client.tsx`) sem revelar nota quando o resultado ainda está bloqueado.
- **Modal de confirmação obrigatório (reaproveita `PremiumModal` — `theme="light"`, `tone="warning"` — nenhum modal novo foi criado):** ao clicar em "Refazer simulado", nada é criado ainda. O modal explica textualmente, em destaque âmbar, que a primeira tentativa continua sendo a oficial e que a nova tentativa não substitui o resultado já registrado. Só ao confirmar o fluxo prossegue.
- **Sem API nova:** a confirmação chama exatamente `POST /api/student/simulados/[id]/attempts?event=[eventId]` — a mesma rota oficial já usada pela tela de execução para iniciar/retomar qualquer tentativa (Jornada, avulso ou Evento) — e só depois da resposta `ok` redireciona para `/meus-simulados/[simuladoId]?event=[eventId]`. Como a tentativa já foi criada nesse POST, a tela de execução a encontra `in_progress` no próprio carregamento e entra direto na prova, sem repetir a tela de regras. Backend permanece fonte de verdade: se algo mudou desde que o card carregou (limite atingido, Evento encerrou, etc.), a API rejeita e o card exibe a mensagem de erro dentro do próprio modal, recarregando a lista em segundo plano.
- **`representative_attempt_id` nunca é sobrescrito depois de uma conclusão válida** (texto corrigido em 2026-09-06 — ver seção "Tentativa representativa: correção estrutural" adiante; a descrição anterior deste ponto, de que a tentativa já nascia representativa na criação, descrevia um bug real, não a regra pretendida): `POST .../attempts` não grava `representative_attempt_id` nem ao criar nem ao retomar tentativa — a referência só é consolidada em `POST .../attempts/[attemptId]/submit`, via `consolidateEventRepresentativeAttempt()` (`lib/server/simuladoEvents.ts`), e somente depois que a tentativa já é `completed` + `counts_toward_limit = true`.
- **Resultado oficial, dashboard representativa e TopCoins — auditados, não alterados:** "Ver meus resultados" (lista e detalhe) sempre usa `?attemptId=${representative_attempt_id}` — nunca a última tentativa. A dashboard do Professor e o Modo Aula já documentados (seção 25 do Índice Funcional) usam exclusivamente `representative_attempt_id`. TopCoins usam `resyncTopCoinEarnings` (`app/lib/server/topcoinsSync.ts`, não alterado) — função já projetada, para qualquer Simulado com múltiplas tentativas (Jornada, avulso ou agora Evento), para conceder uma recompensa por tentativa que conta (com multiplicador decrescente por `attemptNumber`, `calculateEarnedTopCoins`), nunca a mesma recompensa duplicada — recalcula do zero a cada chamada (delete + insert), então chamadas repetidas produzem sempre o mesmo resultado. Esse comportamento já é o padrão do sistema para qualquer simulado com mais de uma tentativa; habilitar "Refazer" em Evento apenas passou a alcançar esse caminho já existente, sem exigir nenhuma alteração de código.
- **Evento encerrado/reaberto:** `effective_status` é sempre recalculado dinamicamente por `effectiveEventStatus()` a cada requisição (nunca persistido) — reabrir o Evento faz "Refazer simulado" reaparecer automaticamente na próxima consulta, sem qualquer estado de bloqueio permanente gravado.
- **Pendência identificada, fora do escopo desta entrega:** a validação de `max_attempts` dentro de `POST /api/student/simulados/[id]/attempts` conta tentativas por `student_id + simulado_id` (todas as origens — Jornada, avulso, qualquer Evento), não por `event_participant_id`. Isso é o comportamento já existente da rota oficial (reaproveitada integralmente, conforme pedido desta Sprint) e vale igualmente para Jornada/avulso; só se torna relevante para Evento no caso raro de um aluno ter o mesmo Simulado vinculado a mais de um contexto simultaneamente. O card sempre mostra a contagem correta por Evento; se o backend (global) rejeitar uma tentativa que o card mostrava como disponível, o modal exibe o erro real da API e atualiza a lista — nunca cria uma tentativa fantasma. Corrigir esse escopo globalmente exigiria alterar a rota compartilhada por todos os contextos, fora do pedido desta Sprint.
- **Concorrência (dois cliques/duas abas):** o modal desabilita os botões durante a chamada (front-end). A proteção real contra corrida está no backend já existente: a mesma rota primeiro busca tentativa `in_progress` (evita duplicar) antes de validar o limite; não foi identificada, nem introduzida, nenhuma trava adicional de concorrência além da já existente na rota reaproveitada — reportado por transparência, sem alteração de schema.
- Nenhuma migration foi criada ou alterada — toda a funcionalidade reaproveita `simulados.max_attempts`, `simulado_attempts` (`counts_toward_limit`, `event_id`, `event_participant_id`), `simulado_event_participants` (`representative_attempt_id`, `result_released_at`) e `topcoin_earnings`, já existentes.

---

# 86. Imagem configurável do Evento e card do aluno análogo ao card de Jornada (2026-08-25)

O Admin passou a poder escolher uma imagem de capa para cada Evento, no mesmo paradigma já aprovado nas Jornadas (catálogo controlado de imagens oficiais, não upload livre nem URL arbitrária), e o card de `/meus-eventos` foi redesenhado para pertencer à mesma família visual do card de `/minhas-jornadas` — sem alterar Jornada e sem criar nenhuma relação funcional entre Evento e categoria de Jornada.

- **Referência estudada, não alterada:** `app/admin/jornadas/utils.ts` (`JORNADA_CATEGORIES`, `jornadaCategoryImage`), `app/admin/jornadas/nova/page-client.tsx` (seletor visual de categoria) e `app/minhas-jornadas/page-client.tsx` (`JornadaCard`, `MetricCard`, classes `student-journey-card`/`student-status-badge`/`student-metric-card`/`student-button-primary`). Nenhum desses arquivos foi modificado.
- **Transição iniciada em 2026-08-27:** esta Sprint introduziu `simulado_events.cover_key` e o catálogo fixo de quatro imagens. Novos salvamentos usam `simulado_events.card_image_id`, enquanto `cover_key` e o fallback de leitura permanecem temporariamente para compatibilidade. A migration de expansão `20260827110000_unify_event_card_images.sql` preenche FKs resolvíveis sem remover legado; a consolidação depende de comprovação operacional. Consulte `docs/Sprint-imagens-do-sistema.md`.
- **Migration:** `supabase/migrations/20260825070000_add_simulado_event_cover_key.sql` — `alter table simulado_events add column if not exists cover_key text null`. **Não executada nesta entrega.** Diferente da migration histórica de Jornada (`jornadas.category`, `not null` + `check` + backfill), aqui o campo é nulo por design — a decisão foi seguir o que a própria tarefa propôs (fallback em código para `null`), evitando a complexidade adicional de constraint/backfill para um campo novo que já nasce com fallback seguro.
- **Criação do Evento** (`app/admin/eventos/page-client.tsx`): novo bloco "Imagem do Evento" no formulário inline de criação, com cards visuais (miniatura, nome, borda/ring laranja e check quando selecionado — mesmo padrão do seletor de categoria de Jornada, reimplementado localmente, não importado). Valor padrão `administrativo`. Enviado como `cover_key` no `POST /api/admin/events`.
- **Edição do Evento** (`app/admin/eventos/[id]/page-client.tsx`): mesmo seletor visual dentro do formulário "Editar dados do Evento". Só acessível quando o Evento não está arquivado — reaproveita a trava já existente (`{event.effective_status !== "archived" && <PremiumButton ... Editar dados</PremiumButton>}`), sem nenhuma regra nova de bloqueio.
- **Backend:** `POST /api/admin/events` e `PATCH /api/admin/events/[id]` validam `cover_key` contra uma lista fechada de chaves conhecidas (`EVENT_COVER_KEYS`, mesmo padrão local já usado por `app/api/admin/jornadas/route.ts` para categoria) — chave fora do catálogo é rejeitada com 400; ausência/`null`/`""` é aceita e grava `null` (fallback resolvido no frontend). Nunca aceita caminho, URL, `data:` ou `javascript:` — só a chave, comparada por igualdade estrita contra a lista.
- **Duplicação:** a ação `action: "duplicate"` (já existente em `PATCH /api/admin/events/[id]`) passou a copiar `cover_key: current.cover_key` — Evento duplicado nasce sem Simulado (regra já existente, preservada) mas com a mesma capa do original.
- **Fallback:** Evento sem `cover_key` (todos os existentes antes desta entrega) resolve para a capa `administrativo` — nenhum Evento passa a exibir imagem quebrada ou espaço vazio.
- **Card do aluno** (`app/meus-eventos/page-client.tsx`, único arquivo de UI do aluno redesenhado): estrutura agora análoga ao `JornadaCard` — imagem de capa no topo (`aspect-[16/8.2]`, overlay gradiente, tag branca "Evento de Simulado" com ícone), corpo com nome, badge de status global (`student-status-badge` + `eventStatusLabel`, com a nova classe aditiva `student-status-scheduled` para o estado "Agendado" que a Jornada não possui), professor(es) como linha discreta secundária, grade 2×2 de mini-cards (`Início`, `Término`, `Sua situação`, `Tentativas`, tons laranja/azul/violeta/esmeralda — mesma paleta e função `student-metric-card`/`student-metric-{tone}` da Jornada) e CTA(s) contextuais usando as classes `student-button-primary`/`student-button-secondary` (mesmo componente visual de botão da Jornada, aplicado diretamente via `className`, sem importar o componente).
- **Toda a lógica de negócio do card foi preservada, não reimplementada:** situação (Não iniciado/Em andamento/Resultado aguardando liberação/Resultado disponível/Não realizado), cálculo de tentativas (`counts_toward_limit`, `max_attempts`), e os cinco estados de CTA (Entrar no evento / Continuar simulado / Refazer simulado / Ver resultados / Ver evento quando agendado) — código idêntico ao da seção 85, apenas re-skinado. O modal de confirmação "Refazer simulado" (seção 85) não foi alterado.
- **Único CSS novo:** `.student-status-scheduled` em `app/globals.css`, inserido logo após os três modificadores de status já existentes da Jornada (`active`/`expired`/`cancelled`) — puramente aditivo (`git diff` desse arquivo: 7 inserções, 0 remoções), nenhuma regra existente foi tocada.
- **Grid da página:** `/meus-eventos` passou de `md:grid-cols-2` para `sm:grid-cols-2 2xl:grid-cols-3` (mesma estratégia responsiva da Jornada), com `max-w-[390px]` por card — o container (`max-w-6xl`) e o cabeçalho da página (título, eyebrow) não foram alterados, por não fazerem parte do pedido ("somente o card").
- **Admin — listagem/detalhe:** não redesenhados (prioridade era seleção → edição → card do aluno, conforme pedido). Nenhuma miniatura foi adicionada à listagem administrativa nesta entrega — pendência de baixa prioridade, não solicitada como obrigatória.
- **Página de detalhe do Evento do aluno (`/meus-eventos/[id]`):** não alterada nesta entrega — o pedido era exclusivamente sobre "o card", que corresponde à listagem `/meus-eventos`.

---

# 87. Correção — status incorreto de "Controle de foco" no Evento + redesign clean premium de `/meus-eventos/[id]` (2026-08-25)

Reproduzido com dado real (`Inss - Simulado 2`, Simulado "Teste 02 - Simulado de Internet e Redes + Hardware", `anti_tab_switch_enabled = false` e `anti_window_blur_enabled = false` no banco operacional): a tela sempre mostrava **"Monitorado · limite de 3 violações"**, mesmo com os dois mecanismos de foco desligados no Simulado.

- **Causa raiz:** `app/meus-eventos/[id]/page-client.tsx` tinha `value={`Monitorado · limite de ${FOCUS_VIOLATION_LIMIT} violações`}` fixo — nunca lia a configuração real do Simulado. `GET /api/student/events/[id]` também não selecionava `anti_tab_switch_enabled`/`anti_window_blur_enabled` da tabela `simulados` (mesmos campos criados na Sprint de anti-cheat configurável, seção 84 de `docs/Sprint-simulados.md` — já executados no banco operacional, confirmado via `information_schema.columns`).
- **Correção na fonte:** a query passou a trazer os dois campos; a tela calcula `isFocusMonitored = anti_tab_switch_enabled !== false || anti_window_blur_enabled !== false` (mesma convenção `!== false` já usada pelo motor de execução em `app/meus-simulados/[id]/page-client.tsx` e pela regra server-side em `app/api/student/simulados/[id]/attempts/route.ts` — ausência/`null` tratada como ligado). Mostra **"Não monitorado"** só quando os dois estão desligados; **"Monitorado" + "Limite de `FOCUS_VIOLATION_LIMIT` violações"** (constante já existente em `lib/simulado-focus-violation.ts`, não duplicada) quando pelo menos um está ligado. Testado no banco operacional (somente leitura): a query corrigida retorna `anti_tab_switch_enabled: false, anti_window_blur_enabled: false` para o Evento real reportado, confirmando "Não monitorado" como resultado correto.
- **Nenhuma regra do Simulado, Evento ou motor de execução foi alterada** — a correção é exclusivamente de leitura/exibição, seguindo a mesma fonte de verdade já usada pela execução real da prova.
- **Redesign clean premium (mesma entrega, mesmos dois arquivos):** a tela passou a reutilizar as classes já estabelecidas nas seções 85/86 (`student-journey-card`, `student-status-badge`/`student-status-active`/`student-status-scheduled`/`student-status-expired`, `student-metric-card`, `student-button-primary`/`secondary`) em vez do card branco genérico anterior — cabeçalho com eyebrow, título, badge de status; Início/Término separados; professor(es) como metadado discreto; grade 2×2 de mini-cards (Tentativas, Tempo da prova, Resultado, Controle de foco, cada um com valor + subtexto curto, sem mais a frase corrida "3 · usadas 1 · restantes 2"); CTA reposicionado e destacado. Toda a lógica de tentativas/situação/CTA/modal "Refazer simulado" permanece exatamente a mesma (mesmas variáveis, mesmas condições), apenas re-skinada.
- **Card de `/meus-eventos` (lista) não foi tocado novamente** — só a tela de detalhe (`/meus-eventos/[id]`). Jornada não foi alterada.
- Nenhuma migration foi necessária — os dois campos já existiam e já estavam populados no banco operacional; a correção apenas passou a lê-los.

---

# 88. Admin pode encerrar tentativa ativa para liberar troca do Simulado no Evento (2026-08-24)

**Problema:** a troca do Simulado vinculado a um Evento já era bloqueada corretamente quando havia tentativa `in_progress` real (`is_preview = false`), mas o Admin não tinha nenhuma ação para resolver esse bloqueio além de esperar o aluno terminar.

**Nova ação administrativa excepcional:** ao tentar salvar uma troca de Simulado em `PATCH /api/admin/events/[id]` e existir tentativa ativa, a resposta 409 passou a incluir `blocked_reason: "active_attempts"` e a lista das tentativas em andamento (`attempt_id`, `student_name`, `started_at`). Em `app/admin/eventos/[id]/page-client.tsx`, isso abre um modal ("Existem alunos realizando este Simulado") com três opções — **Cancelar**, **Aguardar conclusão** ou **Encerrar tentativas e prosseguir** — e a segunda opção exige uma confirmação forte adicional antes de qualquer efeito.

**Encerramento no backend:** nova ação `PATCH /api/admin/events/[id]` `{ action: "terminate_active_attempts" }` — escopada estritamente por `event_id = id AND is_preview = false AND status = 'in_progress'` (nunca toca tentativas de Jornada, avulsas ou de outro Evento, mesmo do mesmo Simulado). Reaproveita exatamente o mesmo mecanismo já usado pela desclassificação por violação de foco (`status = 'disqualified'`, `disqualified_at`, `counts_toward_limit = true` — ver `app/api/student/simulados/[id]/attempts/[attemptId]/focus-violation/route.ts`), mudando apenas `disqualification_reason` para o valor novo `'admin_terminated'`, que nunca é confundido com `'focus_violation'`. Nenhuma migration foi necessária: `simulado_attempts.status` já aceita `'disqualified'` por constraint (`simulado_attempts_status_check`) e `disqualification_reason` já é `text` livre.

**Ordem garantida:** o frontend só reenvia o payload original da edição (incluindo a troca de `simulado_id`) depois que a chamada de encerramento retorna sucesso — nunca troca o Simulado antes ou em paralelo. Se o reenvio falhar (ex.: nova tentativa iniciada nesse meio-tempo), o Evento permanece com o Simulado anterior e o erro real é exibido; a ação de encerramento é idempotente (`0` tentativas ativas retorna sucesso sem efeito).

**Aluno — detecção do encerramento:** reaproveita o heartbeat de presença já existente (`POST /api/student/events/[id]/heartbeat`, chamado a cada 30s durante a execução em contexto de Evento) em vez de WebSocket — passou a aceitar `attempt_id` opcional (sempre revalidado por `student_id + event_id`) e retornar `attempt_status`/`disqualification_reason`. Em `app/meus-simulados/[id]/page-client.tsx`, ao detectar `disqualification_reason === "admin_terminated"` a tela sai do fluxo de prova e mostra um `FullScreenModal` (tom `warning`, não `danger`) — "Simulado encerrado" / "Este Simulado foi encerrado pelo administrador. Não é mais possível continuar esta tentativa. Suas respostas registradas até o momento foram preservadas." — com CTA "Voltar para Meus Eventos". A rota de resposta (`.../attempts/[attemptId]/answers`) já rejeitava gravações fora de `status = 'in_progress'` antes desta entrega — nenhuma alteração adicional foi necessária ali.

**`representative_attempt_id` e contagem** (texto corrigido em 2026-09-06): um `admin_terminated` nunca chega a ser gravado como representante — a referência oficial só é consolidada em `/submit` quando a tentativa já é `completed` (ver "Tentativa representativa: correção estrutural" adiante); uma tentativa encerrada pelo admin nunca passa por `/submit`, então nunca ocupa `representative_attempt_id`, igual a qualquer outra desclassificação. `counts_toward_limit = true` continua consumindo a tentativa normalmente, independentemente do progresso — isso não mudou.

**Resultado e TopCoins:** nenhum resultado é gerado (a tentativa nunca passa por `/submit`); `GET /api/student/simulados/[id]/resultado` só aceita `status = 'completed'`, então uma tentativa `admin_terminated` nunca aparece como resultado — mesmo comportamento já válido para desclassificação por foco. Nenhum TopCoin é concedido (mesmo caminho de código da desclassificação, que nunca chama a lógica de TopCoins).

**Dashboard do Professor:** `GET /api/professor/events/[id]` passou a diferenciar o status do participante quando `disqualification_reason === 'admin_terminated'`, exibindo **"Encerrada pelo administrador"** (badge neutra, cinza) em vez de **"Desclassificado"** (badge vermelha, reservada a violação real de regras).

**Correção correlata (mesma entrega):** `GET /api/student/events` e `GET /api/student/events/[id]` passaram a escopar as tentativas retornadas pelo `simulado_id` **atualmente** vinculado ao Evento (`attempt.simulado_id === event.simulado_id`). Antes desta correção, uma troca de Simulado no Evento (já possível mesmo sem esta Sprint, quando não havia tentativa `in_progress` nem `completed` bloqueando) podia deixar tentativas do Simulado anterior "vazando" para a contagem de tentativas/CTA do Simulado novo. Isso se tornaria muito mais frequente com o encerramento administrativo (que agora libera a troca rotineiramente), por isso foi corrigido nesta entrega — sem alterar a regra real de criação de tentativa em `POST /api/student/simulados/[id]/attempts`, que já era corretamente escopada por `simulado_id`.

**Auditoria:** cada tentativa encerrada gera um registro em `logActivity` (`action: "event_attempt_admin_terminated"`, com `event_id`, `student_id`, `previous_simulado_id`).

**Arquivos alterados:** `app/api/admin/events/[id]/route.ts`, `app/api/student/events/[id]/heartbeat/route.ts`, `app/api/student/events/[id]/route.ts`, `app/api/student/events/route.ts`, `app/api/professor/events/[id]/route.ts`, `app/admin/eventos/[id]/page-client.tsx`, `app/professor/eventos/[id]/page-client.tsx`, `app/meus-simulados/[id]/page-client.tsx`.

**Nenhuma migration foi criada, alterada ou executada nesta entrega.** Nenhum arquivo de Jornada foi tocado. Nenhuma regra de foco/anti-cheat, política de resultado ou motor de correção do Simulado foi alterada.

---

# 89. Resultados de Evento bloqueados aparecem em "Meus Resultados" + notificação interna (2026-08-24; concluída em 2026-08-28)

**Problema:** um Simulado concluído dentro de um Evento com resultado bloqueado (`result_released_at = null`) desaparecia inteiramente de `/meus-resultados` — a rota `GET /api/student/resultados` pulava (`continue`) qualquer tentativa vinculada a `event_participant_id` sem `result_released_at`, tratando "bloqueado" como "inexistente". Podia inclusive deixar a tela exibindo o empty state "Você ainda não concluiu nenhum simulado." mesmo com atividade concluída.

**Correção implementada (sem migration):** `app/api/student/resultados/route.ts` passou a incluir Simulados de Evento concluídos independentemente da liberação. Fonte da tentativa "oficial" do Evento: a mesma já usada por `GET /api/student/simulados/[id]/resultado` sem `attemptId` — **primeira tentativa `completed` com `counts_toward_limit = true`, ordenada por `submitted_at` crescente**, escopada por `event_participant_id` (nunca vazando de Jornada/avulso/outro Evento). **Decisão técnica registrada:** deliberadamente não foi usado apenas `representative_attempt_id` — quando a tentativa representativa é desclassificada (foco ou encerramento administrativo, ver seção 88) e uma tentativa seguinte é concluída, `representative_attempt_id` continua apontando para a tentativa nunca concluída; usar somente esse campo faria o Evento sumir de "Meus Resultados" mesmo com um resultado real e acessível via URL direta quando liberado — o que contrariaria o princípio central desta correção ("nunca esconder uma atividade concluída"). Validado com dado real do banco operacional (participante do Evento "Inss - Simulado 2", `representative_attempt_id` apontando para tentativa `disqualified` por encerramento administrativo, mas com tentativa seguinte `completed`/`counts_toward_limit=true` real): a nova lógica encontra corretamente essa tentativa e o item aparece como "Resultado aguardando liberação".

**Payload estendido (aditivo):** cada item agora traz `source` (`jornada`/`standalone`/`event`), `event_id`, `event_name`, `result_status` (`available`/`pending_release`) e `can_view`. **Nenhum dado sensível é exposto enquanto bloqueado** — a rota nunca retornou nota/percentual/acertos/erros/gabarito (isso sempre foi responsabilidade exclusiva de `GET /api/student/simulados/[id]/resultado`, que já valida `result_released_at` no servidor via `code: "EVENT_RESULT_BLOCKED"`, preservado sem alteração).

**`app/meus-resultados/page-client.tsx`:** mesma tabela (`PremiumTable`) reutilizada, sem componente novo — coluna "Jornada" renomeada para "Contexto" (mostra "Evento de Simulado" + nome do Evento quando `source === "event"`, preserva "Jornada"/"Simulado avulso" nos demais casos); coluna "Ação" mostra "Ver resultado" quando `can_view`, ou badge neutro (âmbar, ícone de relógio, texto "Resultado aguardando liberação") quando bloqueado — nunca vermelho, nunca aparência de erro. Empty state passa a considerar corretamente os itens bloqueados (não é mais acionado indevidamente).

**Notificação interna de liberação — implementada em 2026-08-28:** a auditoria confirmou que ainda não existia infraestrutura genérica compatível. A migration `20260828100000_create_student_notifications.sql` cria `student_notifications`, sem backfill, com FK para `public.students`, RLS habilitado, grants revogados de `anon`/`authenticated`, índice de pendências e unicidade por `student_id + type + reference_id`. Para `event_result_released`, `reference_id` é `simulado_event_participants.id`.

`releasePendingEventResults()` cria a notificação apenas para participantes cuja transição `result_released_at: null → timestamp` aconteceu naquela execução. A criação usa upsert idempotente; se o histórico do participante tiver sido zerado e houver uma linha antiga já tratada, a nova transição reativa essa mesma linha, sem duplicá-la. Ao zerar o histórico, a notificação anterior também é removida para não apresentar um resultado que deixou de existir. Falha na criação da notificação permanece isolada, sem reverter resultado, TopCoins ou e-mail. No submit de Evento configurado previamente com liberação imediata, o mesmo helper é chamado com `createNotifications: false`, evitando um aviso redundante logo após o aluno já receber o resultado.

`GET /api/student/notifications` retorna somente a próxima pendência do aluno autenticado; `PATCH /api/student/notifications/[id]` marca, com ownership no servidor, `read_at` em **Ver Agora** ou `dismissed_at` em **Ver depois**. Ambas encerram a apresentação automática. O `AppShell` consulta a cada 10 segundos em rotas seguras, mostra uma notificação por vez em `PremiumModal theme="light"`, não abre durante execução/preview/resultado e coordena a prioridade com Ajuda e tutorial. **Ver Agora** usa a URL oficial `/meus-simulados/[simuladoId]/resultado?event=[eventId]` e acrescenta o marcador visual `releasedNotification=1`: a página mantém a tentativa oficial contextual, apresenta a contagem regressiva já existente, lê sem recalcular os TopCoins persistidos daquela tentativa, exibe o `TopCoinRewardModal` e então revela o resultado. **Ver depois** permanece na página. Não há localStorage nem backfill.

---

# 90. Auditoria — "Evento tem prioridade máxima" sobre resultado bloqueado (2026-08-24)

Auditoria completa de todos os pontos em que nota, gabarito, Desempenho por Assunto, Revisão das Questões ou TopCoins poderiam vazar para uma tentativa de origem Evento com `result_released_at = null`. Nenhuma regra de negócio foi alterada — apenas confirmada/reforçada; uma lacuna de UX (não de segurança) foi corrigida.

**Confirmado, já correto, sem alteração necessária:**

- **Fonte única de resultado:** `GET /api/student/simulados/[id]/resultado` é o único endpoint que retorna nota/gabarito/desempenho por assunto/revisão — e todos vivem no mesmo payload de uma única chamada (confirmado: a página de resultado faz exatamente um `fetch`). Antes de montar qualquer desses dados, a rota já verifica `attempt.event_participant_id` e, se `!participant?.result_released_at`, responde `403` com `code: "EVENT_RESULT_BLOCKED"` sem consultar `simulado_results`/`simulado_questions`/gabarito. Nenhum dado sensível chega a ser buscado no banco, muito menos retornado.
- **PDF do Simulado:** gerado 100% client-side (`downloadSimuladoResultPdf`) a partir do `payload` já carregado — como o `payload` nunca existe quando bloqueado, o PDF nunca pode ser gerado nesse estado (a aba nem chega a renderizar).
- **TopCoins — dupla proteção:** (1) `POST .../attempts/[attemptId]/submit` só chama `resyncTopCoinEarnings` quando `eventResultReleased === true`; (2) mesmo que fosse chamada fora dessa condição, `resyncTopCoinEarnings()` (`app/lib/server/topcoinsSync.ts`) filtra internamente `rows` excluindo qualquer tentativa com `event_participant_id` preenchido e `!result_released_at` — TopCoins nunca são inseridos em `topcoin_earnings` para tentativa de Evento bloqueada, independentemente de qual caminho de código dispara o resync.
- **Ao finalizar (submit) com Evento bloqueado:** `earned_topcoins` retorna `null` (sem registro em `topcoin_earnings`); o frontend (`app/meus-simulados/[id]/page-client.tsx`) pula o modal de TopCoins ganhos e redireciona direto para a página de resultado, que é bloqueada pela mesma fonte única acima.
- **Ao liberar:** a mesma rota, sem nenhuma alteração de código, passa a entregar o payload completo normalmente — a mesma experiência de resultado oficial (Resultado Geral, Raio-X, Desempenho por Assunto, Comportamento, Revisão das Questões, PDF) já é 100% reaproveitada, nenhuma página nova.

**Corrigido nesta entrega (lacuna de UX, não de segurança):** ao tentar acessar o resultado bloqueado, a tela caía no bloco de erro genérico da página (`AlertTriangle` vermelho, título "Não foi possível carregar o resultado", botão "Voltar para Meus Simulados") — nenhum dado vazava, mas a experiência passava impressão de falha, não de "aguardando liberação, está tudo certo". `app/meus-simulados/[id]/resultado/page-client.tsx` passou a capturar `json.code` da resposta e, quando `EVENT_RESULT_BLOCKED`, renderiza uma tela própria e neutra (ícone de relógio âmbar, título "Resultado aguardando liberação", mesma mensagem do backend, botão "Voltar para Meus Eventos"). `app/meus-simulados/[id]/resultado/page.tsx` passou a extrair `event` de `searchParams` (já enviado por `buildResultUrl()` desde a Sprint de Eventos, mas nunca lido) e repassar como prop `eventId`, usado para linkar direto ao Evento de origem quando disponível (fallback para `/meus-eventos` quando ausente, ex.: acesso via "Meus Resultados" sem esse parâmetro).

**Arquivos alterados nesta seção:** `app/meus-simulados/[id]/resultado/page.tsx`, `app/meus-simulados/[id]/resultado/page-client.tsx`.

Nenhuma migration foi necessária.

---

# 91. Correção crítica — TopCoins também subordinados ao Evento (2026-08-24)

**Reportado:** o modal de TopCoins aparecia ao final de um Simulado de Evento com resultado bloqueado.

**Investigação empírica (banco operacional, somente leitura):** `select * from topcoin_earnings te join simulado_attempts a on a.id = te.attempt_id where a.event_id is not null` retornou **zero linhas** — não havia (e não há) nenhum crédito persistido para tentativa de Evento, confirmando que a camada de persistência (`resyncTopCoinEarnings`, chamada apenas quando `eventResultReleased`) já estava correta. A causa raiz identificada foi de **fluxo/UX no pós-submit**, não de crédito indevido:

1. `POST .../attempts/[attemptId]/submit` decidia `eventResultReleased` corretamente, mas não expunha nenhuma flag explícita de precedência — o frontend inferia "não bloqueado" apenas por `typeof earned_topcoins === "number"`, sem uma ordem de decisão auditável.
2. Mesmo com `earned_topcoins: null`, o fluxo pós-submit redirecionava para `/meus-simulados/[id]/resultado?attemptId=...`, que **já disparava o countdown "Nossas corujas estão reunidas montando seu feedback"** antes mesmo do fetch retornar (o overlay de preparação era renderizado em todos os branches, inclusive no de bloqueio) — dando a sensação de "algo está prestes a ser liberado" quando deveria estar totalmente bloqueado.

**Correção — ordem de decisão explícita no backend (`submit/route.ts`):**

```
isEventAttempt = Boolean(attempt.event_participant_id && attempt.event_id)
eventResultReleased = (calculado como antes, política real)
resultAccess = (isEventAttempt && !eventResultReleased) ? "blocked_by_event" : "available"
```

`resultAccess` é retornado explicitamente no payload (`result_access`). Dupla proteção reforçada: a consulta a `topcoin_earnings` para a tentativa **só executa quando `resultAccess === "available"`** — mesmo que existisse (não existe) algum lançamento inesperado para a tentativa, ele nunca seria lido nem exposto ao cliente enquanto bloqueado.

**Correção — frontend (`app/meus-simulados/[id]/page-client.tsx`):** `submitAttempt` passou a checar `result_access === "blocked_by_event"` **antes** de qualquer avaliação de `earned_topcoins`. Quando bloqueado: não abre o modal de TopCoins, não navega para a página de Resultado, não inicia countdown algum — mostra diretamente `FullScreenModal` (novo estado `event_result_blocked`, mesmo padrão já usado por `disqualified`/`admin_terminated`): **"Simulado concluído" / "Seu resultado ainda não foi liberado pelo professor. Assim que houver liberação, você poderá consultar seu resultado em Meus Resultados."**, CTA "Voltar para Meus Eventos".

**Proteção adicional (acesso direto/recarregamento):** `app/meus-simulados/[id]/resultado/page-client.tsx` — se o aluno acessar a URL de resultado diretamente enquanto bloqueado (bypassando o fluxo de submit), o countdown de preparação é zerado imediatamente ao detectar `EVENT_RESULT_BLOCKED`, evitando a mesma sensação de "quase liberado".

**Cenário 7 (Evento já liberado desde o início) e Simulados fora de Evento:** comportamento normal preservado sem nenhuma alteração — `resultAccess` só é `"blocked_by_event"` quando `isEventAttempt && !eventResultReleased`; em qualquer outro caso (avulso, Jornada, ou Evento já liberado) permanece `"available"`.

**Duplicidade após liberação posterior:** não alterada — `releasePendingEventResults()` continua com o guard `.is("result_released_at", null)` (idempotente) e `resyncTopCoinEarnings()` continua fazendo `delete` + `insert` do zero por `student_id + simulado_id`, sem depender desta entrega.

**Arquivos alterados:** `app/api/student/simulados/[id]/attempts/[attemptId]/submit/route.ts`, `app/meus-simulados/[id]/page-client.tsx`, `app/meus-simulados/[id]/resultado/page-client.tsx`.

Nenhuma migration foi necessária — `result_access` é um campo apenas de resposta HTTP, não persistido.

---

---

# 92. Correção — regressão introduzida pela seção 88: "Zerar tentativas" parava de funcionar após trocar o Simulado do Evento (2026-08-25)

**Reportado:** no modal "Cronograma do Evento" (`/admin/alunos/[id]`), ao definir tentativas para `0` e confirmar, a mensagem de sucesso aparecia, mas o número exibido voltava ao valor anterior.

**Reprodução confirmada com dado real (banco operacional, somente leitura):** Evento "Inss - Simulado 2" — `simulado_id` **atual** do Evento (`bad77983-...`) diferente do `simulado_id` das duas tentativas existentes do participante (`38adbd06-...`, tentativas criadas **antes** de uma troca de Simulado feita pelo Admin via a ação `terminate_active_attempts`, seção 88).

**Causa raiz:** `setEventParticipantAttemptsCount` e `resetEventParticipantHistory` (`app/api/admin/events/[id]/participants/[studentId]/route.ts`) filtravam as tentativas do participante por `.eq("simulado_id", simuladoId)`, usando o `simulado_id` **atual** do Evento. Após uma troca de Simulado (seção 88), tentativas anteriores continuam no banco com o `simulado_id` **antigo** — o filtro as tornava invisíveis para o SELECT e para o DELETE, que afetavam **zero linhas** sem erro. A resposta da API respondia sucesso com `attempts_total: 0` (valor fixo, nunca verificado), a UI atualizava otimisticamente, mas o `router.refresh()` seguinte recarregava a contagem real (calculada em `app/admin/alunos/[id]/page.tsx`, já corretamente escopada só por `event_participant_id`, sem `simulado_id`) — que ainda encontrava as tentativas nunca apagadas, revertendo o número exibido.

**Correção:** removido `.eq("simulado_id", simuladoId)` das três consultas afetadas (as duas do SELECT/UPDATE em `setEventParticipantAttemptsCount`, e o SELECT/DELETE em `resetEventParticipantHistory`) — escopo passa a ser exclusivamente `student_id + event_id + event_participant_id`, exatamente como o comentário original da função já declarava como intenção ("sempre escopado por `event_participant_id`... nunca apenas por `student_id + simulado_id`"). `simuladoId` continua sendo usado normalmente onde é necessário (contar questões do Simulado atual e atribuí-lo às novas tentativas placeholder criadas ao **aumentar** tentativas). `resetEventParticipantHistory` deixou de receber o parâmetro `simuladoId`, por não precisar mais dele.

**Validado com o dado real:** a nova consulta (sem `simulado_id`) encontra corretamente as duas tentativas existentes do participante afetado.

**Nenhuma outra rota foi alterada.** O `DELETE` (remover participação) já estava corretamente escopado só por `event_participant_id`, sem esse problema.

**Arquivos alterados:** `app/api/admin/events/[id]/participants/[studentId]/route.ts`.

Nenhuma migration foi necessária.

---

*Documentação consolidada a partir das decisões funcionais da Sprint Evento de Simulado e das regras oficiais existentes do EstudoTOP Simulados.*

# 93. Isolamento contextual completo entre Evento, Jornada e avulso (2026-08-25)

- O Evento continua identificado por `event_id + event_participant_id`. A autoridade final de criação de tentativa passou a usar esse mesmo recorte, eliminando a divergência em que cards mostravam `0/2`, mas o POST bloqueava por tentativas globais do mesmo Simulado.
- Eventos distintos que reutilizam o mesmo Simulado possuem tentativa ativa, contagem, resultado oficial e histórico independentes. O mesmo vale entre Evento, Jornada e execução avulsa.
- `representative_attempt_id` permanece próprio de cada `simulado_event_participants`; dashboards administrativos e do Professor continuam filtrados pelo Evento/participante.
- TopCoins passam a numerar tentativas dentro de cada contexto. Resultado bloqueado de Evento continua sem crédito até a liberação e a sincronização permanece idempotente.
- `set_attempts` de Evento permanece estritamente escopado por `event_id + event_participant_id`; nenhum registro artificial foi apagado automaticamente nesta correção.
- Migration relacionada: `supabase/migrations/20260825080000_contextualize_simulado_attempts.sql`. Não executada nesta entrega.

# 94. Resultado completo do Evento liberado usa o pipeline oficial do Simulado (2026-08-25)

- Depois da liberação, o resultado de Evento utiliza o mesmo pipeline de resultado do Simulado empregado nos demais contextos; Evento apenas define acesso e tentativa oficial contextual.
- `GET /api/student/simulados/[id]/resultado` resolve primeiro a tentativa do `event_participant_id`, prioriza `representative_attempt_id` quando ele aponta para tentativa concluída válida e usa a primeira concluída válida como fallback.
- O Simulado e as questões são carregados pelo `simulado_id` persistido na tentativa. Uma troca posterior do Simulado atualmente vinculado ao Evento não altera nem invalida a revisão histórica.
- `result_released_at` autoriza o resultado completo do Evento, inclusive Desempenho por Assunto e Revisão das Questões, mesmo quando `show_answer_key_on_finish` do Simulado é falso. Fora de Evento, a configuração pedagógica permanece inalterada.
- Evento bloqueado continua retornando `EVENT_RESULT_BLOCKED` antes de carregar ou expor nota, gabarito, assuntos ou respostas.
- Falhas ao carregar participação, Simulado histórico, resultado, respostas ou questões agora geram log técnico e resposta genérica, nunca `gabarito: []` mascarado como indisponibilidade pedagógica.
- Nenhuma migration foi necessária para esta correção.
## 95. Redesign premium da dashboard do Professor — 2026-08-25

- `/professor/eventos/[id]` foi reorganizada em três abas persistentes: **Visão geral**, **Participantes** e **Questões / revisão**. O polling silencioso de dez segundos atualiza os dados sem recriar a página, trocar a aba, fechar o modal ou alterar a questão selecionada.
- A Visão geral apresenta participantes, maior nota, menor nota, média do Evento e tempo médio, sempre derivados das tentativas oficiais indicadas por `representative_attempt_id`. Inclui distribuição por faixas de aproveitamento e situação ao vivo, sem associar nomes às notas extremas.
- Participantes passaram para tabela consolidada com busca, filtro, paginação, ranking e modal individual. O ranking usa acertos decrescentes e tempo total crescente; o tempo é derivado de `started_at`/`submitted_at` com precisão de milissegundos, usando `time_spent_seconds` apenas como fallback. Empates exatos compartilham posição no padrão competitivo (`1º, 2º, 2º, 4º`).
- A aba Participantes usa tabela visual premium localizada com avatar por iniciais, badges de situação, estado vazio e paginação com opções de 10, 25 ou 50 itens. A tabela resume posição, aluno, situação, nota e ação `Ver`; o professor alterna entre `Por nota` (padrão, ranking oficial) e `Ordem alfabética`. No ranking por nota, 1º, 2º e 3º recebem troféus em ouro, prata e bronze. O modal `Ver` conserva todas as métricas detalhadas.
- O botão **Ver** abre um modal individual localizado de até `860px`, com overlay desfocado, cabeçalho acessível, grade responsiva 4×2 das oito métricas, cores semânticas e fechamento pelo X, por Escape ou pelo botão **Entendi**. O componente compartilhado `PremiumModal` não foi alterado.
- Questões / revisão preserva o modo apresentação sem dados. O botão **Exibir dados** revela gabarito, alternativas corretas/incorretas, distribuição de respostas e mini dashboard; trocar de questão volta ao estado oculto.
- A autorização permanece centralizada em `requireEventManager`. Nenhum dado de outro Evento, Jornada, execução avulsa ou preview entra nos cálculos.
- Arquivos funcionais alterados: `app/api/professor/events/[id]/route.ts` e `app/professor/eventos/[id]/page-client.tsx`. Nenhuma migration foi necessária para este redesign.
- A interface final usa o tema claro institucional da área do aluno: fundo `slate-50`, superfícies brancas, bordas suaves e laranja como destaque. O tema escuro permanece apenas nas demais telas que já o utilizavam e não foi alterado globalmente.
- Durações são apresentadas no padrão `HH:MM:SS`. A precisão em milissegundos continua preservada internamente e usada no desempate do ranking, sem poluir a leitura da interface.
- O tema claro abrange todo o acesso do Professor. A tipografia Inter passou a ser global no sistema inteiro, sem exceção por rota ou papel.
- A Visão geral foi refinada como painel de apresentação: container de até `1760px`, hero de `210px` com troféu decorativo, abas em três colunas, cinco métricas de `170px`, distribuição em dez segmentos e painel lateral ao vivo com ícones funcionais e precisão consolidada em destaque.
## Controle operacional do simulado na dashboard do Professor — 2026-08-27

- A região de ações superiores ganhou o menu flutuante **Controle do simulado**, fora da arte do banner. O menu mostra o estado efetivo e oferece opções conforme o estado atual, com fechamento por clique externo ou Escape e sem interferir na aba, questão ou scroll da dashboard.
- **Liberação manual** corresponde a `result_policy = 'blocked'`; novas conclusões permanecem pendentes, mas participantes já liberados conservam `result_released_at`. **Liberação imediata** corresponde a `result_policy = 'released'` e chama o helper oficial `releasePendingEventResults()`, liberando também resultados pendentes já concluídos, sincronizando TopCoins e preservando o fluxo de e-mail existente.
- Encerrar reutiliza a operação oficial que grava `status = 'closed'`/`closed_at`: bloqueia novos inícios e preserva tentativas em andamento para conclusão normal, além de todo o histórico. Reabrir exige novo término futuro, retorna a `status = 'active'`, limpa os marcadores de fechamento/arquivamento e preserva participantes, tentativas, resultados, liberações e política.
- `closeSimuladoEvent()` e `reopenSimuladoEvent()` em `lib/server/simuladoEvents.ts` são usados pelas APIs administrativa e do professor, evitando uma segunda regra. `PATCH /api/professor/events/[id]` usa `requireEventManager`, portanto aceita Admin ou professor ativo oficialmente atribuído ao Evento; aluno e professor não atribuído permanecem bloqueados no servidor.
- Todas as mudanças abrem `PremiumModal` claro, aguardam a API, bloqueiam clique duplo e recarregam silenciosamente a fonte de verdade. O polling de dez segundos permanece ativo. Nenhuma migration foi necessária.

## 96. Tentativas de Evento acessíveis por Meus Simulados — 2026-08-28

- `/meus-simulados` também lista cada participação em Evento ativo como um contexto próprio. Quando o mesmo Simulado teria também um card avulso, o contexto do Evento o substitui para não duplicar o card. O card identifica o Evento e exibe somente as tentativas `attempt_context = 'event'` daquele `event_id + event_participant_id`.
- Os links de iniciar, retomar, refazer e consultar resultado preservam `?event=<event_id>`. Assim, abrir o Simulado por esta tela usa o mesmo saldo do card de `/meus-eventos`, sem converter ou misturar tentativas avulsas, de Jornada ou de outro Evento.
- O botão de resultado do card de Evento só é apresentado após `result_released_at`; o bloqueio pedagógico existente continua aplicado no servidor.
- O cronograma administrativo explicita que seu total pertence somente ao Evento. Zerar o Evento continua removendo apenas o histórico contextual do Evento e não altera vidas avulsas ou de Jornada.
- A auditoria somente leitura do banco confirmou o caso reportado: o Evento estava com zero tentativas, enquanto as duas tentativas vistas anteriormente em Meus Simulados eram registros avulsos reais. Nenhum histórico foi reclassificado ou apagado e nenhuma migration foi necessária.

## 97. Reentrada idempotente na pré-inscrição pública — 2026-08-28

- O contrato de `POST /api/events/[slug]` passou a distinguir `confirmation_email_sent` de `confirmation_pending`. Uma intent válida dentro do cooldown ou um conflito concorrente `23505` responde sucesso pendente; um novo envio confirmado pelo Resend responde sucesso enviado.
- `/evento/[slug]` aceita explicitamente somente esses dois estados de sucesso e, em ambos, sai do formulário para **Confira seu e-mail**, mantendo os botões **Reenviar e-mail** e **Usar outro e-mail**. Reenvio/reentrada com intenção pendente é idempotente e sempre fornece feedback explícito.
- Correção complementar: o `PremiumButton` usa `type="button"` por padrão; **Continuar** não declarava `type="submit"` nem `onClick`, portanto o clique não chamava `submit()` nem enviava request algum. O botão agora é submit real e só fica desabilitado durante envio. Se o reCAPTCHA não estiver pronto, `requestConfirmation()` é executada e mostra a mensagem de validação existente.
- Diagnóstico local: depois da correção do submit, o localhost passou a exibir corretamente o bloqueio anterior à API quando o token reCAPTCHA não pode ser gerado. As duas variáveis estavam presentes no ambiente local; para funcionar nesse host, a chave de desenvolvimento precisa autorizar `localhost` no Google reCAPTCHA. A proteção não recebeu bypass e nenhuma configuração externa foi alterada nesta entrega.
- O branch pendente não chama o Resend durante o cooldown: isso é intencional para impedir spam. Passado o cooldown, a intent anterior é substituída, o último token passa a ser o válido e um novo e-mail é enviado. Intents expiradas são renovadas; intents consumidas continuam no fluxo oficial de login/cadastro e não geram participação duplicada.
- Permanecem inalterados reCAPTCHA v3, normalização `trim().toLowerCase()`, validade de 24 horas, hash do token, resposta anti-enumeração e unicidade por Evento/e-mail. Nenhuma migration foi necessária.
- O carregamento inicial da página pública passou a tratar falha de rede, status HTTP inválido e resposta não JSON, exibindo mensagem e **Tentar novamente** em vez de deixar o card vazio. A viewport mantém fallback `100vh` e o e-mail usa 16 px em telas móveis para compatibilidade com Safari/iOS. O reCAPTCHA e os fluxos de confirmação permaneceram inalterados.

## 98. Threshold específico do reCAPTCHA no ingresso público — 2026-09-03

- Uma tentativa real em Production retornou `success = true`, score `0.3`, action `event_join_request`, hostname `simulados.estudotop.com.br` e nenhum `error-code`; o bloqueio ocorria exclusivamente porque o helper exigia o threshold padrão `0.5`.
- `POST /api/events/[slug]` passou a solicitar explicitamente score mínimo `0.3`. Continuam obrigatórias a resposta `success = true`, a presença de score e a igualdade exata da action; token ausente, indisponibilidade do Google, action divergente e `success = false` continuam bloqueados.
- O threshold padrão compartilhado permanece `0.5`. A Central de Ajuda e qualquer consumidor que não informe um valor específico não receberam redução.
- A instrumentação temporária segura `event_join_recaptcha_accepted`/`event_join_recaptcha_rejected` permanece somente até a confirmação da correção em Production e registra exclusivamente `captchaSuccess`, `score`, `action`, `hostname` e `errorCodes`, sem token, secret, e-mail ou payload.
- Cooldown, resposta anti-enumeração, intenção de ingresso, confirmação por e-mail, token, associação ao Evento e Resend não foram alterados. Nenhuma migration foi necessária.

## 91. Continuidade retomável do cadastro por Evento (2026-09-04)

- Depois de `POST /api/events/[slug]/confirm` validar token, hash, validade, consumo, slug e e-mail server-side, uma sessão local de outro e-mail é encerrada automaticamente antes do redirecionamento. O cookie HttpOnly da intent é independente da sessão Supabase e o Evento continua sem jamais ser vinculado ao usuário anterior.
- O cadastro inline deixou de devolver ou guardar `password_setup_token` em React state. `POST /api/auth/confirm-registration` grava o token bruto somente em cookie HttpOnly `estudotop_first_access`, `SameSite=Lax`, seguro em produção, restrito a `/api/auth/first-access` e com TTL de 72 horas; apenas o SHA-256 permanece no banco. `GET /api/auth/first-access` recupera o contexto validado para que refresh em `/cadastro?event=...` retome a etapa de senha.
- A confirmação do código reivindica atomicamente a confirmação antes de criar a conta, bloqueando duplo submit. No fluxo de Evento, first-access é garantido antes de profile, participante e consumo da intent; todos os writes críticos são verificados e nenhuma falha de token retorna sucesso.
- `POST /api/auth/first-access` preserva token/cookie em falhas posteriores à alteração da senha, informa que a senha já foi atualizada e permite reconciliação idempotente. O cookie é apagado somente no sucesso completo.
- O login automático agora verifica erro e sessão. Se falhar depois da senha criada, a tela informa o sucesso da senha e oferece entrada normal, preservando a participação já idempotente.
- Reenvio continua substituindo o token anterior, sem armazenar token raw e sem migration. A mensagem de reenvio passa a orientar o uso do e-mail mais recente; logs sanitizados distinguem rejeição por formato, ausência, expiração, consumo, slug e Evento, além da substituição e falhas de invalidação.

## 92. Automação, operação, acesso, lembretes e participantes (2026-09-04)

### Operação temporal

- O sistema já usava `effectiveEventStatus()` (`lib/server/simuladoEvents.ts`) como fonte de verdade em tempo real, calculada a partir de `status`, `starts_at`, `ends_at` e `started_at` — não da coluna `status` isolada. Todas as rotas críticas (ingresso, início de tentativa, dashboards admin/professor, resultado) já consultavam essa função antes desta Sprint. Isso já garantia início e encerramento **funcionais** por horário, mesmo sem nenhuma página aberta e sem depender de React.
- O gap real era o `status` **persistido**: sem nenhuma ação manual, um Evento cruzava `starts_at`/`ends_at` sem que a linha em `simulado_events` refletisse isso (ficava "scheduled"/"active" indefinidamente até alguém clicar "Iniciar agora"/"Encerrar"). Isso foi fechado com `GET /api/admin/events/status-job` (novo cron diário — ver `docs/SEGURANCA_ENV_CRON_STORAGE.md`), que persiste `status`/`started_at`/`closed_at` de forma condicional e idempotente (`UPDATE ... WHERE status = 'scheduled'` / `WHERE status NOT IN ('closed','archived')`, confirmado por presença de linha).
- **Ação manual sempre prevalece**: como o job só atualiza linhas que ainda estão no status anterior esperado, uma ação manual já aplicada (`started_at`/`closed_at` já setados, `status` já mudado) nunca é sobrescrita, duplicada em log ou reprocessada pelo cron.
- **Plano Vercel = Hobby**: cron só roda 1x/dia por job (confirmado com o usuário). Isso significa que o `status` persistido pode ficar até ~24h defasado da realidade em casos raros — mas o **acesso real nunca fica**, porque toda rota crítica recalcula `effectiveEventStatus()` a cada request, inclusive se o cron atrasar ou nunca rodar.

### Controles (comportamento real auditado)

| Ação | Admin | Professor atribuído | Professor não atribuído |
|---|---|---|---|
| Iniciar | Sim | Sim | Não (403) |
| Encerrar | Sim | Sim | Não (403) |
| Reabrir | Sim | Sim | Não (403) |

Este comportamento **já existia** antes desta Sprint (`requireEventManager` em `lib/server/authGuard.ts` já aceitava Admin ou professor atribuído para as três ações, em `app/api/admin/events/[id]/route.ts` e `app/api/professor/events/[id]/route.ts`) e não foi alterado — só confirmado e documentado, pois a documentação anterior estava desatualizada quanto a "professor não pode encerrar/reabrir".

### Admin no painel operacional

- Novo guard de página `requireEventManagerPage(eventId)` (`lib/server/authGuard.ts`), espelhando `requireEventManager` (rotas de API): Admin acompanha qualquer Evento sem precisar de linha em `simulado_event_professors` e sem nenhuma forma de impersonation (permanece autenticado como `role = admin`); professor só entra se estiver atribuído a este Evento.
- `app/professor/eventos/[id]/page.tsx` e `.../preview/page.tsx` passaram a usar esse guard em vez de `requireProfessorPage` — é **a mesma dashboard e a mesma preview**, nenhuma tela nova foi criada.
- `/admin/eventos/[id]` ganhou o botão "Acompanhar Evento", que abre `/professor/eventos/[id]?popup=1` em **nova guia** (`target="_blank" rel="noopener noreferrer"`, suporte novo e opcional em `PremiumButton`), sem substituir a página Admin atual.
- O parâmetro `?popup=1` aciona o mecanismo **já existente** em `app/components/AppShell.tsx` (`isPopupRoute`) que renderiza somente `{children}` — sem sidebar, sem header, sem nenhum menu, Admin ou não. Nenhum layout novo foi criado; o próprio conteúdo de `app/professor/eventos/[id]/page-client.tsx` já é autocontido (não depende das classes `.teacher-theme`/`.et-teacher-*` do wrapper normal), então o resultado visual na nova guia é idêntico ao que o professor vê.

### Entrada do aluno

- Novo campo `event_destination` em `GET /api/student/nav-access`, calculado a partir dos Eventos com participação real e `effective_status` `active`/`scheduled` (closed/archived nunca contam).
- `lib/student-nav.ts` (`studentHomePath`) passou a priorizar: exatamente 1 Evento relevante → vai direto para `/meus-eventos/[id]` (serve tanto o Evento `active` quanto a tela de espera do `scheduled`); mais de 1 → sempre `/meus-eventos`, nunca escolhe automaticamente; 0 → comportamento histórico inalterado. A prioridade vale só para o destino inicial (login e `AppShell`); depois disso a navegação é livre, sem middleware de captura.
- `/meus-eventos` (`page-client.tsx`) ordena os cards: `active` primeiro, depois `scheduled` por `starts_at` mais próximo, resto mantém a ordem histórica (`joined_at desc`, já resolvida pela API). O primeiro `active`/`scheduled` da lista recebe glow discreto (classe `.student-journey-card--priority`, aditiva em `app/globals.css`, reaproveitando os tokens de cor já usados no card).

### Lembretes

**Decisão de produto (2026-09-04): o EstudoTOP NÃO envia lembretes automaticamente.** A versão anterior desta Sprint havia implementado um lembrete automático (~12h antes, via cron diário) — foi **removida por completo** antes de qualquer publicação: sem cron de lembrete, sem janela T-12h/24h, sem `source` automatic/manual, sem status `suppressed`. O `GET /api/admin/events/status-job` (cron diário) permanece existindo, mas **só** para a reconciliação de status (início/encerramento automático do Evento, seção "Operação temporal" acima) — nunca mais envia e-mail.

- O envio é **exclusivamente manual**: botão "Enviar lembrete agora" em `/admin/eventos/[id]`, só Admin (a rota `app/api/professor/events/[id]/route.ts` não ganhou essa ação), só enquanto o Evento está `scheduled` (é um lembrete pré-evento; Evento já `active`, `closed` ou `archived` nunca envia por aqui).
- Tabelas (migration ajustada nesta revisão para o modelo manual-only; **aplicada em produção em 2026-09-04**): `simulado_event_reminders` (um registro por operação/lote — `status` sending/sent/failed, contadores de destinatários, `completed_at`, `triggered_by`) e `simulado_event_reminder_recipients` (um registro por aluno, para auditoria/retry pontual). A coluna `source` e o status `suppressed` foram removidos da migration (nunca haviam sido aplicados em produção) — sem essa distinção não haveria mais que um único valor possível, então a coluna deixou de ter propósito; ver `lib/server/eventReminders.ts`.
- Cooldown **global de 6h por Evento**, contado a partir do último lote MANUAL bem-sucedido: lido de `max(completed_at) where status = 'sent'` em `simulado_event_reminders`. Uma tentativa que falhou (`status = 'failed'`) nunca inicia cooldown.
- Concorrência: índice único parcial `(event_id) where status = 'sending'` impede duplo clique, retry HTTP e duas abas concorrentes — só uma operação por Evento por vez.
- Um clique bloqueado pelo cooldown **não cria nenhum registro no ledger** — o servidor apenas responde `blocked: true` + `next_available_at`; só um `logSecurityEvent` administrativo sanitizado (`event_reminder_cooldown_blocked`) é registrado.
- Botão permanece sempre visível durante o cooldown (nunca escondido), com cronômetro regressivo calculado a partir de `next_available_at` devolvido pelo servidor (não um horário inventado no cliente), habilitando automaticamente ao chegar em zero. O endpoint manual revalida o cooldown no servidor (`now >= last_successful_reminder_at + 6h`) independentemente do estado do botão no cliente.
- Elegibilidade: participantes reais do Evento com `students.status = 'active'`.
- Conteúdo do e-mail (`eventReminderTemplate`/`eventReminderPlainText`, `lib/email/studentRegistrationTemplates.ts`) usa linguagem temporal neutra ("Lembrete do Evento" / "está chegando") — nunca menciona "faltam 12 horas" ou qualquer frase que dependa de automação.
- Nenhuma migration foi executada.

**Máquina de estados do lote (`getReminderStatusInfo`, `lib/server/eventReminders.ts`) — corrigida em 2026-09-04.** A UI reconhece três estados: `available` (botão habilitado), `cooldown` (disabled + cronômetro, último lote `sent` há menos de 6h) e `sending` (disabled + "Envio de lembrete em andamento...", sem cronômetro — ainda não existe `completed_at`). `GET /api/admin/events/[id]` sempre recalcula esse estado no servidor antes de responder; a página faz polling discreto (`setInterval` de 4s) enquanto `sending`, sem WebSocket.
- **`sending` nunca é eterno.** Um registro `sending` mais velho que `STALE_SENDING_MINUTES` (5 minutos — margem generosa acima do tempo real de um lote de ~100 destinatários em série) é considerado abandonado (processo morto: crash, timeout de função serverless, restart) e reconciliado sob demanda para `failed` (`reason: "stale_sending_recovered"`) sempre que o estado é consultado ou um novo envio é tentado — **sem cron**, conforme decisão de produto. Recipients já marcados `sent` pelo lote abandonado são preservados e excluídos do próximo lote (não recebem de novo); recipients pendentes/falhos voltam a ser elegíveis.
- O `INSERT` de reserva do lote (`status='sending'`) só é interpretado como "envio já em andamento" quando o erro do Postgres é `23505` (violação real do índice único). Qualquer outro erro (ex.: tabela ausente) é reportado como falha genuína, nunca mascarado como concorrência — bug real corrigido nesta revisão (a implementação anterior tratava todo erro de INSERT como conflito).
- Sucesso parcial (parte dos destinatários recebeu, parte falhou) **inicia cooldown normalmente** — semântica já implementada desde a primeira versão da funcionalidade, apenas confirmada aqui: `sentCount > 0` já bastava para `status = 'sent'`.
- Exceção inesperada depois de reservar o lote é capturada e o lote é fechado como `failed` antes de propagar o erro — nunca fica `sending` esperando o lease expirar se ainda é possível fechar imediatamente.

### Participantes

- `/admin/eventos/[id]`: campo de busca por nome/e-mail sobre a lista de participantes já inscritos (a busca do professor, por ranking/score, já existia e não foi alterada). Ordenação sempre A→Z (`localeCompare("pt-BR", { sensitivity: "base" })`, desempate por e-mail e depois por id). Busca e ordenação são puramente visuais — não alteram vínculo, status, notas, tentativas, TopCoins ou resultado.
- `/admin/eventos` (listagem, 2026-09-04): cada card mostra o número de participantes inscritos. `GET /api/admin/events` agrega com `simulado_event_participants(count)` no embed do PostgREST — uma única query para toda a listagem, sem N+1. Toda linha de `simulado_event_participants` já representa participação válida (não há status cancelado/pausado na tabela); Evento sem participante mostra `0`, nunca esconde a informação.

# 96. Correção estrutural — tentativa representativa é a primeira tentativa concluída válida (2026-09-06)

**Bug real corrigido.** Até esta correção, `representative_attempt_id` era gravado no momento em que a tentativa era **criada** (`POST .../attempts`, tanto ao iniciar quanto ao retomar uma `in_progress`), guardado apenas por `.is("representative_attempt_id", null)`. Se essa primeira tentativa terminasse `disqualified`/`expired`/`abandoned`, uma segunda tentativa `completed` **não conseguia** assumir o lugar — o campo já não era mais `null`. Casos reais identificados e corrigidos pontualmente no banco (sem alterar código, antes desta Sprint): participantes do Evento "3º Simulado de Processo Civil" cuja tentativa desclassificada por foco continuava sendo a "oficial" mesmo depois de uma tentativa seguinte concluída com sucesso.

### Tentativa representativa — regra final

> **A tentativa representativa/oficial de um participante no Evento é a primeira tentativa que atinge `status = "completed"` AND `counts_toward_limit = true`.**
>
> Não é a primeira tentativa **criada**, nem a **última**, nem a de **melhor nota**.

Distinção central, para não confundir os dois conceitos:

- **Consumir tentativa** (contar no limite de `simulados.max_attempts`) acontece assim que uma tentativa é iniciada com `counts_toward_limit = true` — `in_progress`, `disqualified`, `expired` e `abandoned` todas consomem normalmente, sem mudança nesta correção.
- **Gerar/consolidar resultado oficial** só acontece quando a tentativa é `completed` **e** `counts_toward_limit = true`. Uma tentativa pode consumir o limite inteiro sem nunca virar resultado oficial (ex.: as 3 tentativas de um aluno terminam `abandoned`, `disqualified`, `disqualified` — consumiu 3, nenhuma delas produz nota).

Exemplo dos dois conceitos juntos: tentativa 1 `abandoned` (consumiu 1, sem resultado), tentativa 2 `disqualified` (consumiu 1, sem resultado), tentativa 3 `completed` (consumiu 1 **e** vira a representativa/resultado oficial).

### Implementação

Único ponto de escrita não-nula de `representative_attempt_id` em todo o repositório: `consolidateEventRepresentativeAttempt()` (`lib/server/simuladoEvents.ts`), chamado exclusivamente por `POST .../attempts/[attemptId]/submit`, e só depois que esse mesmo request já persistiu `status: "completed", counts_toward_limit: true` na tentativa. A função:

1. Valida o **próprio candidato** recebido (`attemptId`) — só prossegue se ele mesmo já é `completed` + `counts_toward_limit`; não confia apenas no chamador ter checado isso, tornando a função o único ponto de verdade da regra.
2. Lê o representante atual do participante. Se ele já é `completed` + `counts_toward_limit`, **preserva** (a primeira válida nunca é trocada por uma posterior — cobre completed→completed).
3. Caso contrário (nulo, ou aponta para `disqualified`/`expired`/`abandoned`/`in_progress`/id inconsistente), substitui pela nova, usando compare-and-swap pelo valor lido (`eq` no valor antigo, ou `is(null)` quando não havia nenhum) — protege contra corrida entre duas submissões concorrentes.

`POST .../attempts` (criação e retomada de `in_progress`) **não grava mais** `representative_attempt_id` em nenhum dos dois pontos — só existe o comentário explicando por que a consolidação foi movida para o submit. A única outra escrita no campo em todo o repositório é o reset administrativo (`PATCH /api/admin/events/[id]/participants/[studentId]`, ação `set_attempts` com `attempts=0`), que grava `null` explicitamente ao zerar o histórico — não é uma atribuição de tentativa e não conflita com a regra.

O dashboard do Professor/Admin (`app/api/professor/events/[id]/route.ts`) recebeu um ajuste de leitura complementar: quando não há representante válido nem tentativa em andamento (ex.: participante só tem tentativas desclassificadas/expiradas/abandonadas, nenhuma completed ainda), o status exibido usa a tentativa mais recente **apenas para mostrar a situação real** ("Desclassificado", "Expirado") — isso nunca escreve nem altera `representative_attempt_id`, que continua reservado exclusivamente à primeira conclusão válida.

**Independência por Evento:** garantida estruturalmente pelo índice único `unique_simulado_event_participants (event_id, student_id)` — um aluno tem no máximo uma linha (e portanto um `representative_attempt_id` próprio) por Evento; dois Eventos com o mesmo Simulado nunca compartilham essa referência.

**Dados históricos:** reauditado o banco de produção após a correção — 218 participantes de Evento analisados, **0 inconsistentes** (nenhum `representative_attempt_id` aponta para tentativa inválida enquanto existe uma `completed` válida disponível e não usada). Os únicos 2 casos reais que existiam foram corrigidos por backfill pontual, manual e documentado, antes desta entrega de código.

**Testes:** `tests/event-representative-attempt/event-representative-attempt.spec.ts` — cobre a validação do candidato, a preservação da primeira válida, a substituição de representante inválido via CAS, a ausência de escrita na criação/retomada, a ordem submit→consolidação, o fallback de exibição do dashboard sem escrita, o reset administrativo como única exceção, e a independência por Evento via constraint de schema. Segue o mesmo padrão de leitura de código-fonte já usado por `tests/event-operations/event-operations.spec.ts` — `lib/server/simuladoEvents.ts` importa `"server-only"` (resolvido só pelo bundler do Next, não instalável/importável em teste standalone), então a cobertura é de auditoria estrutural do código real, não de execução com mocks.

**Fora do escopo desta correção (pendência de produto registrada, não implementada):** o limite máximo de tentativas (`max_attempts`) continua pertencendo ao Simulado. Há decisão futura de movê-lo para Jornada/Evento — não implementada aqui, e a semântica de consumo/resultado oficial descrita acima já foi desenhada para continuar valendo sem alteração quando essa mudança futura acontecer.

# 97. Anulação/desanulação de questão e reprocessamento — efeito sobre Eventos (2026-09-06)

Anular ou desanular uma questão (`simulado_questions.status`) é uma operação por **Simulado**, nunca por Evento — se o mesmo Simulado estiver vinculado a mais de um Evento (ou também usado em Jornada/avulso), a anulação afeta todos eles simultaneamente, por design (ver `docs/Sprint-resultados.md`). O Professor só pode disparar essa ação para o Simulado vinculado ao Evento ao qual está associado (`app/api/professor/events/[id]/questions/[relationId]/annul/route.ts`, guard `requireEventManager`), mas o efeito, uma vez autorizado, é sempre sobre o Simulado inteiro — nunca escopado por `event_id`. Isso não muda `representative_attempt_id` nem a regra da seção 96: o reprocessamento atualiza o **resultado** da tentativa já representativa, nunca troca qual tentativa é a representativa.

**Fechamento (2026-09-06):** o ranking exibido na aba Participantes do Modo Aula (`rankedParticipants()`, extraída para `lib/eventRanking.ts`) já é recalculado a cada carregamento a partir de `simulado_results` — reflete automaticamente qualquer anulação/desanulação/gabarito, sem nenhuma alteração necessária, e sem cache: o polling de 10 segundos já existente (seção 95) garante atualização visível em pouco tempo mesmo sem recarregar a página. Concorrência entre duas ações de anulação/desanulação no mesmo Simulado (por dois atores, Admin e/ou Professor, inclusive de Eventos diferentes que compartilham o Simulado) é serializada pelo compare-and-swap em `simulado_questions.status` — ver `docs/Sprint-resultados.md` para o teste real de concorrência.

**Fechamento cirúrgico (2026-09-07):** a notificação que o aluno recebe (`question_annulled_result_changed`/`question_reactivated_result_changed`) agora distingue duas anulações reais distintas no mesmo Simulado (ex.: Professor anula a questão X num Evento e, depois, anula a questão Y) — antes, a segunda sobrescrevia silenciosamente a primeira na mesma tentativa. Não muda nada específico de Evento: a identidade de revisão vive em `simulado_questions.status_revision_id`, consumida igualmente por Admin e Professor via o mesmo `setSimuladoQuestionAnnulment()`. Ver `docs/Sprint-resultados.md`.

# 98. PDF neutro da prova gerado pelo Professor/Admin (2026-09-08)

Botão "Gerar prova em PDF" em `/professor/eventos/[id]` (Admin acessa a mesma tela via `requireEventManagerPage`), ao lado de "Ver como aluno". Reaproveita o único renderer existente do PDF do aluno (`SimuladoQuestionsPdf`, `app/lib/pdf/simulado-result-pdf.ts`) — nenhum template paralelo: mesma capa, mesma tipografia, mesmas questões/alternativas/gabarito, mesmo cabeçalho/rodapé.

**Fonte dos dados:** nova rota `GET /api/professor/events/[id]/exam-pdf`, guardada por `requireEventManager` (mesmo padrão da seção 97). Resolve o Simulado a partir do `simulado_id` do próprio `simulado_events` no banco — nunca de parâmetro do cliente. Sem Simulado vinculado, erro controlado: "Este evento não possui um simulado disponível para geração do PDF." A consulta é só `simulado_events` + `simulado_questions` (com `question_alternatives`/`subjects`) — nenhuma tabela de aluno, tentativa ou participante é tocada.

**Neutralidade:** `student` passou a ser opcional em `SimuladoQuestionsPdf`; a nova função `downloadNeutralSimuladoPdf` chama o mesmo componente sem `student` — a marca d'água pessoal (nome/e-mail/CPF do aluno, duas vezes por página no fluxo normal) simplesmente não é renderizada, nunca com um placeholder "não informado". O fluxo do aluno (`downloadSimuladoResultPdf`) continua exatamente como antes, com a marca d'água real. Nome do arquivo e metadata do PDF (`author: "EstudoTOP Simulados"`) já eram apenas institucionais e não precisaram de ajuste.

**Sem impersonation, sem depender de aluno:** o PDF é montado direto do vínculo Evento → Simulado; não há tentativa, aluno fictício, `student_id`, `participant_id` ou `attempt_id` envolvido em nenhum ponto.

**Testes:** `tests/professor-exam-pdf/professor-exam-pdf.spec.ts` (10 casos — auditoria estrutural do código real, mesmo padrão das seções 90/96). Regressão confirmada: `event-professor-assignment`, `event-operations`, `event-representative-attempt`, `event-acquisition-session`, `simulado-question-annulment`, `simulado-scoring` — 131/131.

**Achado fora do escopo, registrado e não corrigido:** o renderer (aluno e Professor, idêntico nos dois) não trata visualmente questão anulada nem renderiza imagens — gap pré-existente do próprio PDF, não introduzido por esta entrega; corrigi-lo alteraria também o PDF do aluno, fora do pedido desta Sprint.

**Capa oficial do Ranking do Simulado (Parte B desta Sprint) — bloqueada:** o arquivo de imagem indicado na solicitação não foi encontrado em nenhum diretório acessível nesta sessão; nenhum asset foi criado nem inventado. O padrão de dimensionamento a reaproveitar já foi identificado (A4, imagem `position: absolute`, `objectFit: "cover"`, 100%×100%, mesmo mecanismo de `s.coverImage` em `simulado-result-pdf.ts`), e o sistema hoje não tem nenhum fluxo de exportação/PDF de ranking — só a tabela em tela do Modo Aula (`rankedParticipants()`). Nenhuma feature nova foi criada sem autorização; aguardando o arquivo da imagem. *(Nota: bloqueio resolvido nas seções 99–100 abaixo — o Ranking em PDF foi implementado e o arquivo da capa foi fornecido e integrado.)*

### Prova Professor

# 99. Caderno de prova do Professor/Admin sem gabarito + Ranking em PDF (2026-09-08)

**Parte A — `showAnswerKey`, o caderno de prova do Professor deixa de mostrar o gabarito.** `SimuladoQuestionsPdf` (mesmo componente único, `app/lib/pdf/simulado-result-pdf.ts`) ganhou o parâmetro `showAnswerKey?: boolean` (default `true`). Todo o destaque de alternativa correta (fundo verde, borda, bolinha da coruja) passou a depender de uma variável local `highlightCorrect = showAnswerKey && Boolean(alternative.is_correct)` — nenhum outro trecho do componente lê `alternative.is_correct` diretamente. `downloadSimuladoResultPdf` (fluxo do aluno) chama com `showAnswerKey: true` — comportamento idêntico ao anterior, sem nenhuma mudança visível para o aluno. `downloadNeutralSimuladoPdf` (Professor/Admin, seção 98) passou a chamar com `showAnswerKey: false` — nenhuma alternativa recebe destaque/coruja, mesmo a correta no banco: caderno de prova limpo.

Reforço de defesa em profundidade na rota `GET /api/professor/events/[id]/exam-pdf`: `is_correct` foi removido do `.select()` do Supabase, do tipo `QuestionRow` e do mapeamento de resposta — o gabarito nem é buscado do banco para o fluxo do Professor, não só escondido na renderização.

Questão anulada: nenhum tratamento visual dedicado existe hoje no renderer (aluno e Professor, idêntico) — gap pré-existente, já registrado na seção 98, não alterado nesta entrega (corrigi-lo mudaria também o PDF do aluno).

### Ranking PDF

**Parte B — Exportação do Ranking oficial em PDF, dentro da própria aba Ranking.** Novo botão "Exportar ranking em PDF" no topo da aba "Participantes" de `/professor/eventos/[id]` (a aba que contém a tabela "Ranking oficial"), ao lado do contador "X de Y participantes" — deliberadamente **não** no cabeçalho geral do Evento, onde vive "Gerar prova em PDF" (seção 98); os dois botões resolvem problemas diferentes e ficam em blocos visuais diferentes.

**Renderer dedicado:** `app/lib/pdf/event-ranking-pdf.ts` (documento separado do caderno de questões, conforme autorizado — estruturas visuais diferentes, sem necessidade de forçar os dois no mesmo template). Exporta `downloadEventRankingPdf({ eventName, simuladoTitle, participants })`, além de duas funções puras testáveis isoladamente: `formatCompactTime(ms)` (formato compacto sem milissegundos: `"38min 42s"`, `"59min 03s"`, `"1h 05min"`, `"1h 42min"`) e `buildRankingRows(participants)` (filtra e formata, sem reordenar nada).

**Nenhuma regra de ranking nova:** `buildRankingRows` recebe a lista já processada por `rankedParticipants()` (`lib/eventRanking.ts` — a mesma função importada por `page-client.tsx` e usada pela tabela em tela) e só filtra quem tem `rank !== null` (ou seja, participantes com resultado consolidado — os mesmos que aparecem numerados na tela; quem ainda não concluiu aparece na aba como registro operacional, mas nunca teve posição numérica, então não entra no PDF de ranking). Nenhum `.sort()` próprio existe no arquivo do renderer.

**Sem endpoint novo — zero N+1:** ao contrário do PDF da prova (que precisa buscar as questões do Simulado, dado que a tela do Evento não as carrega), a aba Participantes já recebe todos os dados necessários (`id`, `name`, `result.correct_count`, `result.time_spent_ms`) na resposta existente de `GET /api/professor/events/[id]`. O PDF do ranking é gerado 100% client-side a partir do mesmo array `participants` (o mesmo `useMemo(() => rankedParticipants(...))` já usado pela tabela em tela) — garantia de paridade tela↔PDF por construção (é literalmente o mesmo objeto), sem nenhuma requisição de rede adicional. A autorização já está coberta pelo carregamento da própria dashboard (`requireEventManager` em `GET /api/professor/events/[id]`): um Professor não associado ao Evento nunca chega a ter `participants` para exportar.

**Botão:** `PremiumButton`, ícone `FileText`/spinner `Loader2` (mesma linguagem visual do botão "Gerar prova em PDF"), estado `rankingPdfBusy` com guarda de duplo clique (`if (rankingPdfBusy) return;`), `try/catch/finally` restaurando o estado sempre, mensagem de erro não técnica ("Não foi possível gerar o ranking em PDF. Tente novamente."). Reorganiza em coluna abaixo do bloco de título em telas estreitas (grid responsivo já existente na seção).

**Conteúdo do PDF:** página 1 = capa institucional (só a imagem, nada sobreposto); páginas seguintes = cabeçalho fixo (elegível "RANKING", nome do Evento, nome do Simulado) + cabeçalho de tabela fixo (Pos. | Nome | Tempo | Acertos, repete em toda página por overflow) + linhas (`wrap: false` — nunca dividida entre páginas) + rodapé fixo ("EstudoTOP Simulados" + paginação). Só quatro colunas — nenhum CPF/e-mail/telefone/ID interno é lido ou desenhado. Top 3 recebem uma bolinha de posição com tom dourado/prateado/bronze discreto, sem aumentar a altura da linha; empate usa o mesmo `rank_tied` da tela, com selo "EMPATE" pequeno ao lado do nome. Nome de arquivo neutro: `ranking-estudotop-<slug-do-evento>.pdf`.

**Capa oficial do Ranking — resolvida nesta rodada.** O arquivo indicado na solicitação (`f07be6d1-8b93-44fb-8747-7d956cf35f14.png`) foi fornecido pelo usuário diretamente em `public/images/pdf/capa-ranking-simulado.png` (1055×1491px) — exatamente o caminho que `RANKING_COVER_SRC` já esperava desde a implementação anterior. Nenhuma mudança de código foi necessária: a `Page` da capa já usava o mesmo mecanismo de `s.coverPage`/`s.coverImage` da capa do Simulado (A4, `Image` absolute full-bleed, `objectFit: "cover"`) — a capa passou a aparecer normalmente assim que o arquivo existiu no caminho esperado.

**Testes:** `tests/event-ranking-pdf/event-ranking-pdf.spec.ts` (40 casos, após a seção 101 abaixo) — combina execução real (não só leitura de código): `formatCompactTime` com casos de borda (`5min 12s`, `59min 59s`, `1h 00min`, `1h 05min`, `1h 42min`, sem milissegundos), posições (1º/2º/3º/9º/10º/99º/100º), empate competitivo (1º,1º,1º,4º) reaproveitando `rankedParticipants` real de `lib/eventRanking.ts`, paridade tela×PDF (ordem preservada, participantes sem posição excluídos sem afetar os demais, acertos = `correct_count` consolidado sem recálculo), estresse com 137 participantes (sem duplicata, sem participante perdido, posições não decrescentes), nome longo preservado por completo, privacidade (nenhum CPF/e-mail/telefone/ID interno fora de comentários explicativos), ausência de `.sort()` próprio, mecanismo de capa idêntico ao do Simulado, capa isolada na página 1 sem tabela sobreposta, existência física do asset de capa em `public/images/pdf/`, carregamento robusto da capa (ver seção 101), cabeçalho de tabela fixo com as 4 colunas, `wrap:false` por linha, rodapé com o domínio oficial, ausência de marca d'água, e todo o comportamento do botão (posição na aba correta, sem fetch de rede, guarda de duplo clique, restauração de estado, mensagem de erro). Regressão confirmada: `event-professor-assignment`, `event-ranking-pdf`, `professor-exam-pdf`, `professor-management`, `simulado-question-annulment`, `simulado-scoring` — 142/142.

# 100. Capa oficial e marca d'água do Ranking integradas; rodapé com domínio (2026-09-08)

Os dois assets antes bloqueados (seção 99) foram fornecidos localmente pelo usuário em `public/images/pdf/` e integrados:

- **`capa-ranking-simulado.png`** (1055×1491px) — mesmo arquivo antes referenciado como não localizado. `RANKING_COVER_SRC` já apontava para esse caminho exato desde a seção 99; nenhuma mudança de código foi necessária, só a presença do arquivo.
- **`marca-dagua-oficial.png`** (2172×724px, RGBA) — nova, integrada nesta rodada como marca d'água institucional (logotipo "EstudoTOP Simulados", não dado pessoal) das páginas de conteúdo do ranking. Renderizada via `View` `fixed` (repete em toda página gerada por overflow, igual ao cabeçalho e ao rodapé), centralizada horizontalmente, `opacity: 0.06`, tamanho fixo 300×100pt — sutil, atrás do cabeçalho/tabela, nunca na Page da capa (Page separada, sem esse elemento).
- **Rodapé:** texto do EstudoTOP passou de `"EstudoTOP Simulados"` para `"EstudoTOP Simulados - simulados.estudotop.com.br"` — mesmo estilo discreto (borda superior fina, fonte 7.5pt), ao lado do nome do Evento/Simulado e da paginação.

Nenhuma mudança na Parte A (prova do Professor), nenhuma mudança de regra de ranking, nenhuma migration. Testes novos em `tests/event-ranking-pdf/event-ranking-pdf.spec.ts`: existência física dos dois arquivos (`existsSync`/tamanho mínimo — prova de que o bloqueio foi resolvido, não só declarado), estilo de opacidade baixa da marca d'água, marca d'água ausente da Page da capa e presente na Page de conteúdo, texto exato do rodapé com o domínio — 37/37 passando. Regressão completa: 139/139.

*(Nota: a marca d'água descrita acima foi removida na seção 101 — ficou visualmente ruim em homologação local. O asset `marca-dagua-oficial.png` permanece em disco, só não é mais usado.)*

# 101. Marca d'água removida do Ranking; capa oficial com carregamento robusto (2026-09-08)

Ajuste pós-homologação local, feito ANTES de qualquer commit/push desta Sprint. Dois problemas relatados:

**A) Marca d'água ficou visualmente ruim.** Decisão do usuário: remover por completo. `RANKING_WATERMARK_SRC`, o componente `PdfWatermark`, os estilos `watermark`/`watermarkImage` e a chamada `React.createElement(PdfWatermark)` na Page de conteúdo foram removidos de `app/lib/pdf/event-ranking-pdf.ts` — nenhum resquício sobrevive no renderer (confirmado por teste que varre o arquivo). O asset `public/images/pdf/marca-dagua-oficial.png` foi preservado no disco (não apagado — nenhuma política de assets exige remover um arquivo só porque um uso específico parou de referenciá-lo).

**B) Capa oficial não apareceu no localhost.** Investigação:

1. Confirmado fisicamente: `public/images/pdf/capa-ranking-simulado.png` existe, é um PNG válido de 1055×1491px (RGB), nome exato, sem duplicata com nome parecido, mesma dimensão da já comprovada `capa-simulado-pdf.png`.
2. Comparação byte-a-byte com o mecanismo da capa do Simulado (`app/lib/pdf/simulado-result-pdf.ts`): `size: "A4"` + `Image` `position: absolute`, `width/height: 100%`, `objectFit: "cover"` — idêntico em ambos os arquivos. Não havia typo, variável errada ou path malformado no código do Ranking.
3. Auditoria do código-fonte real do `@react-pdf/renderer` (`node_modules/@react-pdf/image/lib/index.browser.js`, função `resolveImage`): a resolução de imagem por URL é cacheada em memória (`IMAGE_CACHE`, `Map` de até 30 entradas) **pela vida da aba/SPA**, e o cache guarda a própria `Promise` — inclusive quando ela é rejeitada. Se a primeira tentativa de gerar o Ranking em PDF ocorrer antes do arquivo existir (404 → `getImageFormat` não reconhece o corpo vazio → rejeita), toda chamada seguinte de `resolveImage` com a mesma URL, na mesma aba, reaproveita essa promise rejeitada — a capa nunca mais aparece naquela sessão do navegador, mesmo depois do arquivo existir, sem lançar nenhum erro visível. Esse é o cenário mais provável do relato ("testei, ainda não tinha o arquivo; adicionei o arquivo; testei de novo na mesma aba; continuou sem aparecer").
4. O mecanismo de URL relativa (`fetch(src.uri, ...)` interno do react-pdf) em si funciona como qualquer `fetch` relativo de navegador — não há diferença de comportamento entre a capa do Simulado e a do Ranking nesse ponto; o problema é o cache de falha, não a resolução de URL.

**Correção:** nova função exportada `loadRankingCoverDataUri()` busca a capa por conta própria — `fetch(RANKING_COVER_SRC, { cache: "reload" })` (ignora qualquer resposta antiga guardada pelo navegador) — converte o corpo para base64 (`data:` URI, usando `Buffer` quando disponível ou codificação manual em blocos de 32KB em ambientes sem `Buffer`) e entrega esse `data:` URI já resolvido ao `<Image>`. Como o `<Image>` passa a receber o conteúdo já pronto, o `IMAGE_CACHE` interno do react-pdf nunca entra em jogo para a capa do Ranking — elimina a classe inteira desse problema, não só o sintoma observado.

**Falha vira erro controlado, nunca página em branco silenciosa:** se o `fetch` falhar (rede) ou responder não-2xx, `loadRankingCoverDataUri()` lança `new Error("Não foi possível carregar a capa do ranking.")`. `downloadEventRankingPdf()` chama e aguarda essa função **antes** de montar `EventRankingPdf`/chamar `pdf(...).toBlob()` — se falhar, nenhum PDF é gerado. No painel (`page-client.tsx`), `generateRankingPdf()` reconhece essa mensagem específica (comparando com a constante exportada `RANKING_COVER_LOAD_ERROR`) e a exibe diretamente ao usuário; qualquer outra falha inesperada continua caindo no fallback genérico já existente ("Não foi possível gerar o ranking em PDF. Tente novamente.") — nunca expõe um erro técnico bruto.

**Preservado sem alteração:** estrutura da tabela (posição/nome/tempo/acertos, ordenação, desempate, separadores, layout compacto), cabeçalho/rodapé fixos e repetição por página, paginação, capa como página 1 isolada sem sobreposição de tabela, mesmo dimensionamento/`objectFit` da capa do Simulado, PDF da prova do Professor (`simulado-result-pdf.ts` não foi tocado), regra de ranking (`rankedParticipants`), scoring/anulação/TopCoins/notifications/`representative_attempt_id`.

**Testes:** `tests/event-ranking-pdf/event-ranking-pdf.spec.ts` — bloco de marca d'água substituído por dois testes que confirmam a ausência total de referências e a preservação do asset em disco; novo bloco de 4 testes de execução real para `loadRankingCoverDataUri()` (fetch mockado): sucesso retorna `data:` URI válida chamando a URL certa com `cache: "reload"`, resposta 404 lança o erro controlado, falha de rede lança o erro controlado, e um teste estrutural confirmando que a chamada de carregamento da capa precede a montagem do PDF dentro de `downloadEventRankingPdf`. Total: 40 casos, todos passando. Regressão completa (`event-professor-assignment`, `event-ranking-pdf`, `professor-exam-pdf`, `professor-management`, `simulado-question-annulment`, `simulado-scoring`): 142/142. `npx tsc --noEmit` e `npm run build` limpos.

Nenhuma migration. Nenhum commit/push/deploy nesta etapa.

# 102. Cabeçalho/rodapé do Ranking sem duplicação de nome (2026-09-09)

Ajuste pré-commit, feito ANTES de qualquer commit/push desta Sprint. Problema relatado: quando o nome do Evento e o nome do Simulado vinculado são iguais (caso comum), o cabeçalho do PDF do Ranking exibia o mesmo texto duas vezes:

```
RANKING
3º Simulado de Processo Civil
3º Simulado de Processo Civil
```

**Causa:** `EventRankingPdf` (`app/lib/pdf/event-ranking-pdf.ts`) renderizava `eventName` no `headerTitle` e, logo abaixo, uma segunda linha (`headerSubtitle`) com `meta.simuladoTitle` sempre que presente — e no rodapé, `subtitle` era `` `${eventName} · ${meta.simuladoTitle}` ``. Quando os dois nomes coincidem, o resultado visual é a mesma string repetida.

**Correção — nova regra: só o nome do Evento.** Removidos do cabeçalho: a segunda linha (`meta.simuladoTitle ? React.createElement(Text, { style: s.headerSubtitle }, ...) : null`) e o estilo `headerSubtitle` (ficou órfão). O rodapé passou a receber `subtitle: eventName` diretamente, sem concatenar com o nome do Simulado. Cabeçalho agora é sempre:

```
RANKING
<nome do Evento>
```

E o rodapé mantém a mesma composição/posição visual de sempre — só o campo de identificação do documento (mesmo local já reservado) passou a mostrar apenas `eventName`.

**`simuladoTitle` preservado no tipo/API:** `RankingPdfMeta.simuladoTitle` e o parâmetro `simuladoTitle` de `downloadEventRankingPdf()` **não foram removidos** — `page-client.tsx` continua enviando `data?.event.simulados?.title` normalmente; o campo só deixou de ser lido dentro de `EventRankingPdf` para fins de apresentação. Nenhuma mudança no chamador foi necessária.

**Preservado sem alteração:** capa oficial (página 1, isolada, mesmo mecanismo/`objectFit` da capa do Simulado), tabela (posição/nome/tempo/acertos, ordenação, desempate, separadores, Top 3, cabeçalho da tabela), paginação, texto institucional do rodapé ("EstudoTOP Simulados - simulados.estudotop.com.br"), PDF da prova (`simulado-result-pdf.ts` não foi tocado).

**Testes:** `tests/event-ranking-pdf/event-ranking-pdf.spec.ts` ganhou 4 casos no novo bloco "cabeçalho e rodapé — nome do Evento uma única vez": cabeçalho mostra RANKING + eventName sem segunda linha; rodapé recebe só `eventName` (não concatena mais); `meta.simuladoTitle` não é lido em nenhum ponto de `EventRankingPdf`; `simuladoTitle` continua aceito no tipo/API. Total: 44 casos, todos passando. Regressão completa: 146/146. `npx tsc --noEmit` e `npm run build` limpos.

Nenhuma migration. Nenhum commit/push/deploy nesta etapa.

# 103. Nova regra oficial de classificação do Ranking + novos dados na tela/PDF/modal + normalização de nomes (2026-09-09)

Sprint cirúrgica: muda exclusivamente a regra de ORDENAÇÃO do ranking e a forma de APRESENTAÇÃO dos dados na tela, no modal "Ver" e no PDF. Nenhuma mudança em scoring, resultados consolidados, TopCoins, reconciliação ou `representative_attempt_id`.

### Nova regra oficial de classificação

Critério hierárquico, para no primeiro que diferenciar os participantes:

1. **maior pontuação** (score oficial já consolidado)
2. **menor uso da Ajuda da Coruja**
3. **menor número de advertências por troca/saída de tela**
4. **menor tempo de realização da prova**

Pontuação continua soberana — nenhum dos critérios 2-4 jamais faz alguém com nota inferior ultrapassar alguém com nota superior. Implementada em `lib/eventRanking.ts` (`rankedParticipants()`), a mesma função já usada pela tela e agora também pelo PDF — nenhuma regra paralela em nenhum dos dois. Ranking competitivo preservado (1º, 1º, 3º) quando os quatro critérios oficiais são idênticos; desempate técnico final (não pedagógico, só para estabilidade) por nome normalizado (pt-BR) e, em último caso, por `id`.

**Origem de cada critério (auditada em código antes da mudança):**
- **Pontuação:** `simulado_results.display_score` — o mesmo valor já exibido como "Nota" na tela. Não é `correct_count` ("acertos"), que é um número diferente sob modelos de pontuação como Cebraspe (erros descontam pontos). Cai para `correct_count` só quando `display_score` não vem (compatibilidade com chamadores/fixtures de teste antigos), preservando o comportamento anterior a esta mudança.
- **Coruja:** `simulado_attempts.owl_help_used_count` — contador oficial da tentativa, incrementado em `POST .../attempts/[attemptId]/owl-help`.
- **Advertências:** `simulado_attempts.focus_violation_count` — não `tab_switch_count` (contador bruto de eventos de troca de aba). `focus_violation_count` é a "fonte de verdade" documentada em `lib/simulado-focus-violation.ts`, o mesmo contador usado pela regra anti-cheat real (desclassificação na 3ª violação, `FOCUS_VIOLATION_LIMIT`).
- **Tempo:** `result.time_spent_ms` — o mesmo já usado antes desta mudança.

Todos pertencem à **tentativa oficial/representativa** (`representativeAttempt`, já resolvida em `GET /api/professor/events/[id]`) — nunca somados entre tentativas descartadas.

**Ausência de dado:** `focus_violation_count` é `integer not null default 0` desde a migration original (`migrations/001_simulado_attempts.sql`) — ausência/null significa realmente zero, nunca "desconhecido". `owl_help_used_count` já era tratado como `Number(attempt.owl_help_used_count || 0)` pelo próprio endpoint de ajuda da coruja — mesmo padrão reaproveitado aqui.

**Pendência identificada — fora do escopo:** `simulado_attempts.owl_help_used_count` e `simulado_attempts.owl_help_data` são usados extensivamente pelo sistema (endpoint de ajuda da coruja, resultado do aluno, editor de simulados) mas **não existe nenhuma migration no repositório que crie essas colunas** — só `simulados.owl_help_limit` (`20260718120000_add_simulados_owl_help_limit.sql`) tem migration própria. As colunas claramente já existem em produção (feature funcionando e documentada), então isso não bloqueou esta Sprint (dado não está "faltando", só o registro em `supabase/migrations/` está incompleto). Nenhuma migration foi criada para isso agora — criar uma migration para uma coluna que já existe no banco causaria erro/confusão; registrado aqui para decisão futura.

### Novos dados na tela do Ranking

Colunas: **Posição, Aluno, Tempo, Advert., Coruja, Pontos, Situação, Detalhes** — Situação (o status que já existia) foi preservada integralmente, sem nova regra/recálculo. "Nota" foi renomeada para "Pontos" (mesmo `display_score`, sem mudança de dado). Tempo usa `formatTimeMs()` (helper já existente da tela, formato HH:MM:SS). Advert./Coruja usam os contadores oficiais direto do payload já carregado (zero N+1 — `owl_help_used_count`/`focus_violation_count` passaram a ser selecionados na MESMA query de `simulado_attempts` que já existia em `GET /api/professor/events/[id]`, sem nenhuma chamada Supabase nova). Cabeçalhos abreviados ("Advert.", "Coruja") carregam `title` explicando o significado. Tabela ganhou `min-w-[1080px]` (era 760px) para acomodar as novas colunas com conforto — mesmo padrão de scroll horizontal (`overflow-x-auto`) já existente.

### Modal "Ver" (`ParticipantMetricCard`)

Todo o conteúdo anterior preservado (Posição, Nota, Acertos, Erros, Brancos, Tempo total, Tentativa oficial, Situação). Adicionadas duas métricas novas: "Ajudas da coruja" e "Advertências por troca de tela", usando exatamente `participant.result.owl_help_used_count`/`focus_violation_count` — os mesmos valores já carregados para a linha da tabela, sem nenhuma consulta adicional (sem N+1 no clique de "Ver").

### Normalização e abreviação de nomes

Novo helper compartilhado `lib/formatRankingName.ts` (`formatRankingName(fullName)`), importado tanto pela tela (`page-client.tsx`) quanto pelo PDF (`event-ranking-pdf.ts`) — nenhuma lógica de nome duplicada. Regra: os dois primeiros componentes do nome aparecem por completo; a partir do próximo componente que não seja uma partícula comum (`da`, `de`, `do`, `das`, `dos`, `e`), mostra-se só a inicial + "."; partículas nessa faixa ficam em minúsculas, coladas ao componente seguinte — nunca viram a própria abreviação (evita algo sem sentido como "de Souza" virar "D."). Não altera nenhum dado persistido (`students.name` etc.), só apresentação. Exemplos conferidos por teste real:
- `"MARIA EDUARDA SILVA"` → `"Maria Eduarda S."`
- `"joÃO peDRO silVA"` → `"João Pedro S."`
- `"ana clara ferreira santos"` → `"Ana Clara F."`
- `"João da Silva Pereira"` → `"João da S."`
- `"Maria"` (1 componente) → `"Maria"`
- `"Maria Silva"` (2 componentes) → `"Maria Silva"`

Acentos preservados; espaços duplicados/trim tolerados.

### PDF do Ranking — novas colunas, sem Status

Colunas: **Pos., Nome, Tempo, Advert., Coruja, Pontos** — sem Status (só faz sentido no painel operacional da tela). "Acertos" foi substituído por "Pontos" (usa `display_score ?? correct_count`, nunca `correct_count` puro se o score oficial for diferente). Nome usa o mesmo `formatRankingName()` da tela. Larguras de coluna ajustadas para caber com conforto (Nome com mais espaço; colunas numéricas compactas). Preservado sem alteração: capa oficial (página 1, mesmo mecanismo/carregamento robusto da seção 101), ausência de marca d'água (seção 101), cabeçalho sem duplicação de nome (seção 102), rodapé institucional, cabeçalho de tabela fixo repetindo por página, `wrap:false` por linha, paginação.

### Testes

`tests/event-ranking-pdf/event-ranking-pdf.spec.ts` ganhou blocos inteiros novos, todos por execução real (não só leitura de código): regra de classificação (casos A-E do pedido + 2 testes de prioridade entre critérios provando coruja > advertências > tempo, + teste de score oficial vs. correct_count, + compatibilidade com fixtures antigas, + normalização de ausência de dado para 0), `formatRankingName` (1/2/3/5+ componentes, caixa alta/baixa/mista, acentos, partícula, espaços duplicados, string vazia), paridade PDF usando o mesmo helper de nome da tela, novas colunas da tela (estrutural), novas métricas do modal (estrutural + confirmação de zero N+1), e confirmação de que `owl_help_used_count`/`focus_violation_count` entraram na MESMA query já existente de `simulado_attempts` em `GET /api/professor/events/[id]` (contagem de `.from()` inalterada: 9). Total: 82 casos no arquivo, todos passando. Regressão completa (`event-ranking-pdf`, `professor-exam-pdf`, `event-professor-assignment`, `professor-management`, `simulado-question-annulment`, `simulado-scoring`): 184/184. `npx tsc --noEmit`, `npm run build` e lint dos arquivos tocados/novos limpos.

Nenhuma migration criada. Nenhum commit/push/deploy nesta etapa.

# 104. "Ajudas utilizadas" (renomeação) + "Tópicos de maior dificuldade" no modal "Ver" (2026-09-09)

Ajuste cirúrgico pré-commit. Regra de classificação (seção 103) preservada sem alteração — só ajustes de apresentação e reaproveitamento de dado já existente.

### 1. Tela do Ranking — "Coruja" → "Ajudas utilizadas"

Cabeçalho da coluna renomeado de "Coruja" para "Ajudas utilizadas" (`app/professor/eventos/[id]/page-client.tsx`), com quebra controlada em duas linhas (`<span className="block max-w-[72px] leading-[13px]">`) para caber com conforto sem esmagar Nome/Situação/Detalhes — nenhuma outra coluna teve largura reduzida. Tooltip atualizado para "Quantidade de ajudas da coruja utilizadas durante a tentativa". O valor exibido continua vindo do mesmo `item.result.owl_help_used_count` de sempre — nenhuma mudança de dado ou de regra.

No modal "Ver", o card antes rotulado "Ajudas da coruja" passou a "Ajudas utilizadas", pela mesma preferência de nomenclatura.

**PDF do Ranking:** decisão explícita — a coluna "Coruja" foi renomeada para "Ajudas" (`app/lib/pdf/event-ranking-pdf.ts`). Justificativa: "Coruja" e "Ajudas" têm exatamente 6 caracteres cada, então a troca não altera a largura necessária da coluna nem compromete o layout — mudança seguramente compatível, coerente com a nomenclatura agora usada na tela.

### 2. Modal "Ver" — novo card "Tópicos de maior dificuldade"

Novo card ao final da grade de métricas do modal (depois de Situação, a última já existente), ocupando duas colunas no desktop (`sm:col-span-2` — no 4-colunas `lg:grid-cols-4`, ocupa a largura de dois cards; no `sm:grid-cols-2`, ocupa a linha inteira; no mobile 1-coluna, ocupa naturalmente 1 coluna). Todo o conteúdo anterior do modal foi preservado sem nenhuma alteração.

**Fonte dos dados — reaproveitada, não reinventada.** A mesma análise já usada em "Tópicos para revisar" na tela de resultados do aluno (`app/meus-simulados/[id]/resultado/page-client.tsx`, `buildSubjectTopicPerformance`) foi extraída (lógica idêntica, não reescrita) para um módulo compartilhado novo, `lib/topicDifficulty.ts`: `normalizeTextKey`, `canonicalizeTopicLabel`, `addTopicRollup` (movidos verbatim) e uma nova função `buildDifficultyTopics` (lista achatada, sem agrupar por assunto — a mesma regra de "tópicos para revisar": incidência de erro `wrong>0 || blank>0`, ordenada por incidência decrescente e depois por rótulo). A tela de resultados do aluno agora importa essas três funções do módulo compartilhado em vez de defini-las localmente — mesmo comportamento, sem duplicar.

**Regra preservada exatamente:**
- Questão anulada (`simulado_questions.status === "annulled"`) nunca conta como erro — filtrada antes de entrar na análise, igual à tela de resultados.
- Status por questão: em branco (sem `selected_alternative_id`) / correta (`is_correct === true`) / errada — mesma lógica.
- Tópico ausente cai no mesmo fallback `"Tópico não informado"` já usado na tela de resultados.
- Canonicalização/deduplicação de variações do mesmo tópico (ex.: "TCP/IP" e "tcp ip") é a mesma função, sem reinterpretação.

**De onde vêm os dados no dashboard do Professor:** `GET /api/professor/events/[id]/route.ts` ganhou `evaluated_topics` no `.select()` já existente de `simulado_questions` (nenhuma consulta nova) e monta, por participante, `result.difficulty_topics: string[]` reaproveitando o mesmo array `answers` (respostas da tentativa oficial/representativa) já buscado para os cálculos existentes — zero N+1, nenhuma consulta por tópico/questão/participante. O cálculo roda uma vez por participante, em memória, sobre dados já carregados.

**Layout do card:** cabeçalho com ícone (`AlertTriangle`, vermelho — mesma linguagem visual de "erro/atenção" já usada no card de Advertências e nos chips vermelhos de "tópicos para revisar" da tela de resultados) + título "Tópicos de maior dificuldade"; conteúdo em chips arredondados (mesmo padrão visual de `TopicChip` da tela de resultados: pílula vermelha discreta), com `flex-wrap` e altura máxima com scroll interno (`max-h-[168px] overflow-y-auto`) para não deixar o modal gigantesco quando há muitos tópicos — sem esconder nenhum dado, só rolagem. Estado vazio: "Nenhum tópico de maior dificuldade identificado." (texto elegante, nunca um card quebrado).

### Testes

`tests/event-ranking-pdf/event-ranking-pdf.spec.ts` ganhou blocos novos: renomeação "Coruja"→"Ajudas utilizadas" na tela e "Coruja"→"Ajudas" no PDF (com verificação de que a largura não precisou mudar); presença/posição/responsividade do novo card no modal; estado vazio; ausência de N+1; execução real de `buildDifficultyTopics` (ordenação por incidência, exclusão de anuladas pelo chamador, fallback de tópico ausente, deduplicação de variações, caso de paridade do pedido A/B/B/C → B,A,C); confirmação de que a tela de resultados do aluno agora importa do módulo compartilhado em vez de duplicar; confirmação de que `evaluated_topics` entrou no select já existente sem query nova. Total: 99 casos no arquivo, todos passando. Regressão completa (`event-ranking-pdf`, `professor-exam-pdf`, `event-professor-assignment`, `professor-management`, `simulado-question-annulment`, `simulado-scoring`): 201/201. `npx tsc --noEmit` e `npm run build` limpos; lint sem nenhum problema novo (13 avisos pré-existentes em `resultado/page-client.tsx`, confirmados idênticos antes/depois da extração).

**Arquivo protegido/compartilhado tocado, justificado:** `app/meus-simulados/[id]/resultado/page-client.tsx` (fluxo de resultado do aluno) foi modificado — não para mudar comportamento, mas para importar de `lib/topicDifficulty.ts` em vez de definir localmente `normalizeTextKey`/`canonicalizeTopicLabel`/`addTopicRollup`. Necessário porque a própria tarefa exige reaproveitar "exatamente a mesma lógica" da tela de resultados sem duplicar — a extração é a forma correta de atender isso. Comportamento do aluno inalterado (mesma função, só movida); regressão de `simulado-question-annulment`/`simulado-scoring` confirmada verde.

Nenhuma migration criada. Nenhum commit/push/deploy nesta etapa.

# 105. Nova guia "Insights" no painel do Professor — análise pedagógica dos tópicos de maior dificuldade (2026-09-09)

Sprint cirúrgica: adiciona uma 4ª guia ("Insights") à dashboard do Evento do Professor, com uma análise pedagógica coletiva — "em quais tópicos os participantes tiveram, como grupo, maior dificuldade neste Simulado" — estatisticamente mais justa do que simplesmente somar erros brutos por tópico. Nenhuma mudança em scoring (`lib/simuladoScoring.ts`), notas, resultados oficiais, TopCoins, na regra de classificação do Ranking (`lib/eventRanking.ts`, seção 103) nem nas 3 guias já existentes (Visão geral, Participantes, Questões/revisão). Distinta do card "Tópicos de maior dificuldade" adicionado ao modal "Ver" na seção 104: aquele é por participante (um aluno específico); este é coletivo (todos os participantes de uma vez).

### Por que não "erros brutos por tópico"

Contar direto `erros/tópico` favorece tópicos com poucas questões e pune tópicos com muitas questões só por terem mais oportunidades de acumular erro. A guia usa em vez disso uma dificuldade **por questão**, depois agregada **sem peso por volume de respostas**, e por fim **suavizada estatisticamente** para não dar falsa confiança a amostras pequenas.

### Fórmulas (implementadas em `lib/eventInsights.ts`, funções puras, sem acesso a banco)

1. **Dificuldade por questão** — `D_q = wrong / (correct + wrong)`. Branco não entra no denominador (não é "erro"); questão anulada (`simulado_questions.status === "annulled"`, status contextual do Simulado — nunca `questions.status`) é excluída inteiramente de toda a análise, em qualquer bloco.
2. **Dificuldade bruta do tópico** — `D_t = média(D_q)` das questões válidas do tópico, com **peso igual por questão** (nunca ponderado pela quantidade de respostas — 5 questões não pesam mais que 1 só por somarem mais oportunidades de erro).
3. **Dificuldade global do Simulado** — `D_global = média(D_q)` de todas as questões válidas, com o mesmo peso igual por questão (nunca `total de erros / total de respostas`, que daria peso desproporcional a questões mais respondidas).
4. **Dificuldade ajustada (suavização estatística)** — `D_adjusted = (n·D_t + k·D_global) / (n+k)`, com **k=2** (constante oficial desta Sprint). É a métrica usada para **ordenar** o ranking de tópicos; `D_t` bruto permanece **sempre visível ao lado**, nunca escondido — transparência exigida pelo pedido.

Exemplo conferido por teste real (o mesmo da especificação): `D_global=40%`, `k=2` → tópico A (n=1, D_t=70%) → `D_adjusted=50%`; tópico B (n=5, D_t=55%) → `D_adjusted≈50,71%` — mesmo com D_t bruto menor, B fica ligeiramente à frente por ter mais evidência (n maior), exatamente o comportamento esperado da suavização.

**Múltiplos tópicos por questão:** a questão contribui com seu `D_q` **integral** (não dividido, nunca "60%/3 tópicos") para cada tópico associado — dividir não faz sentido pedagógico (uma questão difícil sobre "Redes" e "Segurança" ao mesmo tempo é igualmente difícil nos dois, não parcialmente em cada um).

**Confiança** (rótulo, nunca "certeza"): `n=1` → "Evidência inicial"; `n=2–3` → "Confiança moderada"; `n≥4` → "Confiança alta".

**Faixas de dificuldade** (aplicadas sobre `D_adjusted`, não sobre `D_t` — decisão explícita do pedido): `<30%` Bom domínio (verde); `30–44%` Atenção (amarelo); `45–59%` Dificuldade relevante (laranja); `≥60%` Dificuldade crítica (vermelho).

**Desempate** (não especificado explicitamente no pedido, definido e documentado nesta Sprint): para `D_adjusted` igual, ordena por (1) maior `n` (mais evidência primeiro), (2) maior `D_t` bruto, (3) nome do tópico em ordem alfabética (pt-BR) — cadeia determinística, sem aleatoriedade.

**Tópico ausente:** questão sem `evaluated_topics` cai no fallback `"Tópico não informado"` (mesmo padrão já usado no card da seção 104 e na tela de resultados do aluno).

### Reaproveitamento — nenhuma lógica duplicada

`lib/eventInsights.ts` importa `canonicalizeTopicLabel` de `lib/topicDifficulty.ts` (o mesmo módulo compartilhado criado na seção 104) para normalizar/deduplicar variações de rótulo do mesmo tópico (ex.: "TCP/IP" e "tcp ip") — nenhuma função de canonicalização foi reescrita.

### Origem dos dados — zero N+1

`GET /api/professor/events/[id]/route.ts` monta o insumo do cálculo (`QuestionDifficultyInput[]`) **mapeando o `questionStats` já calculado** para a guia Questões/revisão (correct/wrong/blank/status/`evaluated_topics`/código, todos já carregados por queries pré-existentes) — **nenhuma consulta Supabase nova** foi criada. Contagem de `.from(` na rota confirmada inalterada em 9 antes/depois. O cálculo inteiro roda em memória, uma única vez por requisição, sobre dados já em mãos.

Acesso do Professor à guia **não depende de `result_released_at`** — mesma regra de acesso operacional já vigente para as demais guias (Professor já enxerga dados mesmo antes da liberação de resultado ao aluno). Funciona igualmente para Evento `encerrado`/`arquivado` (usa a mesma base de tentativa oficial/representativa já consolidada pelo endpoint, nunca tentativas em andamento/descartadas/duplicadas).

### UI — 5 blocos, na ordem exigida

1. **Panorama pedagógico do simulado** — texto explicativo curto + 3 métricas (`Dificuldade global`, `Questões analisadas`, `Tópicos avaliados`) usando o componente já existente `CompactMetric`.
2. **Tópicos de maior dificuldade** — lista ordenada por `D_adjusted` (posição, nome, `D_t`, `D_adjusted`, quantidade de questões, respostas analisadas, confiança). Tooltip em "Dificuldade ajustada" com o texto sugerido pelo pedido: *"Índice que considera a taxa de erro e a quantidade de questões que avaliaram o tópico, reduzindo distorções de amostras pequenas."* A fórmula não é exposta na tela principal, só no tooltip.
3. **Questões mais difíceis** — `D_q` decrescente, excluindo anuladas, mostrando código/`%erro`/`%branco`/tópicos associados (limitado às 10 primeiras na tela, dado completo disponível em `insights.hardestQuestions`).
4. **Mapa de domínio** — 4 colunas (Bom domínio / Atenção / Dificuldade relevante / Dificuldade crítica), cada uma com contagem de tópicos e até 6 chips de exemplo.
5. **O que merece revisão em aula** — resumo textual **determinístico**, gerado por `buildTeachingReviewSummary()` a partir só dos 3 tópicos de maior `D_adjusted` fora de "Bom domínio" e da confiança do 1º colocado — **sem nenhuma chamada de IA/OpenAI/API externa**, exatamente como exigido.

Nenhuma casa decimal falsa: toda porcentagem passa pelo helper já existente `formatPercent()` (0–1 casa decimal, vírgula pt-BR) — reaproveitado, não reimplementado.

**Estados vazios:** `insights.validQuestionCount === 0` mostra "Este simulado não possui tópicos suficientes para esta análise." (quando não há nenhuma questão no Simulado) ou "Ainda não há respostas suficientes para gerar Insights." (quando há questões mas nenhuma com resposta graduada) — textos sugeridos pelo pedido, usados literalmente. Lista de tópicos vazia e lista de questões mais difíceis vazia têm mensagens próprias e elegantes, nunca uma tela quebrada.

### Limitação documentada (associação, não causalidade)

Para questões multi-tópico, um `D_q` alto indica que a questão foi difícil, mas **não prova isoladamente qual dos tópicos associados foi o responsável** — é uma associação estatística, não uma relação causal comprovada. Isso é inerente ao desenho (a questão contribui integralmente para todos os tópicos que avalia) e é uma limitação conhecida, não um bug.

### Funcionalidade explicitamente NÃO implementada nesta Sprint (relatado, não esquecido)

O alerta automático de taxa de branco alta (pedido, seção 22) **não foi implementado** — o próprio pedido autorizava essa omissão explicitamente ("Se não houver justificativa suficiente [para um threshold]: não criar alerta automático nesta Sprint. Relatar.") e não havia, nesta sessão, nenhuma base de dados real para justificar um limiar (ex.: 20%) como estatisticamente significativo. `blankRate` já é calculado e armazenado em `TopicInsight`/`QuestionInsight` (disponível para uso futuro), só o alerta visual automático ficou de fora.

### Arquivos criados/modificados

- **Novo:** `lib/eventInsights.ts` — funções puras (`calculateQuestionDifficulty`, `calculateTopicDifficulty`, `calculateGlobalDifficulty`, `calculateAdjustedTopicDifficulty`, `classifyTopicConfidence`, `classifyTopicDifficultyBand`, `buildTeachingReviewSummary`, `buildEventInsights`) e tipos (`QuestionDifficultyInput`, `QuestionInsight`, `TopicInsight`, `TopicConfidence`, `TopicDifficultyBand`, `EventInsightsSummary`). Escala interna sempre fração 0..1 (nunca 0..100); conversão para percentual só na UI.
- **Novo:** `tests/event-insights/event-insights.spec.ts` — 54 casos, execução real (não estrutural), cobrindo as 14 categorias exigidas pelo pedido, os 3 cenários obrigatórios com valores calculados à mão, e a fixture obrigatória de 4 questões/3 tópicos com `D_q`/`D_t`/`D_global`/`D_adjusted`/ordem final conferidos por asserção.
- **Modificado:** `app/api/professor/events/[id]/route.ts` — monta `insightsInput` a partir de `questionStats` já existente, chama `buildEventInsights()`, inclui `insights` na resposta JSON. Nenhuma query nova.
- **Modificado:** `app/professor/eventos/[id]/page-client.tsx` — nova 4ª aba ("Insights"), tipo `Tab`/`Dashboard` estendidos, 2 componentes novos (`InsightsTopicRow`, `InsightsQuestionRow`), 2 mapas de constantes (`TOPIC_BAND_META`, `TOPIC_CONFIDENCE_LABEL`). As 3 guias existentes (Visão geral, Participantes, Questões/revisão) não foram redesenhadas — grade de navegação só passou de 3 para 4 colunas (`sm:grid-cols-2 lg:grid-cols-4`).

### Testes e regressão

`tests/event-insights/event-insights.spec.ts`: 54/54. Regressão completa (`event-ranking-pdf`, `professor-exam-pdf`, `event-professor-assignment`, `professor-management`, `simulado-question-annulment`, `simulado-scoring`, `event-insights`): **255/255**. Adicionalmente confirmados intactos (mencionados na lista de regressão do pedido, não estavam no lote anterior): `event-operations` (25/25) e `event-representative-attempt` (10/10) — **35/35**. `npx tsc --noEmit` limpo. `npm run build` limpo (rota `/simulados/[id]/print` e demais listadas, `BUILD_OK`). Lint dos 4 arquivos tocados/criados: 0 avisos, 0 erros.

Nenhuma migration criada — Insights não introduz nenhuma tabela/coluna nova, é 100% derivado em memória de dados já persistidos. Nenhum commit/push/deploy nesta etapa.

# 106. Refinamento de UX da guia "Insights" — classificação simplificada, remoção do Mapa de domínio, consulta de questão em modal (2026-09-10)

Sprint cirúrgica de refinamento sobre a guia "Insights" entregue na seção 105 — só apresentação/clareza/usabilidade. A base matemática (D_q, D_t, D_global, `D_adjusted = (n·D_t + k·D_global)/(n+k)`, k=2, exclusão de anuladas, branco fora do denominador, contribuição integral de questão multi-tópico, independência de `result_released_at`) **não mudou em nada** — só a forma como o professor vê o resultado. Nenhuma mudança em `lib/simuladoScoring.ts`, `lib/eventRanking.ts`, resultados oficiais, TopCoins, PDFs ou nas outras 3 guias (Visão geral, Participantes, Questões/revisão).

### 1. Bloco "Tópicos de maior dificuldade" — só a dificuldade ajustada

A interface deixou de mostrar, nessa lista: a dificuldade "observada" (bruta) ao lado da ajustada, e os rótulos de confiança da amostra ("Evidência inicial" / "Confiança moderada" / "Confiança alta"). Esses dois conceitos continuam calculados normalmente em `lib/eventInsights.ts` (`TopicInsight.observedDifficulty` e `TopicInsight.confidence` seguem preenchidos — usados internamente por `buildTeachingReviewSummary()`), só deixaram de aparecer nesta lista por decisão de clareza: o professor via duas dificuldades lado a lado ("X% observada · Y% ajustada") e um selo técnico de confiança, exigindo interpretação estatística desnecessária. Agora cada linha mostra só: posição, nome do tópico, subtítulo claro ("1 questão relacionada" / "2 questões relacionadas", mais "· N respostas válidas consideradas" quando houver dado), o selo de nível e "X% de dificuldade ajustada".

**Classificação visual — nova nomenclatura e novos limiares, centralizados em `classifyTopicDifficultyBand()` (`lib/eventInsights.ts`, única fonte, não reimplementados na tela):**

| Faixa (sobre D_adjusted) | Nível exibido | Cor |
|---|---|---|
| ≥ 75% | Extrema | vermelho forte |
| 50% – 74% | Alta | laranja |
| 25% – 49% | Média | âmbar |
| < 25% | Baixa | verde |

Substitui a nomenclatura anterior (Bom domínio/Atenção/Dificuldade relevante/Dificuldade crítica, limiares 30/45/60%) — os novos limiares (25/50/75%) foram escolhidos por serem redondos, fáceis de explicar e de memorizar para o professor, mantendo o mesmo espírito de 4 faixas. `TopicDifficultyBand` mudou de `"mastery"|"attention"|"relevant"|"critical"` para `"low"|"medium"|"high"|"extreme"`; `TOPIC_BAND_META` (painel) só mapeia rótulo/cor, sem reimplementar o cálculo do limiar.

### 2. Bloco "Questões mais difíceis" — só erro, clicável, com modal de consulta

**Removido:** a estatística de branco (`blankRate`) deixou de aparecer nesta lista (continua calculada e disponível em `QuestionInsight.blankRate`, só não exibida aqui). Cada linha mostra agora: código da questão, um título curto (texto puro do enunciado, primeiros ~110 caracteres, via `richTextToPlainText()` de `lib/utils/rich-text.ts` — helper já existente, reaproveitado, não duplicado) e o percentual de erro ("X% de erro").

**Novo — abrir a questão em modal:** cada linha é clicável (código/título e um botão explícito "Ver questão") e abre `QuestionPreviewModal`, um modal de consulta somente-leitura que reaproveita **o mesmo componente já usado na aba Questões/revisão desta mesma tela**, `QuestionDisplayCard` (`app/components/questions/QuestionDisplayCard.tsx`) — nenhum novo renderer de questão foi criado. O modal é chamado com `showCorrect` mas sem `onSelect`/`onToggleEliminate` — sem nenhuma interação de resposta ou edição possível, puramente consulta.

**Zero fetch novo, zero N+1:** o modal reaproveita `data.questions` — o mesmo array já carregado por `GET /api/professor/events/[id]` para a aba Questões/revisão (mesma resposta que já inclui `statement`/`question_alternatives`/gabarito para o Professor). Um índice em memória (`classroomQuestionsById`, `useMemo` sobre `data.questions`) mapeia `simulado_question_id → questão completa`, montado uma única vez por atualização dos dados — nenhuma requisição de rede adicional ao abrir o modal. Nenhuma rota nova, nenhuma mudança de permissão: o Professor já recebia esse mesmo conteúdo (incluindo gabarito) no payload da aba Questões/revisão; o modal só apresenta um subconjunto dele já em memória.

### 3. Bloco "Mapa de domínio" — removido integralmente

O bloco (4 colunas agrupando tópicos por faixa, com contadores e chips) foi removido por decisão do usuário após avaliação de clareza — não comunicava valor real além do que a lista "Tópicos de maior dificuldade" já mostra. Removidos: o título "Mapa de domínio", o grid de 4 colunas, os contadores por faixa e os chips de exemplo. `TOPIC_BAND_META` foi preservado (ainda alimenta o selo de nível na lista de tópicos, seção 1 acima) — só o agrupamento visual em painéis por faixa foi eliminado.

### 4. Bloco "O que merece revisão em aula" — preservado

Nenhuma mudança de código necessária: `buildTeachingReviewSummary()` já não citava rótulos de faixa no texto gerado (só filtra internamente por `band !== "low"`, ajustado nesta Sprint a partir de `!== "mastery"` para acompanhar a renomeação dos valores do enum). O texto exibido ao professor continua em linguagem natural, sem jargão técnico.

### Arquivos modificados

- `lib/eventInsights.ts` — `TopicDifficultyBand` renomeado (`"low"|"medium"|"high"|"extreme"`); `classifyTopicDifficultyBand()` com os novos limiares (25/50/75%), documentados no próprio comentário da função; `buildTeachingReviewSummary()` ajustado para o novo valor mínimo (`"low"` em vez de `"mastery"`); comentário de cabeçalho do arquivo atualizado para não afirmar mais que a dificuldade observada "continua sempre visível" na UI (ela permanece calculada, só não é mais exibida).
- `app/professor/eventos/[id]/page-client.tsx` — `TOPIC_BAND_META` com os 4 novos rótulos/cores; `TOPIC_CONFIDENCE_LABEL` removido (não usado mais); bloco "Mapa de domínio" removido da guia Insights; `InsightsTopicRow` reescrito (sem "observada"/confiança, novo subtítulo, texto único "X% de dificuldade ajustada"); `InsightsQuestionRow` reescrito (sem branco, título curto via `richTextToPlainText`, clicável, botão "Ver questão"); novo componente `QuestionPreviewModal` (reaproveita `QuestionDisplayCard`); novo estado `previewQuestionRelationId` e índice em memória `classroomQuestionsById`; import de `richTextToPlainText` (`@/lib/utils/rich-text`).
- `tests/event-insights/event-insights.spec.ts` — testes existentes de faixa (seção 9) atualizados para os novos limiares/nomes; teste de estado vazio ajustado (`band === "low"`); 4 novos `test.describe` cobrindo especificamente o refinamento: bloco Tópicos (ausência de "observada"/confiança, nomenclatura Extrema/Alta/Média/Baixa, limiares centralizados, singular/plural do subtítulo), bloco Questões mais difíceis (ausência de branco, reaproveitamento de `richTextToPlainText`, clicabilidade, integração do `QuestionPreviewModal` com `QuestionDisplayCard`, ausência de `onSelect`/edição no modal, zero fetch novo), remoção do Mapa de domínio (ausência total, só os 4 blocos esperados restantes) e regressão (matemática k=2 continua correta na mesma fixture da seção 46, `lib/eventRanking.ts` intocado, `lib/simuladoScoring.ts` não referenciado, dado de resultado oficial do participante não é lido pelos componentes novos).

### Testes e regressão

`tests/event-insights/event-insights.spec.ts`: **74/74** (54 pré-existentes, ajustados onde a nomenclatura mudou, + 20 novos deste refinamento). Regressão completa (`event-ranking-pdf`, `professor-exam-pdf`, `event-professor-assignment`, `professor-management`, `simulado-question-annulment`, `simulado-scoring`, `event-insights`, `event-operations`, `event-representative-attempt`): **310/310**. `npx tsc --noEmit` limpo. `npm run build` limpo. Lint dos arquivos tocados (`page-client.tsx`, `lib/eventInsights.ts`, `tests/event-insights/event-insights.spec.ts`): 0 avisos, 0 erros.

**Limitação:** nenhuma — o refinamento é estritamente de apresentação; nenhum dado deixou de ser calculado (dificuldade observada e confiança continuam no modelo de dados, só não exibidos nesta guia), e a permissão de leitura da questão no modal é idêntica à que o Professor já tinha na aba Questões/revisão (mesmo payload, sem escalonamento de acesso).

Nenhuma migration criada. Nenhum commit/push/deploy nesta etapa.

# 107. Correção da coleta de dados dos Insights — paginação completa, revalidação de status e polling seguro (2026-09-10)

Sprint cirúrgica motivada por uma auditoria somente-leitura anterior ("Insights mudando sem novas respostas"), que comprovou duas causas reais na camada de coleta de dados de `GET /api/professor/events/[id]` — **nunca na matemática dos Insights** (`lib/eventInsights.ts`, inalterada: `D_q`, `D_t`, `D_global`, `D_adjusted = (n·D_t + k·D_global)/(n+k)` com k=2, faixas Extrema/Alta/Média/Baixa, desempate, UI da seção 106 — tudo preservado byte a byte).

### Achado 1 corrigido — truncamento silencioso de `simulado_answers`/`simulado_results`

As duas consultas dessa rota buscavam `simulado_answers`/`simulado_results` com `.in("attempt_id", representativeAttemptIds)`, **sem `.range()` e sem `.order()`**. Auditoria real, no Evento "3º Simulado de Processo Civil" (mesmo Evento do incidente `ET3582`, seção 103+), comprovou: **1587 respostas reais, apenas 1000 retornadas** — 587 (37%) omitidas silenciosamente, sem erro. Mesma classe de bug já corrigida em `lib/server/simuladoQuestionReprocessing.ts` (seção do "Incidente de truncamento silencioso", `docs/Sprint-resultados.md`), nunca antes aplicada a esta rota.

**Correção:** as duas consultas agora usam `fetchAllPages()` — `.order("id", { ascending: true }).range(from, to)` por página de 1000, com `count: "exact"` conferido contra o total acumulado ao final; se algo divergir (nunca deveria), lança erro em vez de seguir com dado incompleto, e a rota devolve `{ ok: false, message: "Não foi possível carregar as estatísticas do Evento." }` (500) em vez de servir números parciais silenciosamente. **Sem `.limit()` mágico** — escala para qualquer volume futuro, não só o caso atual.

**Extração, sem duplicar:** `fetchAllPages()` já existia, privada, dentro de `lib/server/simuladoQuestionReprocessing.ts`. Foi extraída verbatim para um novo módulo compartilhado `lib/server/supabasePagination.ts` (exportada, mensagem de erro parametrizável), e `simuladoQuestionReprocessing.ts` passou a importar de lá em vez de definir localmente — mesma implementação, uma única fonte, agora reaproveitada também por `app/api/professor/events/[id]/route.ts`.

### Achado 2 corrigido — defesa em profundidade contra `representative_attempt_id` inválido

`consolidateEventRepresentativeAttempt()` (`lib/server/simuladoEvents.ts`) só grava `representative_attempt_id` para tentativas `completed + counts_toward_limit` — único ponto de escrita não-nula em todo o repositório (confirmado por varredura). Ainda assim, a auditoria encontrou **12 de 139 `representative_attempt_id` apontando para tentativas não-completed** no ambiente de homologação (3 `in_progress`, 9 `disqualified`) — dado histórico/legado, não produzido por nenhum código do repositório, mas que a rota **consumia sem revalidar**: as respostas dessas 12 tentativas entravam em `questionStats`/Insights junto com as legítimas.

**Correção:** a rota agora **revalida o status na própria leitura**, sem confiar cegamente no campo. Novo conjunto `completedRepresentativeAttemptIds` — estritamente `status === "completed"`, nunca `disqualified`/`expired`/`in_progress` — usado para filtrar `answers` (→ `completedAnswers`) antes de qualquer agregação para os Insights. Uma tentativa `in_progress`/`disqualified` incorretamente registrada como representativa (dado legado ou futuro) nunca mais contamina os números pedagógicos, mesmo sem corrigir o registro em si (fora do escopo desta etapa — ver "Não feito" abaixo).

O mesmo cuidado foi aplicado ao card individual "Tópicos de maior dificuldade" do modal "Ver" (seção 104): `difficulty_topics` só é calculado quando `representativeAttempt.status === "completed"` — antes bastava a tentativa existir como representativa.

### Duas bases claramente separadas — dados ao vivo vs. Insights consolidados

Esta é a decisão arquitetural central da correção: **`questionStats`** (aba Questões/revisão, Modo Aula) **não foi tocada** — continua usando `completedRepresentativeIds`, a base operacional já existente (`completed` + `disqualified` + `expired`, deliberadamente ampla para refletir a situação real da turma ao vivo). Já a guia **Insights** passou a usar **`completedQuestionStats`**, uma segunda agregação, calculada separadamente a partir de `completedAnswers`/`completedRepresentativeAttemptIds` (estritamente `completed`). As duas bases nunca se misturam; `questionStats` não perdeu nenhum comportamento, `insightsInput` deixou de ser derivado dele.

### Polling protegido contra resposta HTTP fora de ordem

`app/professor/eventos/[id]/page-client.tsx`: `load()` (disparado a cada 10s, frequência inalterada) passou a usar `AbortController` — mesmo padrão já usado em `app/questoes/importar/page-client.tsx` (`remoteSyncAbortRef`). Antes de cada nova requisição, aborta a anterior ainda em voo (`loadAbortRef.current?.abort()`); a resposta só é aplicada (`setData`/`setMessage`) se `loadAbortRef.current` ainda for o `controller` daquela chamada específica — uma resposta antiga que demore mais para chegar nunca sobrescreve um estado mais novo já aplicado. `AbortError` é capturado e silenciosamente ignorado (nunca vira mensagem de erro ao professor); o abort também acontece no cleanup do `useEffect` (desmontagem do componente). Nenhum segundo timer foi criado.

### Não feito nesta etapa (autorizado explicitamente pelo pedido)

Os 12 registros históricos de `representative_attempt_id` inconsistente **não foram corrigidos** — nenhum `UPDATE` em `simulado_event_participants` foi executado. A defesa em profundidade acima já impede que contaminem os Insights; a limpeza do dado em si (se necessária) é uma etapa controlada separada, futura.

### Testes

Suíte dedicada nova `tests/event-insights/data-collection-fix.spec.ts` (28 casos): execução real de `fetchAllPages()` (1587→1587, sem truncar; prova do corte antigo em 1000 para contraste; rede de segurança de completude); estrutural (paginação com `.order("id")`/`count: "exact"`, ausência de `.limit()` mágico); execução real do cenário exato da auditoria (127 completed + 3 in_progress + 9 disqualified → só 127 entram em `D_global`, prova numérica de que 39/139 nunca aparece, só 27/127); cenários isolados de `in_progress`/`disqualified`; estrutural de "tentativa extra" (impossível por construção — 1 `representative_attempt_id` por linha de participante); confirmação de que `questionStats` (Modo Aula) preserva a base operacional original, sem regressão; modal individual restrito a `completed`; polling (AbortController, resposta obsoleta descartada, abort silencioso, abort no unmount, frequência inalterada); estabilidade (100 execuções idênticas); proteção de matemática/UI/ranking/scoring/PDF (grep de ausência de `fetchAllPages`/mudança nesses arquivos); reaproveitamento único de `fetchAllPages`. **28/28 passando.**

Suíte `tests/event-insights/event-insights.spec.ts` original: 2 testes estruturais desatualizados pela mudança de arquitetura (`insightsInput` deixou de vir de `questionStats`) foram atualizados para refletir `completedQuestionStats` — **74/74 passando** (nenhum caso removido, só 2 ajustados).

`tests/simulado-question-annulment/large-answer-set.spec.ts` e `reconciliation-recovery.spec.ts`: a extração de `fetchAllPages()` exigiu adicionar o novo import `@/lib/server/supabasePagination` ao *allowlist* do shim de `require` usado para transpilar/executar `lib/server/simuladoQuestionReprocessing.ts` em sandbox — sem isso, o motor real deixava de carregar (`Unexpected import`). Ajuste puramente mecânico do harness de teste, nenhuma mudança de comportamento do motor. **54/54 passando** (regressão completa de `simulado-question-annulment`).

**Regressão completa:** `event-insights` (102 = 74 + 28 novos), `event-ranking-pdf`, `professor-exam-pdf`, `event-professor-assignment`, `professor-management`, `event-operations`, `event-representative-attempt`, `simulado-question-annulment`, `simulado-scoring` — **338/338 passando**. `npx tsc --noEmit` limpo. `npm run build` limpo. Lint de todos os arquivos tocados/criados: 0 avisos, 0 erros.

### Arquivos

- **Novo:** `lib/server/supabasePagination.ts` (`fetchAllPages()`, extraída de `simuladoQuestionReprocessing.ts`).
- **Novo:** `tests/event-insights/data-collection-fix.spec.ts` (28 casos).
- **Modificado:** `app/api/professor/events/[id]/route.ts` (paginação de `simulado_answers`/`simulado_results`; `completedRepresentativeAttemptIds`/`completedAnswers`/`completedQuestionStats` novos, separados de `questionStats`; `difficulty_topics` restrito a `completed`).
- **Modificado:** `app/professor/eventos/[id]/page-client.tsx` (`loadAbortRef`, `AbortController` em `load()`).
- **Modificado:** `lib/server/simuladoQuestionReprocessing.ts` (importa `fetchAllPages` do módulo compartilhado, definição local removida — comportamento idêntico).
- **Modificado (harness de teste, mecânico):** `tests/simulado-question-annulment/large-answer-set.spec.ts`, `tests/simulado-question-annulment/reconciliation-recovery.spec.ts` (novo import no *allowlist* do shim).
- **Modificado:** `tests/event-insights/event-insights.spec.ts` (2 testes estruturais atualizados para `completedQuestionStats`).

Nenhuma migration criada — nenhuma tabela/coluna nova, correção 100% na camada de leitura/agregação em memória e no cliente. Nenhum dado histórico alterado (os 12 registros inconsistentes permanecem como estavam — decisão explícita desta etapa). Nenhum commit/push/deploy.

# 108. Correção do card "Realizando" — não contar tentativas in_progress órfãs/inativas (2026-09-10)

Sprint cirúrgica sobre a métrica "Realizando" da Visão geral do Evento (painel do Professor), motivada por relato real: o card mostrava "Realizando: 3" com "Online agora: 0", quando efetivamente nenhum aluno estava fazendo a prova.

### Causa raiz

`summary.taking` (`GET /api/professor/events/[id]`) contava `representativeAttemptIds` (tentativas representativas de cada participante) com `status === "in_progress"`. Por invariante arquitetural (`consolidateEventRepresentativeAttempt`, `lib/server/simuladoEvents.ts`), `representative_attempt_id` só deveria apontar para tentativas `completed` — um `in_progress` ali é sempre dado histórico/legado inconsistente, exatamente a mesma classe de corrupção já encontrada e tratada na seção 107 (Insights): a auditoria daquela Sprint encontrou 3 tentativas `in_progress` (abandonadas desde 2026-09-05, sem submissão) indevidamente registradas como representativas de 3 participantes. É por isso que "Realizando" mostrava 3 — eram exatamente essas 3 tentativas órfãs, não alunos realmente em prova.

### Investigação — campo de atividade real

`simulado_attempts.last_activity_at` (coluna já existente desde a migration original, `not null default now()`) é a evidência real de interação, comprovadamente atualizada em: resposta salva (`POST .../attempts/[attemptId]/answers`), violação de foco/troca de aba (`POST .../attempts/[attemptId]`), e o evento comportamental de inatividade ≥60s (`PATCH .../attempts/[attemptId]/behavior`). **Não existe heartbeat periódico dedicado à tentativa** — o heartbeat de 30s (`POST /api/student/events/[id]/heartbeat`, chamado a cada 30s pela página do simulado) atualiza `user_sessions` (presença/"Online agora"), **nunca** `last_activity_at` de `simulado_attempts`. Os dois mecanismos são estruturalmente independentes, confirmando por código que "Online agora" e "Realizando" já eram (e continuam sendo) fontes de dados diferentes.

**Por que não reaproveitar os 60s de inatividade:** esse valor tem semântica de anti-cheat/comportamento ("aluno parado — sinal negativo de foco", métrica exibida no resultado do aluno como "Inatividade: N"), não de "sessão abandonada". Reutilizá-lo diretamente teria sido incorreto — a própria auditoria pedida analisou a distinção antes de decidir.

### Regra final de "tentativa ativa" (Realizando)

Conta como "Realizando" um participante que tenha uma tentativa com **status `in_progress` E `last_activity_at` dentro dos últimos 10 minutos**, deduplicado por aluno (`student_id`). Janela de 10 minutos justificada por: maior que qualquer intervalo típico entre respostas salvas (que atualizam `last_activity_at` a cada questão respondida) e bem acima do gatilho de inatividade comportamental de 60s, evitando falso-negativo por um intervalo normal de leitura/reflexão entre respostas — mas curta o suficiente para nunca contar tentativas de horas/dias atrás (o caso relatado). Documentada na própria constante `ACTIVE_ATTEMPT_WINDOW_MS`, sem número mágico solto.

**Fonte de dados:** `attempts` — o array já carregado pela mesma rota para outras finalidades (Modo Aula, situação dos participantes) — nunca `representativeAttemptIds` (que, por definição, só deveria conter `completed`). Zero consulta nova: `last_activity_at` foi adicionado ao `.select()` já existente de `simulado_attempts` (contagem de `.from(` confirmada inalterada em 9).

**Retomada:** não há nenhum bloqueio — assim que a tentativa recebe qualquer interação real de novo (ex.: a próxima resposta salva), `last_activity_at` é atualizado e o participante volta a contar em "Realizando" no próximo poll.

**Duplicidade:** impossível por construção — `student_id` é a chave do `Set`; o índice único parcial `unique_simulado_attempts_in_progress` (`simulado_id, student_id) where status='in_progress'`) já garante no banco que um aluno nunca tem duas tentativas `in_progress` simultâneas no mesmo Simulado.

**Evento encerrado:** nenhuma regra nova adicionada aqui — `closeSimuladoEvent()` não força-termina tentativas em andamento (comportamento pré-existente, preservado: "Tentativas em andamento foram preservadas"), então uma tentativa `in_progress` com atividade recente continua contando como "Realizando" mesmo com o Evento já encerrado, exatamente como o sistema já permitia o aluno terminar.

### Não alterado

Nenhum status foi escrito no banco por esta correção (nenhum `UPDATE` em `simulado_attempts`/`simulado_event_participants`) — é puramente uma correção de leitura/apresentação da métrica. `representative_attempt_id`, `lib/simuladoScoring.ts`, `lib/eventRanking.ts`, `lib/eventInsights.ts` (seção 107), PDFs, "Online agora" (`onlineStudentIds`/`onlineCutoff`, 90s, inalterado) e o polling protegido por `AbortController` (seção 107) permanecem exatamente como estavam.

### Achado relatado, não corrigido (fora do escopo desta etapa)

`questionStats` (aba Questões/revisão, Modo Aula) computa `correct`/`wrong`/`answered` a partir do array bruto `answers` — que inclui respostas de **qualquer** tentativa em `representativeAttemptIds`, sem filtrar por status. Isso significa que, se uma tentativa `in_progress`/`disqualified` corrompida (como as 3+9 encontradas na auditoria da seção 107) tiver respostas salvas, essas respostas contribuem para o numerador (acertos/erros) da aba Questões/revisão — mesmo não entrando no denominador de branco (`completedRepresentativeIds`, que já excluía `in_progress`). É a mesma classe de inconsistência já corrigida para os Insights (seção 107), agora identificada também aqui — mas **não corrigida nesta Sprint**, por estar fora do escopo explícito (o pedido pediu para relatar, não expandir silenciosamente). Registrado como pendência para decisão futura.

### Testes

Nova suíte `tests/event-operations/active-attempt-metric.spec.ts` (21 casos): cenário exato do pedido (A ativo entra, B parado não entra, C completed não entra, D disqualified não entra); Online ≠ Realizando (2 online + 3 ativas → 2/3 independentes; e o cenário relatado — 0 online + 3 stale → 0 realizando); tentativa órfã (dias atrás, e limite exato de 10min); retomada (stale → ativa de novo); duplicidade (mesmo aluno, duas linhas in_progress → conta 1); estrutural (nova expressão de `taking`, ausência de `representativeAttemptIds` na nova base, constante de janela nomeada, `last_activity_at` no select existente, `.from()` inalterado em 9, dedup por `student_id`, comentário distinguindo da regra de 60s); "Online agora" intocado; Insights/ranking/scoring/PDF/`questionStats`/`representative_attempt_id` intocados; polling com `AbortController` preservado; UI (rótulo "Realizando" preservado, tooltip opcional, `CompactMetric` retrocompatível). **21/21 passando.**

Regressão completa (`event-operations`, `event-acquisition-session`, `event-representative-attempt`, `event-insights`, `professor-management`, `event-ranking-pdf`, `professor-exam-pdf`, `event-professor-assignment`, `simulado-question-annulment`, `simulado-scoring`): **378/378 passando**. `npx tsc --noEmit` limpo. `npm run build` limpo. Lint dos arquivos tocados: 0 avisos, 0 erros.

### Arquivos

- **Novo:** `tests/event-operations/active-attempt-metric.spec.ts` (21 casos).
- **Modificado:** `app/api/professor/events/[id]/route.ts` (`last_activity_at` no tipo `AttemptRow` e no `.select()` de `simulado_attempts`; `ACTIVE_ATTEMPT_WINDOW_MS`/`activeAttemptCutoff`/`activeAttemptParticipantIds` novos; `summary.taking` recalculado).
- **Modificado:** `app/professor/eventos/[id]/page-client.tsx` (`CompactMetric` ganhou prop opcional `title` — retrocompatível, os demais ~7 usos não passam a prop; tooltip curto adicionado só ao card "Realizando").

Nenhuma migration criada — `last_activity_at` já existia desde a migration original (`migrations/001_simulado_attempts.sql`). Nenhum dado histórico corrigido (as 3 tentativas órfãs continuam `in_progress` no banco — fora do escopo desta etapa, por instrução explícita). Nenhum commit/push/deploy nesta etapa.

# 109. Pré-commit — população operacional de Questões/revisão (2026-09-09)

Esta seção substitui a pendência de `questionStats` registrada na seção 108 e a descrição anterior da base operacional. A implementação foi auditada exclusivamente na `main-worktree`, branch `main`.

`lib/eventQuestionStats.ts` centraliza `isActiveEventAttempt(attempt, now)` (mesma janela de dez minutos de Realizando, incluindo o fallback legado de `last_activity_at` para `started_at`) e `selectEventQuestionAttempts`. A rota passa um único instante para os dois consumidores. Online continua independente, por `user_sessions` e janela de 90 segundos.

A população é derivada das tentativas reais do Evento, já filtradas por `event_id` e `is_preview = false`, exigindo também correspondência de `event_participant_id` e `student_id`. Cada aluno contribui uma vez:

1. Prioridade para a representativa quando ela é uma conclusão válida (`completed` e `counts_toward_limit`).
2. Referência ausente/inválida: primeira conclusão válida por `submitted_at`, depois `attempt_number` e `id`. Datas de conclusão ausentes ficam por último. Isso é apenas fallback de leitura; não grava nem reconsolida representante.
3. Sem conclusão válida: tentativa `in_progress` com atividade recente, por menor `attempt_number`, depois `started_at` e `id`. Datas ausentes ficam por último. Uma tentativa extra ativa nunca substitui conclusão oficial.
4. `disqualified`, `expired`, `abandoned`, conclusões que não contam e tentativas antigas/inexistentes não entram. Referência legada não torna uma tentativa válida. Duplicidade histórica de participante é resolvida pela ordem estável de `id`, com deduplicação final por aluno.

**Decisão pedagógica conservadora:** os comentários anteriores incluíam desclassificados/expirados nos brancos, mas a documentação oficial (seções 86 e 96) e `consolidateEventRepresentativeAttempt` reservam a experiência representativa à conclusão válida. Não foi encontrada uma regra consistente que exigisse manter respostas de desclassificados/expirados na distribuição. Esses estados podem conservar respostas salvas, mas não equivalem a conclusão válida; ficam excluídos dos agregados, preservando sua exibição na lista de participantes. O fluxo de envio calcula e registra `completed`; não se presume que toda expiração seja uma conclusão corrigida.

Respostas são buscadas pela união dos IDs necessários ao fluxo representativo existente e ao operacional, na mesma consulta paginada. `questionStats` filtra essa coleção pelos IDs operacionais; brancos contam somente nas conclusões selecionadas. Uma questão ainda não respondida em tentativa ativa não vira branco concluído. Não há consulta por aluno ou questão, nem novo `.from()`.

Insights mantém intactos `completedRepresentativeAttemptIds`, `completedAnswers`, `completedQuestionStats` e `buildEventInsights`: apenas representantes `completed`, sem misturar a população ao vivo. Ranking, PDF, scoring, TopCoins, liberação, reconciliação e identidade de revisão não foram alterados por esta correção final.

Validação: nova suíte `tests/event-operations/question-stats.spec.ts` cobre os dez cenários solicitados, vínculos inválidos, retomada e execução do GET real com Supabase simulado. A regressão completa cobre paginação de 1587 respostas, 127 conclusões entre 139 referências, corrida de polling, ranking/PDF e reprocessamento. Relatório final de execução e versionamento é entregue integralmente no chat.

Dívida controlada: as 3 referências antigas para `in_progress` e 9 para `disqualified`, relatadas na auditoria anterior, não foram corrigidas no banco nesta rodada. Nenhuma migration, escrita de produção ou deploy manual. `app/questoes/nova/page-client.tsx` permanece preservado e excluído do commit.

Validação final do pré-commit: 395/395 testes de regressão aprovados, incluindo execução do GET em escala de 1587 respostas e callback real de polling com B chegando antes de A. `npx tsc --noEmit`, `npm run build` e `git diff --check` aprovados. Lint de 21 arquivos TypeScript: zero erros; 13 avisos na tela de resultado do aluno, com regras/mensagens idênticas ao HEAD inicial (`deb8c2736e75860f83387db0296059e81130fdec`). No Windows, a suíte usa o `grep` já instalado pelo Git, adicionado somente ao PATH do processo de testes. Testes com dados simulados e auditoria estrutural; sem nova homologação visual autenticada nem escrita remota.

### Visão geral do professor — refinamento visual (2026-09-09)

Na main-worktree, a aba Visão geral de `app/professor/eventos/[id]/page-client.tsx` reutiliza PremiumCard light nos cinco KPIs e painéis. Cores semânticas, barras SVG contínuas com percentuais pt-BR, donut de concluídos/inscritos, status com percentuais independentes e skeleton inicial. As categorias de participação podem se sobrepor; por isso não são somadas como fatias do donut. Banner superior, navegação, outras abas, consultas, polling e regras de negócio preservados. Nenhuma API ou migration alterada. Sem commit, push ou deploy nesta tarefa.

Validação: TypeScript e lint do arquivo passaram. Renderização isolada do JSX real com dados sintéticos, em 1920, 1366 e 390 pixels, com dados e vazia: sem overflow horizontal. Não substitui homologação autenticada no evento real. Lint global: 344 erros e 142 avisos fora do arquivo alterado.
Build de produção final: `npm.cmd run build` concluído com sucesso.

### Refino visual da Visão geral — segunda passagem (2026-09-09)

Refinado somente o acabamento da aba existente: KPIs com 164px na renderização isolada, ícones elevados à esquerda, fundos semânticos e sparklines SVG decorativos neutros (aria-hidden, sem histórico ou variação inventada). Faixas com coluna de rótulos de 185px no desktop, linhas compactas sem divisórias, barras contínuas de 14px com brilho e sombra colorida. Donut com anel de 34 unidades SVG e tamanhos responsivos de 185/200/220px. Status compactos e precisão com peso tipográfico maior. Reutilizados PremiumCard e os componentes locais existentes; nenhum componente compartilhado novo.

Comparação com a versão anterior confirmou banner, navegação, demais abas, carregamento, mensagens, consultas e cálculos preservados. Renderização do JSX real com dados sintéticos: 1920x1080, 1536x864, 1440x900, 1366x768, 1280x720, 768x1024 e 390x844, com dados e vazia, sem overflow horizontal. Duas conferências visuais por capturas; não houve homologação autenticada do evento real. TypeScript e lint do arquivo passaram. Nenhuma API ou migration alterada; sem commit, push ou deploy.
Validação final do refino: build de produção concluído com sucesso; lint global manteve os 344 erros e 142 avisos preexistentes, sem diagnóstico no arquivo refinado. `git diff --check` passou.

## Auditoria de acesso à Jornada — 2026-09-09

Contrato canônico preservado: `/minhas-jornadas/[studentJornadaId]` e `GET /api/student/jornadas/[id]` usam **`student_jornadas.id`**, nunca `jornadas.id`. A listagem retorna `id` da matrícula e `jornada_id` da definição; o card usa `id`. O Server Component repassa o parâmetro sem conversão e o client chama a API com o mesmo valor. A API filtra `student_jornadas.id` e `student_id` autenticado. Não há tentativa alternativa de resolução por ID da definição.

SELECT remoto autorizado comprovou que `cd23889d-f091-4fca-911c-cd6c789c5853` é uma matrícula `active`, vinculada à Jornada de Teste (`3d618a08-7259-467e-8211-9cbf72b2e250`), com 3 itens no cronograma. O schema observado já tem `jornadas.max_attempts = 3` e não tem `simulados.max_attempts`: a consulta de detalhe em HEAD falha com `42703` nessa coluna removida; a consulta local da sprint de tentativas retorna a matrícula. Não foi verificada a revisão efetivamente implantada em produção; a incompatibilidade foi reproduzida executando o SELECT do HEAD. Nenhuma migration ou escrita remota foi executada nesta auditoria.

A API antes convertia inclusive erro SQL em 404. Agora erros de consulta, de tentativas e de resultados retornam 500 genérico com registro técnico; matrícula inexistente/de outro aluno ou cancelada mantém 404 seguro. `paused` retorna 403 com mensagem explícita e preserva os registros históricos; `expired` mantém a consulta histórica e bloqueia itens não concluídos. Falhas de rede no client encerram o carregamento com erro explícito. Não existe fallback de limite para a coluna antiga nem para tentativas ilimitadas.

A busca global encontrou quatro construtores de retorno/detalhe: card de Minhas Jornadas e card do dashboard usam o `id` da matrícula; Voltar do Simulado usa `?jornada=` (ID da matrícula); resultado usa `payload.jornada.student_jornada_id`. Todos seguem o mesmo contrato. Não foram encontrados construtores adicionais para essa rota em e-mails/notificações. Links administrativos por `jornada_id` continuam identificando a definição administrativa, não a matrícula.

Removidos o CTA “Ver simulados avulsos”, a sugestão de resolver novo avulso e sua contagem de disponibilidade no dashboard. Histórico, resultados, anotações e retomada legada são preservados. Descrições antigas que permitiam novas execuções avulsas estão superadas pela regra de Jornada/Evento. O bloqueio servidor de novo início avulso permanece na API de tentativas.

Correção de acesso: `app/api/student/jornadas/[id]/route.ts`, `app/minhas-jornadas/page-client.tsx`, `app/minhas-jornadas/[id]/page-client.tsx`, `app/api/student/dashboard/route.ts`. Testes: `tests/student-journey-access.spec.ts` (13 casos); suíte de limites contextual preservada. A conclusão em produção depende da implantação coordenada do código compatível, não autorizada nesta tarefa. A migration de tentativas preexistente não deve ser reexecutada automaticamente.

Validação desta correção: TypeScript e build aprovados; lint sem novos diagnósticos comparado ao início da tarefa; diff-check aprovado. Foram executados 105 testes: 101 passaram, incluindo os 13 novos de acesso e 17 de limites; 4 falharam. Três são expectativas textuais já incompatíveis com HEAD (painel Realizando, reenvio de código de cadastro e e-mail de matrícula); a quarta é timeout de interface em cadastro público, fora do fluxo alterado, sem causa atribuída a esta correção. Não declarar a suíte ampliada integralmente aprovada. O fluxo de Jornada foi validado por testes da API com mocks e contratos de links; o SELECT real confirmou a matrícula e o cronograma, sem autenticar/impersonar o aluno. Não houve homologação visual autenticada em produção. Arquivo protegido de nova questão preservado por SHA-256; sem nova migration, escrita remota, commit, push ou deploy.

## Fechamento autorizado — código compatível com o schema observado

Confirmados novamente por SELECT: `jornadas.max_attempts` e `simulado_events.max_attempts` existem (amostra 3); `simulados.max_attempts` não existe. A migration local é somente um artefato versionado nesta entrega: não executar nem reparar seu histórico. A consulta ao histórico por API retornou PGRST106, pois `supabase_migrations` não está exposto; o registro da aplicação permanece uma pendência operacional.

O usuário autorizou um único commit e push para `origin/main`, com verificação posterior do deployment automático da Vercel. As afirmações anteriores “sem commit/push/deploy” descrevem as etapas anteriores. Nenhum deploy manual está autorizado. A alteração do Criador Manual e seus trechos documentais permanecem fora deste commit. Regressão repetida: 101/105 passaram, incluindo 30/30 focais; as mesmas quatro falhas anteriores permaneceram. Não há nova falha identificada no escopo. Homologação autenticada depende de navegador/sessão disponível; não criar sessões por impersonação.
