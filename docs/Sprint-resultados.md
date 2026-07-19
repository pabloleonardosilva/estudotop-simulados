# Sprint Resultados — Documentação Técnica, Funcional e Pedagógica

**Projeto:** EstudoTOP Simulados  
**Módulo:** Resultado do Simulado / Feedback pedagógico  
**Status:** Etapa 1 aprovada conceitualmente e implementada como primeira versão  
**Objetivo:** transformar a tela de resultado do aluno em uma experiência guiada, pedagógica e personalizada, usando a Coruja como mentora visual e textual.

---

## 1. Princípio central

A nota é soberana.

O aluno primeiro quer saber quanto acertou e o que isso representa. A Coruja existe para interpretar esse resultado, não para transformar a tela em um relatório de telemetria.

Atualização 2026-07-07: quando houver múltiplas tentativas, a experiência de resultado deve usar o **resultado real**, isto é, a primeira tentativa completa válida do aluno (`status = completed` e `counts_toward_limit = true`). Tentativas posteriores continuam podendo gerar resultado, mas não substituem o resultado real exibido por padrão em `/meus-simulados/[id]/resultado`.

Regra editorial:

> A Coruja interpreta. Ela não audita, não gera logs e não substitui as seções detalhadas do relatório.

O comportamento do aluno complementa o parecer, mas não muda a faixa principal definida pela nota.

---

## 2. Estrutura da Etapa 1 — Parecer da Coruja

A primeira etapa da página de resultado usa duas colunas:

- coluna esquerda: imagem da Coruja correspondente à faixa de aproveitamento;
- coluna direita: título, resultado, parecer, sinais comportamentais e convite para seguir.

Regra visual aprovada em 2026-06-24:

- a primeira dobra deve permanecer limpa e conversada;
- não exibir cards operacionais antigos de pontuação, aproveitamento, comparação ou próximo passo recomendado dentro do Parecer da Coruja;
- o resultado numérico principal deve ganhar destaque premium dentro do bloco textual, com acertos, total de questões e aproveitamento;
- a primeira aba pode exibir uma dashboard compacta e horizontal no rodapé do hero, limitada a quatro métricas executivas: acertos, erros, questões em branco e tempo total;
- essa dashboard deve ser leve, visual e integrada ao hero, sem transformar a primeira etapa em relatório técnico;
- o texto do parecer deve usar maior respiro vertical e linhas mais confortáveis para leitura.

Ordem oficial:

1. Título da faixa.
2. Resultado numérico.
3. Parecer-base da faixa.
4. Observações comportamentais, quando existirem.
5. Convite para continuar a análise.

Convite padrão:

> Nos próximos passos vamos identificar os principais fatores que contribuíram para este resultado.

---

## 3. Faixas de resultado

| Faixa | Título oficial | Coruja |
|---|---|---|
| 0% a 10% | Preciso da sua atenção imediata | Coruja 1 |
| 11% a 40% | Precisamos reconstruir conhecimentos importantes | Coruja 2 |
| 41% a 74% | Estamos indo bem, mas ainda em desenvolvimento | Coruja 3 |
| 75% a 99% | Você está jogando em alto nível, mas ainda não atingiu o topo da montanha | Coruja 4 |
| 100% | Desempenho perfeito nesta tentativa, mas precisa tomar cuidado | Coruja 5 |

As imagens oficiais iniciais ficam em:

```text
public/images/resultados/coruja-resultado-1.png
public/images/resultados/coruja-resultado-2.png
public/images/resultados/coruja-resultado-3.png
public/images/resultados/coruja-resultado-4.png
public/images/resultados/coruja-resultado-5.png
```

Sempre que a Etapa 1 for entregue em ZIP de atualização e as imagens ainda não existirem no ambiente do usuário, a pasta `public/images/resultados/` deve ser incluída no pacote.

---

## 4. Pareceres-base aprovados

Cada faixa possui 5 variações de parecer-base. As variações existem para evitar repetição, não para mudar o diagnóstico.

O sistema escolhe uma variação de forma estável por resultado, mantendo coerência ao recarregar a tela.

### 4.1 Faixa 0% a 10%

Título: **Preciso da sua atenção imediata**

1. O resultado desta tentativa é preocupante e merece atenção imediata. Existem lacunas importantes na sua preparação e alguns conhecimentos precisarão ser reconstruídos. Isso não significa que sua aprovação está definida nem que este será seu desempenho na prova real. O simulado existe justamente para revelar esses pontos antes do dia da prova, quando ainda há tempo para corrigi-los.

2. Este desempenho merece uma análise cuidadosa. O resultado é preocupante e indica que parte importante do conteúdo ainda não foi assimilada da forma necessária. A boa notícia é que o simulado cumpriu exatamente o seu papel: mostrar onde estão as maiores dificuldades para que elas possam ser enfrentadas antes da prova real.

3. Este resultado revela fragilidades que não podem ser ignoradas. Existem conhecimentos fundamentais que precisarão ser fortalecidos e, em alguns casos, reconstruídos. Mais importante do que a nota obtida é compreender o que ela está revelando sobre a sua preparação neste momento. O diagnóstico pode ser duro, mas é muito mais útil agora do que no dia da prova.

4. O resultado observado neste simulado é preocupante e indica que existem lacunas relevantes na sua base de conhecimentos. Isso não deve ser encarado como uma sentença nem como uma previsão sobre o concurso. O simulado funciona como um instrumento de diagnóstico e, neste caso, ele está mostrando de forma clara quais áreas da sua preparação precisam de atenção prioritária.

