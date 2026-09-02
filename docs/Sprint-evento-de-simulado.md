# Sprint Evento de Simulado — Documentação Funcional, Técnica e Operacional

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
- `students.approved_at` passou a ser preenchido automaticamente na criação de conta originada por Evento, para que o fluxo convencional "Esqueci minha senha" continue funcionando mesmo que o aluno abandone a etapa antes de criar a senha.
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
- **`representative_attempt_id` nunca é sobrescrito:** confirmado por leitura direta do código (não alterado nesta Sprint) — `POST .../attempts` só grava com `.is("representative_attempt_id", null)`, tanto ao criar quanto ao retomar tentativa; `POST .../attempts/[attemptId]/submit` só grava `if (!participant?.representative_attempt_id)`. Duas travas independentes, ambas pré-existentes, garantem que a tentativa oficial nunca muda depois de definida.
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

**`representative_attempt_id` e contagem:** preservada a regra vigente — a tentativa já é representativa desde a criação (guard `.is("representative_attempt_id", null)`), o encerramento administrativo não move nem reseta esse vínculo, igual ao que já acontecia em desclassificação por foco. `counts_toward_limit = true` consome a tentativa, seguindo o mesmo precedente já aplicado por qualquer desclassificação, independentemente do progresso.

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
- O branch pendente não chama o Resend durante o cooldown: isso é intencional para impedir spam. Passado o cooldown, a intent anterior é substituída, o último token passa a ser o válido e um novo e-mail é enviado. Intents expiradas são renovadas; intents consumidas continuam no fluxo oficial de login/cadastro e não geram participação duplicada.
- Permanecem inalterados reCAPTCHA v3, normalização `trim().toLowerCase()`, validade de 24 horas, hash do token, resposta anti-enumeração e unicidade por Evento/e-mail. Nenhuma migration foi necessária.
- O carregamento inicial da página pública passou a tratar falha de rede, status HTTP inválido e resposta não JSON, exibindo mensagem e **Tentar novamente** em vez de deixar o card vazio. A viewport mantém fallback `100vh` e o e-mail usa 16 px em telas móveis. O reCAPTCHA e a confirmação permaneceram inalterados.