5. A situação exige atenção. O desempenho desta tentativa mostra que ainda existem obstáculos importantes entre o seu nível atual de preparação e o desempenho necessário para competir em alto nível. Isso não significa que a aprovação esteja distante, mas mostra que alguns ajustes precisarão ser feitos com urgência para que sua evolução aconteça de forma consistente.

### 4.2 Faixa 11% a 40%

Título: **Precisamos reconstruir conhecimentos importantes**

1. O resultado mostra que você já possui algum contato com os conteúdos cobrados, mas ainda existem lacunas importantes que estão limitando o seu desempenho. Neste momento, o objetivo não deve ser apenas aumentar a quantidade de estudo, mas identificar exatamente quais conhecimentos precisam ser fortalecidos para gerar uma evolução consistente.

2. Este desempenho indica que parte da sua base já está construída, mas ainda não da forma necessária para enfrentar uma prova competitiva com segurança. Existem conhecimentos importantes que precisarão ser revisados e consolidados para que o seu resultado evolua de maneira mais consistente.

3. O resultado desta tentativa mostra que você já domina alguns tópicos, mas ainda está deixando muitos pontos pelo caminho. O simulado revelou áreas da sua preparação que precisam de atenção e que, quando fortalecidas, podem gerar um impacto significativo nos próximos resultados.

4. Este resultado não deve ser visto como uma previsão sobre o seu desempenho no concurso. Ele representa um retrato da sua preparação neste momento. Existem conhecimentos que já começam a aparecer de forma consistente, mas ainda há fragilidades importantes que precisam ser tratadas para reduzir a distância até um desempenho mais competitivo.

5. O desempenho obtido mostra que sua preparação já começou a produzir resultados, mas ainda existe um caminho importante a percorrer. Alguns conteúdos demonstram sinais de evolução, enquanto outros ainda apresentam dificuldades que merecem atenção especial. O mais importante agora é entender onde estão essas diferenças.

### 4.3 Faixa 41% a 74%

Título: **Estamos indo bem, mas ainda em desenvolvimento**

1. O resultado desta tentativa mostra que sua preparação está evoluindo. Existe conhecimento sendo construído e parte importante dos conteúdos já começa a aparecer de forma consistente no seu desempenho. Ao mesmo tempo, ainda existem oscilações que podem custar pontos importantes em uma prova competitiva. O próximo passo é transformar conhecimento em consistência.

2. Este resultado indica que você já deixou para trás a fase inicial da preparação. Há sinais claros de evolução e uma base que começa a se consolidar. No entanto, ainda existem pontos de instabilidade que impedem um desempenho mais seguro e previsível. A boa notícia é que essas diferenças costumam ser mais fáceis de corrigir do que construir a base do zero.

3. Sua preparação já começa a produzir resultados mais consistentes. O desempenho demonstra que diversos conteúdos estão sendo assimilados corretamente, mas ainda existem oportunidades importantes de crescimento. Neste estágio, pequenas melhorias costumam gerar ganhos significativos no resultado final.

4. O resultado mostra que você está avançando na direção correta. Existem conhecimentos consolidados e uma evolução perceptível em relação aos níveis iniciais de desempenho. Ainda assim, o caminho até um resultado verdadeiramente competitivo exige mais regularidade e maior domínio dos conteúdos que continuam gerando perda de pontos.

5. Este é o tipo de resultado que mostra potencial. Sua preparação já produz acertos relevantes e demonstra que existe uma base sendo construída. O desafio agora não é começar do zero, mas reduzir as oscilações que ainda aparecem ao longo da prova. Quanto mais consistente for o seu desempenho, menor será a distância até os níveis mais altos de competitividade.

### 4.4 Faixa 75% a 99%

Título: **Você está jogando em alto nível, mas ainda não atingiu o topo da montanha**

1. Seu desempenho nesta tentativa foi forte e demonstra domínio consistente de boa parte dos conteúdos cobrados. Esse é o tipo de resultado que mostra uma preparação competitiva. Ainda assim, concursos costumam ser decididos nos detalhes, e os pontos perdidos aqui podem representar uma diferença importante na classificação final.

2. O resultado demonstra que sua preparação está em um nível elevado. Grande parte dos conteúdos já aparece de forma consistente no seu desempenho, o que é um excelente sinal. O desafio agora não é construir base, mas reduzir as perdas que ainda impedem um resultado ainda mais sólido.

3. Este desempenho mostra que você está jogando em alto nível. Existe conhecimento, consistência e capacidade de transformar estudo em pontos na prova. Ao mesmo tempo, os resultados mais expressivos costumam surgir justamente quando os últimos ajustes começam a ser feitos com atenção.

4. O resultado obtido demonstra que sua preparação está avançando de forma consistente. Você já superou muitas das dificuldades encontradas nas fases iniciais do estudo e apresenta um desempenho que merece ser valorizado. Agora é hora de concentrar esforços naquilo que ainda separa um bom resultado de um resultado excepcional.

5. Sua preparação já produz resultados que podem ser considerados competitivos. O desempenho desta tentativa mostra que você está cada vez mais próximo dos níveis mais altos de desempenho. O risco, neste estágio, não é a falta de conhecimento, mas a acomodação diante dos progressos já conquistados.

### 4.5 Faixa 100%

Título: **Desempenho perfeito nesta tentativa, mas precisa tomar cuidado**

1. Gabaritar um simulado é um resultado raro e merece reconhecimento. Nesta tentativa, você demonstrou domínio completo dos conteúdos cobrados e não deixou nenhum ponto pelo caminho. Ainda assim, é importante lembrar que um único simulado não define o desempenho que será obtido na prova real. O maior risco neste momento não é a falta de conhecimento, mas a sensação de que o trabalho já terminou.

2. O resultado desta tentativa foi perfeito. Todos os pontos disponíveis foram conquistados e isso demonstra um excelente nível de preparação para os conteúdos cobrados. Mas existe uma diferença importante entre alcançar um desempenho excepcional uma vez e conseguir repeti-lo de forma consistente. O desafio agora é transformar este resultado em padrão.

3. Poucos alunos conseguem concluir um simulado sem perder nenhum ponto. O resultado alcançado nesta tentativa demonstra conhecimento, atenção e consistência. Mesmo assim, o concurso não será decidido por este simulado, mas pela sua capacidade de manter esse nível de desempenho ao longo do tempo e em diferentes cenários de prova.

4. Este é o melhor resultado possível dentro de um simulado. Você demonstrou domínio dos conteúdos avaliados e aproveitou todas as oportunidades de pontuação disponíveis nesta prova. O cuidado necessário agora é evitar a acomodação. Em concursos competitivos, a manutenção da disciplina costuma ser tão importante quanto o próprio conhecimento.

5. O desempenho desta tentativa foi impecável. Não houve perda de pontos e isso demonstra um nível elevado de domínio sobre os conteúdos cobrados. Ainda assim, é importante manter os pés no chão. A prova real apresenta variáveis que não podem ser totalmente reproduzidas em um simulado. Use este resultado como confirmação de que sua preparação está evoluindo, mas não como motivo para diminuir o ritmo.

---

## 5. Sinais comportamentais da Etapa 1

Os sinais aparecem depois do parecer-base. Eles são curtos e conversados.

Regra:

- máximo de 2 sinais positivos;
- máximo de 2 pontos de atenção;
- pontos relevantes em negrito;
- detalhes numéricos ficam nas etapas seguintes;
- a nota continua sendo a informação principal.

### 5.1 Sinais positivos

- **boa atenção**: ocorre quando não houve saída de tela nem período de inatividade;
- **boa capacidade de decisão**: ocorre quando o índice de decisão é firme e o aproveitamento é superior a 75%.

### 5.2 Pontos de atenção

- **foco comprometido**: duas ou mais saídas de tela ou mais de dois períodos de inatividade;
- **hesitação na tomada de decisões**: média superior a 3 trocas de resposta por questão;
- **questões deixadas em branco**: mais de 10% das questões em branco;
- **pouco uso da tesourinha**: uso em até 40% das questões.

### 5.3 Textos-base dos sinais

Com sinais positivos e pontos de atenção:

> Além da nota, alguns sinais chamaram atenção. Sua execução demonstrou **boa atenção** durante a resolução. Ao mesmo tempo, houve indícios de **foco comprometido**, pontos que serão detalhados nos próximos passos.

Somente sinais positivos:

> Além da nota, alguns sinais positivos chamaram atenção. Sua execução demonstrou **boa atenção** durante a resolução. Você se manteve focado no simulado, ponto que será detalhado nos próximos passos.

Somente pontos de atenção:

> Além da nota, alguns sinais chamaram atenção. Houve indícios de **foco comprometido**, pontos que serão detalhados nos próximos passos.

---

## 5.6 Aba Desempenho por Assunto — tópicos avaliados

A terceira aba oficial do resultado é **Desempenho por Assunto**. Ela deve responder à pergunta pedagógica: em quais assuntos o aluno acertou, em quais errou ou deixou em branco, e quais tópicos específicos devem ser revisados.

A aba usa o campo `questions.evaluated_topics`, preenchido no banco de questões, para evitar diagnósticos genéricos como “estude Hardware”. O formato correto é:

```text
Você acertou questões de Hardware, Redes e Windows.
Mas errou ou deixou em branco questões de Hardware e Segurança da Informação.
Para não cair em armadilhas parecidas, revise os seguintes tópicos:
Hardware — Memória RAM, Memória Cache
Segurança da Informação — Phishing, Firewall
```

Regras oficiais:

- agrupar sempre por assunto;
- dentro de cada assunto, consolidar os tópicos avaliados;
- nunca repetir o mesmo tópico no relatório;
- se duas questões tiverem tópicos equivalentes com nomes diferentes, como `HTTP` e `Protocolo HTTP`, o relatório deve consolidar em um rótulo único;
- qualquer tópico com erro ou questão em branco entra em **Tópicos para revisar**;
- não usar a ideia de “dificuldade relevante”: se errou, aparece como ponto de revisão;
- questões anuladas não entram como acerto nem erro no diagnóstico por tópico;
- tópicos acertados sem erro/branco não devem ser exibidos nesta aba; o foco da tela é orientar o aluno sobre o que precisa revisar;
- o topo da aba deve mostrar apenas os indicadores executivos **Assuntos avaliados** e **Pontos de atenção**, evitando cards paralelos como “melhor assunto”, “fortes” ou colunas laterais redundantes;
- cada card de assunto deve mostrar o nome do assunto, quantidade de questões, acertos e erros;
- dentro de cada card, exibir um quadro explicativo sem repetir os nomes dos tópicos; o texto deve informar que cada questão errada ou em branco foi analisada e que a lista abaixo contém os tópicos recomendados para revisão;
- a coluna lateral “Prioridade da Coruja” e “Pontos consistentes” foi removida desta etapa para manter a tela mais limpa;
- o quadro verde “Tópicos que você acertou” não deve aparecer, porque o aluno deve concentrar esta etapa nos tópicos que errou ou deixou em branco;
- a aba não deve chamar IA por aluno/tentativa nesta primeira versão, para preservar custo operacional; a consolidação semântica inicial é local e determinística, usando normalização de acentos, termos genéricos e aliases comuns.

Observação de custo:

> Como haverá vários alunos e várias análises, a aba não deve chamar IA a cada visualização do resultado. O uso de IA fica reservado para o momento de detectar/preencher `evaluated_topics` na questão. No resultado, o sistema apenas consome os tópicos já salvos e aplica consolidação local.

## 6. Métricas comportamentais

### 6.1 Foco

Saídas de tela usam o contador já existente do sistema:

- 0 saídas: foco excelente;
- 1 saída: foco aceitável;
- 2 ou mais saídas: foco comprometido.

Inatividade:

- 60 segundos ou mais sem mouse, teclado, clique, rolagem ou toque geram 1 evento de inatividade;
- 0 eventos: foco excelente;
- 1 a 2 eventos: foco aceitável;
- mais de 2 eventos: foco comprometido.

### 6.2 Decisão

Índice de decisão:

```text
trocas_totais ÷ total_de_questões
```

Classificação:

- até 1 troca por questão: decisão firme;
- de 2 até 3 trocas por questão: atenção;
- acima de 3 trocas por questão: hesitação.

A boa capacidade de decisão só deve ser elogiada quando houver decisão firme e aproveitamento superior a 75%.

### 6.3 Tesourinha

A métrica é por questão:

```text
questões com uso de tesourinha ÷ total de questões
```

Se o aluno usar a tesourinha uma única vez dentro de uma questão, aquela questão já conta como questão com uso de tesourinha.

Regra de texto:

- 0% a 40%: emitir orientação sobre pouco uso da ferramenta;
- acima de 40%: não comentar.

Texto aprovado:

> A ferramenta de eliminação de alternativas (tesourinha) foi usada poucas vezes ou não foi utilizada. Em questões com dúvida, esse recurso pode ajudar a organizar o raciocínio e reduzir erros por precipitação.

### 6.4 Questões em branco

Regra:

- até 10%: não gerar alerta forte;
- acima de 10%: gerar ponto de atenção.

Texto aprovado:

> O percentual de questões deixadas em branco merece atenção. Embora deixar uma questão sem resposta possa ser melhor do que responder sem convicção, o ideal é alcançar um nível de preparação que permita decidir com segurança na maior parte das questões.

### 6.5 Tempo

Na V1, o tempo deve ser coletado e armazenado, mas não deve gerar julgamento pedagógico automático.

Dados úteis:

- tempo total;
- tempo médio por questão;
- tempo por questão;
- menor tempo;
- maior tempo;
- visitas por questão.

Interpretações por tempo ficam para versões futuras, quando houver massa de dados suficiente.

---

## 7. Implementado nesta versão

- Etapa 1 visual da página de resultado do aluno com Coruja por faixa, em layout limpo de duas colunas.
- 5 faixas oficiais de aproveitamento.
- 25 pareceres-base aprovados.
- Inserção automática de sinais comportamentais após o parecer.
- Contagem de eventos de inatividade na execução do aluno.
- Contagem de questões em que a tesourinha foi usada.
- Uso de trocas de resposta já persistidas em `simulado_answers.changed_count`.
- Uso de saídas de tela já persistidas em `simulado_attempts.focus_violation_count` / `tab_switch_count`.
- Exibição de tempo médio de resolução no detalhe administrativo do simulado.
- Ajuste visual da Etapa 1 para remover cards secundários do Parecer da Coruja e aumentar o espaçamento vertical do texto.

Migration criada:

```text
app/supabase_migrations/014_resultados_behavior_metrics.sql
```

Campos adicionados:

- `simulado_attempts.inactivity_event_count`;
- `simulado_attempts.scissors_used_question_ids`.

---

## 8. Implementações futuras

Estas funcionalidades fazem parte da visão da Sprint Resultados, mas não foram implementadas nesta entrega.

### 8.1 Configurações administrativas da página de resultados

Criar uma área no admin:

```text
Configurações
└── Resultados Inteligentes
```

Ela deverá permitir que a equipe gerencie textos e imagens sem alterar código.

### 8.2 Biblioteca de imagens por faixa

Cada faixa deverá possuir uma galeria própria de imagens:

- 0% a 10%;
- 11% a 40%;
- 41% a 74%;
- 75% a 99%;
- 100%.

Funcionalidades futuras:

- upload de novas imagens;
- pré-visualização;
- ativar imagem da faixa;
- arquivar imagem antiga;
- reativar imagem antiga;
- manter imagens anteriores em galeria.

As imagens padrão nunca devem ser destruídas pelo admin comum.

### 8.3 Biblioteca de textos por faixa

Cada faixa deverá permitir cadastro e seleção de textos:

- título;
- pareceres-base;
- mensagens de sinais positivos;
- mensagens de pontos de atenção;
- convite para continuar.

Os textos padrão devem ser protegidos.

Regras futuras:

- não excluir texto padrão sem senha ou perfil master;
- permitir duplicar texto padrão e editar cópia;
- permitir ativar/desativar variações.

### 8.4 Métricas avançadas de decisão

Registrar histórico de qualidade das trocas:

- errada → certa;
- certa → errada;
- errada → errada;
- certa → certa.

Esses dados não entram na primeira fala da Coruja na V1, mas serão úteis para diagnóstico comportamental avançado.

### 8.5 Diagnóstico de tempo

Somente ativar quando houver massa de dados suficiente para comparação.

Possíveis análises futuras:

- tempo do aluno versus média do simulado;
- tempo do aluno versus histórico próprio;
- evolução do ritmo ao longo dos simulados;
- questões com tempo excessivo;
- questões respondidas rápido demais com erro.

### 8.6 Relatório detalhado de comportamento

A primeira etapa deve continuar limpa. O detalhamento completo deve aparecer em etapa própria, com números, gráficos e explicações.

---

## 9. Regra de manutenção

Qualquer alteração futura na página de resultados deve consultar:

```text
docs/Sprint-resultados.md
```

O arquivo `docs/INDICE_FUNCOES_SISTEMA.md` deve apontar para este documento como fonte oficial da Sprint Resultados.

---

## 10. Ajuste visual da Etapa 1 — 2026-06-24

### Alterações aplicadas

- A seção **Avaliação do simulado** foi removida da página de resultado para não poluir a experiência principal do pós-simulado.
- A aba **Resultado geral** removeu os cards secundários antigos abaixo do Parecer da Coruja.
- O bloco principal passou a destacar o resultado numérico em card premium interno, sem voltar ao modelo antigo de vários cards soltos.
- A dashboard compacta de rodapé do hero exibe quatro métricas: acertos, erros, questões em branco e tempo total.
- A imagem da coruja foi ampliada verticalmente e o container principal da página de resultado pode usar largura levemente maior para reduzir quebras de linha e evitar barra de rolagem excessiva na primeira dobra.
- O texto do parecer manteve espaçamento vertical confortável, mas com margens internas mais controladas.
- As imagens das corujas devem ser entregues no caminho público correto do projeto:

```text
public/images/resultados/
```

### Regra de manutenção

A Etapa 1 deve continuar funcionando como conversa inicial sobre o resultado. Cards de avaliação, comparação ou próximos passos operacionais não devem ser recolocados dentro da primeira aba sem nova decisão explícita. A única dashboard permitida nesta primeira aba é o resumo compacto horizontal de acertos, erros, questões em branco e tempo total, integrado ao hero.

---

## 10. Etapa 2 — Raio-X da Prova

**Status:** implementada como segunda aba da página de resultado do aluno.

A aba **Raio-X da Prova** não é uma análise de desempenho por assunto. Ela funciona como um painel de características do simulado e da tentativa realizada.

Pergunta que responde:

> Como era essa prova e como foi minha tentativa?

### Conteúdo exibido

A aba deve mostrar, de forma visual e premium:

- assuntos cobrados no simulado;
- número total de questões;
- questões válidas;
- acertos;
- erros;
- questões anuladas;
- tempo total do simulado;
- tempo médio aproximado por questão;
- percentual de questões respondidas;
- quantidade de assuntos cobrados;
- nome do simulado;
- data/hora de finalização;
- modelo de correção;
- nota obtida em relação à nota máxima.

### Regra editorial

Esta aba não deve substituir a aba **Desempenho por Assunto**.

- **Raio-X da Prova**: mostra dados gerais e estruturais da tentativa.
- **Desempenho por Assunto**: mostra em quais conteúdos o aluno foi bem ou mal.
- **Comportamento**: mostra padrões de execução, foco, tempo, hesitação e uso de ferramentas.
- **Revisão das Questões**: mostra a análise questão por questão.

### Ordem oficial das abas após esta entrega

1. Resultado geral.
2. Raio-X da Prova.
3. Desempenho por Assunto.
4. Comportamento.
5. Revisão das Questões.
6. Estatísticas Avançadas.

### Implementação técnica

Arquivo alterado:

```text
app/meus-simulados/[id]/resultado/page-client.tsx
```

Componentes adicionados:

```text
ResultExamXRay
XRayMetric
ResultAdvancedStats
```

A aba utiliza os dados já retornados pela API de resultado. Não houve criação de rota, migration ou nova tabela nesta etapa.


Arquivo alterado:

```text
app/meus-simulados/[id]/resultado/page-client.tsx
public/images/resultados/coruja-raio-x.png
```

### Ajuste visual do Raio-X da Prova — 2026-06-24

- A coluna esquerda da aba **Raio-X da Prova** passa a usar a imagem `public/images/resultados/coruja-raio-x.png`.
- A imagem deve ser servida pela URL `/images/resultados/coruja-raio-x.png`.
- Os cards de métricas do Raio-X foram compactados para evitar textos quebrados e reduzir sensação de tumulto visual.
- Em telas largas, os gráficos decorativos dos cards aparecem apenas em `2xl`, preservando legibilidade em larguras menores.
- As métricas permanecem as mesmas: questões, acertos, erros, anuladas, tempo total, tempo por questão, respondidas e assuntos.

## Atualização — Desempenho por Assunto Clean Premium com Coruja Analista — 2026-06-26

A aba **Desempenho por Assunto** da Área do Aluno foi redesenhada para seguir o padrão Clean Premium aprovado para os resultados.

Implementação aplicada em `app/meus-simulados/[id]/resultado/page-client.tsx`:

- hero principal com a imagem da Coruja Analista à esquerda;
- imagem pública adicionada em `public/images/resultados/coruja-analise-assuntos.png`, servida por `/images/resultados/coruja-analise-assuntos.png`;
- texto central conversado explicando que o aluno deve revisar tópicos com erros ou questões em branco;
- dois indicadores executivos no hero: **Assuntos avaliados** e **Tópicos para revisar**;
- grid responsivo de cards de assunto, com três colunas em desktop amplo;
- todos os cards de assunto têm a mesma altura visual;
- cada card exibe assunto, questões, acertos, erros/brancos, barra percentual e link para revisão;
- quando há erro ou branco, o card mostra apenas **Tópicos para revisar**, em chips vermelhos;
- quando não há erro ou branco, o card mostra mensagem de **Ótimo desempenho**, sem lista de tópicos revisados;
- rodapé da aba com **Dica de estudo** e botão para ir à Revisão Geral.

Regras preservadas:

- a aba continua consumindo `questions.evaluated_topics` retornado pela API de resultado;
- não há chamada de IA por aluno/tentativa;
- questões anuladas continuam fora do diagnóstico por tópico;
- a aba não exibe quadro de tópicos acertados/revisados;
- a lógica de resultado, gabarito, cálculo de nota, comportamento e revisão das questões não foi alterada.

### Refinamento visual — Coruja Analista vazando do hero — 2026-06-26

A aba **Desempenho por Assunto** recebeu ajuste fino no hero principal para permitir que a imagem da Coruja Analista funcione como elemento protagonista, ultrapassando levemente o limite superior do card no desktop.

Arquivo alterado:

```text
app/meus-simulados/[id]/resultado/page-client.tsx
```

Arquivo público confirmado:

```text
public/images/resultados/coruja-analise-assuntos.png
```

Ajustes aplicados:

- o hero passou de `overflow-hidden` para `overflow-visible`, permitindo que a imagem ultrapasse o quadro;
- em desktop, a coruja agora fica em camada absoluta (`position: absolute`) sobre o hero, com `pointer-events-none` para não bloquear cliques;
- foi mantida uma coluna espaçadora no grid para preservar a posição do texto e dos cards executivos;
- a versão mobile/tablet continua usando imagem contida dentro do bloco, evitando sobreposição em telas menores;
- o caminho público permanece `/images/resultados/coruja-analise-assuntos.png`;
- nenhuma API, regra de resultado, cálculo de desempenho, aba paralela ou banco de dados foi alterado.

### Refinamento visual — Resultado geral com Coruja em overflow — 2026-06-26

A aba **Resultado geral** recebeu o mesmo tratamento premium de hero em camadas já aprovado na aba **Desempenho por Assunto**, mantendo intacta a dashboard compacta inferior de métricas.

Arquivo alterado:

```text
app/meus-simulados/[id]/resultado/page-client.tsx
```

Ajustes aplicados:

- o bloco superior do Parecer da Coruja passou a usar um hero interno com `overflow-visible`;
- em desktop, a imagem dinâmica da coruja de resultado fica em camada absoluta sobre o hero, podendo ultrapassar levemente os limites do quadro;
- foi adicionada uma coluna espaçadora no grid para preservar a leitura do parecer e impedir sobreposição com o texto;
- foram aplicados glow quente, sombra de base e halo radial atrás da coruja para integrar a imagem ao card;
- em telas menores, a imagem continua contida dentro do hero para evitar sobreposição e quebra responsiva;
- os cards inferiores de Acertos, Erros, Em branco e Tempo total não foram alterados;
- nenhuma API, regra de cálculo, parecer dinâmico, métricas, aba paralela ou banco de dados foi alterado.

## Atualização — Resultado do Simulado / Raio-X da Prova com Coruja em Overflow (2026-06-26)

**Área:** Área do Aluno → Resultado do Simulado → aba Raio-X da Prova.

**Arquivo alterado:** `app/meus-simulados/[id]/resultado/page-client.tsx`.

**Escopo:** refinamento visual exclusivo do hero da aba Raio-X da Prova, seguindo o padrão premium já aplicado nas abas Resultado geral e Desempenho por Assunto.

**O que foi alterado:**

- O bloco superior da aba Raio-X da Prova passou a usar hero com `overflow-visible`.
- A imagem `/images/raio-x/coruja-raio-x.png` foi mantida, mas agora em desktop é posicionada em camada absoluta para sair levemente do quadro.
- Foi adicionado halo/glow quente atrás da coruja, sombra de base e drop-shadow para aumentar profundidade.
- Foi mantida uma coluna espaçadora no grid para evitar sobreposição entre coruja e conteúdo textual.
- Em telas menores, a coruja volta ao comportamento contido dentro do bloco, preservando responsividade.
- As métricas do Raio-X foram preservadas: Questões, Acertos, Erros, Anuladas, Tempo total, Por questão, Respondidas e Assuntos.
- Os cards inferiores “Assuntos do simulado” e “Dados da tentativa” não foram alterados.

**Regras preservadas:**

- Não alterar cálculo de resultado, APIs, dados reais, abas, navegação de etapas ou demais telas.
- Não criar migration.
- Não mover imagem pública; foi usada a imagem já existente em `public/images/raio-x/coruja-raio-x.png`.

---

## Etapa 4 — Comportamento da tentativa

**Status:** implementado em 2026-06-26.

A aba **Comportamento** passa a usar a mesma linguagem visual premium das etapas anteriores, com hero em `overflow-visible`, coluna de coruja à esquerda e análise conversada à direita. A imagem oficial usada nesta etapa é:

```text
public/images/resultados/coruja_analista_comportamento_transparente.png
```

URL pública esperada no Next.js:

```text
/images/resultados/coruja_analista_comportamento_transparente.png
```

### Indicadores exibidos

A aba exibe quatro dimensões comportamentais:

1. **Foco**
   - Usa saídas de tela (`tab_switch_count` + `focus_violation_count`).
   - Usa períodos de inatividade acima de 60 segundos (`inactivity_event_count`).
   - Classificação:
     - 0 evento: foco excelente;
     - 1 a 2 eventos: foco aceitável;
     - acima de 2 eventos: foco comprometido.

2. **Decisão**
   - Usa total de trocas de resposta (`simulado_answers.changed_count`).
   - Calcula média de trocas por questão (`decision_index`).
   - Classificação:
     - até 1 troca por questão: decisão firme;
     - de 2 até 3: atenção;
     - acima de 3: hesitação.

3. **Tesourinha**
   - Usa `scissors_used_question_ids` em `simulado_attempts`.
   - Mostra apenas a quantidade de questões em que a ferramenta foi usada, sem exibir percentual de utilização.
   - A explicação oficial informa que a tesourinha ajuda em uma resolução mais organizada, pois permite eliminar alternativas improváveis antes de marcar a resposta.

4. **Ajuda da Coruja**
   - A aba sempre informa a disponibilidade do recurso.
   - Quando o recurso estiver liberado no simulado (`owl_help_enabled`), mostra se o aluno utilizou ou não a ajuda.
   - Usa `owl_help_used_count` da tentativa.
   - Quando o recurso não estiver liberado, informa que a ajuda da Coruja não estava disponível naquele simulado.

5. **Tempo médio por questão**
   - Exibe o tempo total da tentativa.
   - Exibe o tempo médio por questão.
   - Esse indicador auxilia a leitura de ritmo, pressa ou demora excessiva, sem substituir a análise da nota.

### Regra pedagógica

A aba Comportamento não substitui o resultado. A nota continua soberana. O comportamento apenas ajuda a explicar como o aluno executou a tentativa e quais hábitos podem ser ajustados nas próximas provas.


---

## Atualização — Aba Vídeo de Correção com hero premium minimalista (2026-06-30)

A etapa **Vídeo de Correção** integra o fluxo principal da página `/meus-simulados/[id]/resultado` quando o simulado possuir `correction_video_url`.

### Regras visuais e funcionais

- a aba deve seguir o padrão clean premium das demais etapas, mas com menos informação e foco absoluto no player;
- o hero principal deve usar **coruja em overflow** no desktop, com glow suave, sombra e composição premium;
- a coruja da etapa deve ser referenciada por `/images/resultados/coruja-correcao.png`;
- o player deve ser o elemento dominante da tela, com moldura escura premium, proporção 16:9, sombra forte e controles nativos/embutidos;
- a interface não deve exibir o link bruto do vídeo ao aluno;
- o texto do hero deve ser curto e limitado a título + subtítulo;
- não deve existir caixa explicativa longa dentro do hero;
- não deve existir CTA adicional abaixo dos três cards;
- abaixo do hero devem existir exatamente três cards horizontais, minimalistas e iguais entre si, com os títulos:
  - **Assista com atenção**
  - **Entenda seus erros**
  - **Anote as dicas**
- esses cards devem ter ícones grandes, glow discreto, borda leve e microcopy curta.

### Regras de navegação

- se houver `correction_video_url`, a etapa entra no fluxo entre **Comportamento** e **Revisão das Questões**;
- se não houver `correction_video_url`, o fluxo continua sem essa etapa extra;
- os botões de revisão de outras abas devem continuar levando o aluno diretamente para **Revisão das Questões**, e não para o vídeo.

### Regras técnicas preservadas

- nenhuma API de resultado foi alterada;
- nenhum cálculo de nota, acertos, erros, tempo ou comportamento foi alterado;
- nenhuma migration foi criada;
- a alteração é exclusivamente de apresentação, fluxo visual e embed do vídeo.

---

## Atualização 2026-07-16 — Resultado da tentativa atual vs resultado oficial

### Regra de duas camadas

O sistema separa dois conceitos de resultado:

**1. Resultado imediato (tentativa atual)**

- Ao finalizar qualquer tentativa, o aluno é redirecionado para
  `/meus-simulados/[id]/resultado?attemptId=[attemptId]` (com `&jornada=[studentJornadaId]` quando a tentativa veio de uma Jornada).
- A página exibe integralmente os dados **da tentativa recém-finalizada**: nota, percentual, acertos, erros, brancos, anuladas, tempo total/médio, Resultado Geral, Raio-X, Desempenho por Assunto, Comportamento, Vídeo de Correção, Revisão das Questões e PDF.
- Todos os blocos usam o mesmo `attempt.id` resolvido — nenhum bloco mistura dados de tentativas diferentes.
- O resultado imediato **não substitui** o resultado oficial.

**2. Resultado oficial (histórico)**

- Continua sendo a **primeira tentativa completa válida** (`status = completed` e `counts_toward_limit = true`), ordenada por `submitted_at`/`created_at` ascendente.
- É o resultado usado em: página **Meus Resultados**, histórico do aluno, métricas/cards da Jornada (`real_score_percent`), perfil administrativo, dashboards e comparações.
- Tentativas posteriores podem ser concluídas e visualizadas logo após o término, mas não alteram o histórico nem a referência oficial.

### API de resultado

`GET /api/student/simulados/[id]/resultado` aceita parâmetros opcionais:

- `attemptId` — quando presente, a API busca a tentativa informada e valida no backend:
  `attempt.student_id = aluno autenticado`, `attempt.simulado_id = simulado da rota` e `attempt.status = completed`.
  Falha em qualquer validação → `404` genérico ("Resultado não encontrado para esta tentativa."), sem fallback silencioso para outra tentativa e sem vazar dados de terceiros.
- `jornada` — id de `student_jornadas` usado apenas como contexto de navegação (ver botão de retorno). Só é aceito se pertencer ao aluno autenticado e contiver o simulado.
- Sem `attemptId`, mantém-se o comportamento anterior: primeira tentativa completa válida (compatibilidade com links antigos, Meus Resultados e acessos diretos).

### Botão de retorno da página de resultado

- A resposta da API inclui `jornada: { student_jornada_id, title } | null`, resolvido assim:
  1. vínculo explícito da navegação (`?jornada=`) validado contra os vínculos reais do aluno;
  2. sem contexto explícito, somente quando o simulado está em **exatamente uma** Jornada do aluno;
  3. nunca escolhe Jornada arbitrária quando há ambiguidade.
- Com contexto: botão **Voltar para a Jornada** → `/minhas-jornadas/[studentJornadaId]`.
- Sem contexto (simulado avulso): botão **Voltar para Meus Simulados** → `/meus-simulados`.
- O `result_url` retornado por `GET /api/student/jornadas/[id]` passou a incluir `?jornada=[studentJornadaId]` para preservar a Jornada real de origem.

### Desempenho por Assunto — regras vigentes

- **Tópicos para revisar** são todos os tópicos avaliados (`questions.evaluated_topics`) presentes nas questões em que o aluno **errou ou deixou em branco**. Tópicos de questões apenas acertadas não aparecem.
- Todos os tópicos dessas questões são exibidos no próprio card, com quebra de linha dos chips — **sem truncamento** e sem resumo "+N".
- Em notebooks, inclusive 1366px, o grid usa duas colunas; três colunas ficam restritas a telas `2xl` (1536px ou mais). O nome do assunto não possui limite de linhas e os chips usam altura flexível com quebra de palavras, mantendo textos extensos integralmente visíveis.
- Tópicos semanticamente equivalentes (ex.: `HTTP` / `Protocolo HTTP`, `RAM` / `Memória RAM`) continuam consolidados pela normalização local determinística (`canonicalizeTopicLabel`), sem chamada de IA por aluno/tentativa.
- O botão **"Ir para revisão"** foi removido dos cards de assunto (a navegação para Revisão das Questões continua no rodapé da aba e na aba própria).
- Antes dos cards há um texto explicativo fixo informando que os tópicos vêm das questões sem êxito e devem ser revisados antes de nova tentativa.
- Questões anuladas continuam fora do diagnóstico por tópico.

### Meus Resultados

- A página `/meus-resultados` exibe, abaixo do título, texto explicando que o resultado mostrado é o da **primeira tentativa completa** (resultado oficial), que ela é o retrato mais fiel do desempenho inicial e que tentativas seguintes servem para revisão/treinamento sem substituir o histórico.

### Arquivos da entrega

```text
app/api/student/simulados/[id]/resultado/route.ts
app/api/student/jornadas/[id]/route.ts
app/meus-simulados/[id]/page-client.tsx
app/meus-simulados/[id]/resultado/page.tsx
app/meus-simulados/[id]/resultado/page-client.tsx
app/meus-resultados/page-client.tsx
```

Nenhuma migration foi criada ou alterada nesta entrega.

---

## Atualização 2026-07-16 — Modal "Nossas corujas estão reunidas montando seu feedback"

**Etapa intermediária pós-finalização.** Entre a exibição dos TopCoins ganhos e a apresentação do feedback, a página `/meus-simulados/[id]/resultado` exibe um modal premium de preparação quando (e somente quando) é aberta com `attemptId` na URL — ou seja, apenas no fluxo da tentativa recém-finalizada. Acessos oficiais (Meus Resultados, Jornada, link direto sem `attemptId`) não exibem o modal.

Fluxo oficial:

```text
Finalização do simulado
→ cálculo e persistência da tentativa (inalterados)
→ modal de TopCoins ganhos (inalterado)
→ redirect para /meus-simulados/[id]/resultado?attemptId=...
→ modal "Nossas corujas estão reunidas montando seu feedback" (contagem 10 → 0)
→ fechamento automático imediato no zero
→ feedback da tentativa recém-finalizada
```

Regras implementadas (componente local `FeedbackPreparingModal` em `app/meus-simulados/[id]/resultado/page-client.tsx`):

- Título oficial em duas linhas e texto complementar exatos da especificação; frase "Seu feedback estará pronto em X segundos" com singular automático em "1 segundo".
- Contagem regressiva de **10 até 0** (ajustada de 5 para 10 segundos em 2026-07-16, constante `FEEDBACK_COUNTDOWN_SECONDS`), um passo por segundo (`setTimeout` encadeado com limpeza no cleanup); ao chegar a zero o modal desmonta imediatamente, com transição de saída de ~200 ms via `AnimatePresence` — sem clique, sem overlay residual, sem bloqueio de rolagem e sem timers vazando.
- Visual premium clean: overlay escuro com blur, card branco com degradê quente, barra superior laranja, três corujinhas animadas em bounce, anel SVG de progresso que esvazia de forma contínua e número central com troca animada.
- A contagem roda **enquanto** a API de resultado carrega por baixo (o fetch começa junto com a montagem da página) — nenhuma chamada de backend foi atrasada e nenhuma chamada nova de IA foi criada.
- Nada mais mudou: cálculo de TC, regras de tentativas, resultado oficial da primeira tentativa, abas do resultado, Sidebar/Header/layout global permanecem intactos.

Nenhuma migration foi criada ou alterada.
