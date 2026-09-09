# Sprint Resultados — Documentação Técnica, Funcional e Pedagógica

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

## Rastreamento do vídeo de correção — 2026-08-18

- A etapa **Vídeo de Correção** preserva o desenho existente e passa a medir, sem indicador visual para o aluno, os intervalos efetivamente reproduzidos em vídeo HTML5 direto, YouTube e Vimeo.
- Saltos maiores que dois segundos são tratados como seek e não entram na cobertura. Intervalos sobrepostos são unidos no servidor, portanto rever o mesmo trecho não aumenta artificialmente o progresso.
- A cobertura é cumulativa entre acessos e tentativas do mesmo aluno. O status administrativo torna-se **Assistiu** exatamente ao atingir 20% da duração do vídeo atual e não regride depois disso.
- A identidade normalizada distingue o conteúdo atual por provedor e identificador; trocar o vídeo invalida a evidência anterior para o novo conteúdo. Parâmetros transitórios de URLs diretas não integram a identidade.
- Loom, Google Drive e iframe genérico continuam reproduzíveis, mas permanecem sem tracking por não oferecerem telemetria confiável na implementação atual.
- O endpoint `POST /api/student/simulados/[id]/correction-video-progress` deriva o aluno do token validado, exige uma tentativa concluída do próprio aluno e calcula a cobertura no servidor a partir de intervalos validados.
- A migration `supabase/migrations/20260818153000_create_correction_video_progress.sql` cria a persistência por aluno, simulado e identidade do vídeo. Em 2026-08-18, o responsável confirmou sua execução manual no Supabase operacional; nenhuma migration foi executada pelo agente durante a etapa de fechamento.

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
- **Atualização 2026-08-24 — Simulados de Evento com resultado bloqueado passam a aparecer:** ver `docs/Sprint-evento-de-simulado.md`, seção 89. A página deixou de tratar "resultado bloqueado" como "resultado inexistente" — o item aparece com contexto "Evento de Simulado" + nome do Evento e badge "Resultado aguardando liberação" (sem nota, sem link), passando para "Ver resultado" assim que `result_released_at` é definido. Mesma tentativa "oficial" usada por `GET /api/student/simulados/[id]/resultado` sem `attemptId` (primeira `completed` com `counts_toward_limit=true`), agora também usada para decidir a inclusão de Eventos nesta listagem.
- **Atualização 2026-08-25 — Pipeline completo de Evento liberado:** a rota oficial de resultado passou a carregar o Simulado histórico pela tentativa contextual e a tratar `result_released_at` como autorização para gabarito, Desempenho por Assunto e Revisão das Questões no contexto de Evento. Jornada e avulso preservam `show_answer_key_on_finish`. Ver `docs/Sprint-evento-de-simulado.md`, seção 94.

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

**Etapa intermediária de apresentação.** A página `/meus-simulados/[id]/resultado` exibe o modal premium de preparação em dois contextos explícitos: com `attemptId`, no fluxo da tentativa recém-finalizada; ou com `event + releasedNotification=1`, quando o aluno chega pelo botão **Ver Agora** da notificação interna de liberação posterior do Evento. Acessos oficiais comuns por Meus Resultados, Jornada ou link direto sem esses marcadores continuam abrindo o resultado sem a etapa intermediária.

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

Fluxo da liberação posterior de Evento, implementado em 2026-08-28:

```text
Professor/Admin libera o resultado antes bloqueado
→ notificação interna individual
→ aluno clica em Ver Agora
→ resultado oficial contextual é carregado com ?event=...&releasedNotification=1
→ modal de preparação (contagem 10 → 0)
→ TopCoinRewardModal com o ganho já persistido da tentativa oficial
→ resultado oficial do Evento
```

Nesse segundo fluxo, `releasedNotification` controla somente a experiência visual. A API continua resolvendo a tentativa oficial pelo contexto do Evento, valida `result_released_at` no servidor e retorna `earned_topcoins` por `attempt_id + student_id`. Nenhum TopCoin é recalculado ou concedido novamente.

Regras implementadas (componente local `FeedbackPreparingModal` em `app/meus-simulados/[id]/resultado/page-client.tsx`):

- Título oficial em duas linhas e texto complementar exatos da especificação; frase "Seu feedback estará pronto em X segundos" com singular automático em "1 segundo".
- Contagem regressiva de **10 até 0** (ajustada de 5 para 10 segundos em 2026-07-16, constante `FEEDBACK_COUNTDOWN_SECONDS`), um passo por segundo (`setTimeout` encadeado com limpeza no cleanup); ao chegar a zero o modal desmonta imediatamente, com transição de saída de ~200 ms via `AnimatePresence` — sem clique, sem overlay residual, sem bloqueio de rolagem e sem timers vazando.
- Visual premium clean: overlay escuro com blur, card branco com degradê quente, barra superior laranja, três corujinhas animadas em bounce, anel SVG de progresso que esvazia de forma contínua e número central com troca animada.
- A contagem roda **enquanto** a API de resultado carrega por baixo (o fetch começa junto com a montagem da página) — nenhuma chamada de backend foi atrasada e nenhuma chamada nova de IA foi criada.
- Nada mais mudou: cálculo de TC, regras de tentativas, resultado oficial da primeira tentativa e abas do resultado permanecem intactos. O `AppShell` apenas acrescenta `releasedNotification=1` à URL interna depois de marcar a notificação como lida.

Nenhuma migration foi criada ou alterada.

## Resultado oficial de Evento: tentativa consumida ≠ tentativa oficial (correção estrutural, 2026-09-06)

O resultado oficial do Evento deriva sempre da **primeira tentativa válida contextual**: `status = completed` e `counts_toward_limit = true`, escopada por `event_participant_id`. Isso não é uma regra nova — é a mesma já usada pela rota de resultado do Simulado (seção acima, para Jornada/avulso); a diferença é que, para Evento, ela é persistida em `simulado_event_participants.representative_attempt_id` em vez de recalculada a cada leitura.

Um bug estrutural (corrigido nesta entrega — detalhes técnicos em `docs/Sprint-evento-de-simulado.md`, seção "Bug estrutural corrigido — tentativa representativa") gravava essa referência já na criação da tentativa, misturando os dois conceitos:

- **Tentativa consumida:** conta no `max_attempts` assim que iniciada com `counts_toward_limit = true` — `in_progress`, `disqualified`, `expired` e `abandoned` todas consomem. Isso nunca mudou.
- **Tentativa oficial (resultado):** só é gerada quando a tentativa atinge `completed` + `counts_toward_limit = true`. Uma tentativa pode consumir o limite sem nunca virar resultado oficial.

Depois da correção, `representative_attempt_id` só é consolidado no momento do `submit`, e nunca por uma tentativa que apenas consumiu o limite sem concluir.

## Anulação, desanulação e alteração de gabarito — reprocessamento determinístico (2026-09-06)

### Contradição documental resolvida

Havia uma afirmação genérica de que `result_snapshot` existe "para que edições futuras nas questões não alterem resultados históricos" (`AGENTS.md`, `docs/Sprint-simulados.md`) enquanto `docs/modules/MASTER_SIMULADOS.md` (seções 3.18–3.21) sempre previu reprocessamento obrigatório por anulação/gabarito. **Regra final, sem contradição:**

| Ação | Propaga | Recalcula |
|---|---|---|
| Editar enunciado/comentário/explicação/formatação/assunto/banca/órgão/metadados | Não (fora de scoring) | Não |
| Alterar gabarito no Banco (`questions.correct_alternative_label`) | Sim — todos os Simulados que usam essa `question_id` | Sim |
| Anular questão no Banco (`questions.status = annulled`) | Não — é só um alerta editorial | Não |
| Desanular questão no Banco | Não | Não |
| Anular questão no Simulado (`simulado_questions.status = annulled`) | Sim — só aquele Simulado (todos os contextos: Evento/Jornada/avulso) | Sim |
| Desanular questão no Simulado | Sim — só aquele Simulado | Sim |

`result_snapshot` continua imutável para as edições editoriais comuns (linha 1 da matriz) — a afirmação original só estava incompleta, não errada; as 3 linhas de exceção (gabarito, anular, desanular no Simulado) sempre reprocessam e **reescrevem** o snapshot da tentativa afetada (nunca criam uma tentativa nova nem apagam a original).

### Banco ≠ Simulado

`questions.status` (Banco de Questões) é editorial e nunca propaga automaticamente para `simulado_questions.status` (vínculo operacional que efetivamente controla pontuação/resposta/reprocessamento) — nem no sentido Banco→Simulado nem Simulado→Banco. O Banco de Questões mostra apenas um alerta informativo ("anulada em N simulados"), derivado da contagem real de `simulado_questions.status = 'annulled'` para aquela `question_id` — nunca grava nada a partir disso.

### Garantia contra dupla bonificação (fonte: `lib/simuladoScoring.ts`)

O reprocessamento **nunca** soma/subtrai em cima do resultado anterior (`score = score + pontos` está proibido). Toda vez que uma questão é anulada, desanulada, ou tem o gabarito alterado, o resultado inteiro da tentativa é **reconstruído do zero** a partir de três fontes ao vivo — nunca do estado anterior:

1. a resposta originalmente selecionada pelo aluno (`simulado_answers.selected_alternative_id`/`selected_alternative_label`, nunca alterada pelo reprocessamento);
2. o gabarito vigente (`questions.correct_alternative_label` / `question_alternatives.is_correct`, sempre lidos ao vivo);
3. o status vigente do vínculo (`simulado_questions.status`).

`is_correct` armazenado em `simulado_answers` é tratado como **estado derivado/materializado, nunca como fonte de verdade** — o motor de correção nem aceita esse campo como parâmetro (`lib/simuladoScoring.ts` não tem um argumento `isCorrect`). Isso é o que torna a operação idempotente (anular duas vezes = mesmo resultado de anular uma vez) e o que impede que uma correção manual de dados anterior — que só altera `is_correct` sem alterar a resposta selecionada — seja contabilizada de novo quando a mesma questão for oficialmente anulada depois: o motor nunca vê o `is_correct` antigo, só a resposta original e o gabarito/status vigentes.

Validado com o caso real do incidente anterior à esta Sprint (questão `ET3582`, Evento "3º Simulado de Processo Civil"): um aluno respondeu "D", gabarito é "E" (originalmente errada); uma correção manual de dados creditou o ponto (`is_correct = true`) antes desta funcionalidade existir. Reprocessado pelo motor novo (teste automatizado em `tests/simulado-scoring/simulado-scoring.spec.ts`): anular a questão produz o mesmo score que a correção manual já havia produzido (sem duplicar); desanular depois reverte corretamente para "errada", porque o motor volta a comparar a resposta original ("D") com o gabarito vigente ("E") — nunca herda o `is_correct = true` antigo.

### TopCoins

Reconciliados via `resyncTopCoinEarnings()` (`app/lib/server/topcoinsSync.ts`, não alterado) — a mesma função já usada por qualquer alteração de tentativas, que recalcula do zero (delete + insert) a partir de `correct_count` atual. Chamá-la depois de corrigir `simulado_results.correct_count` produz o valor certo sem duplicar, pelo mesmo motivo do score: a função nunca soma em cima do estado anterior.

### Notificação ao aluno

Reaproveita `student_notifications` (mesma tabela de `event_result_released`, `docs/Sprint-evento-de-simulado.md` seção 32) com três tipos novos: `question_annulled_result_changed`, `question_reactivated_result_changed`, `answer_key_changed_result_changed`. Só é criada quando o resultado do aluno de fato mudou (score OU qualquer contador — correto/errado/branco/anulado — diferente do valor anterior), mesmo quando o score final é igual (ex.: uma questão que já estava certa migra de `correct_count` para `annulled_count` sem mudar o score, mas isso já conta como alteração de resultado exibido ao aluno). `AppShell` generalizado para reconhecer os 4 tipos (o antigo + os 3 novos) no mesmo modal — sem sistema de notificação paralelo.

### Atomicidade, concorrência e idempotência recuperável (2026-09-06, fechamento)

**Decisão de arquitetura registrada:** avaliamos envolver a operação inteira (mudança de status + recálculo de N tentativas + snapshot + auditoria + notificação) numa única transação Postgres via RPC. Essa transação só seria genuína numa **única chamada** ao banco — e, como o Supabase usa connection pooling (PgBouncer em modo transaction), um lock de sessão obtido numa chamada RPC não é confiável entre duas chamadas separadas. Isso forçaria mover a fórmula de correção (`lib/simuladoScoring.ts`) para dentro do SQL (PL/pgSQL), criando uma segunda implementação da regra de negócio mantida manualmente sincronizada com o TypeScript — risco real de divergência futura, e impossível de testar de verdade nesta entrega (exigiria aplicar uma migration, fora do escopo autorizado). **Decisão (confirmada explicitamente): não duplicar a regra de scoring em SQL.** Em vez de atomicidade rígida, a operação é **serializada de forma real + idempotente/recuperável**:

- **Serialização real do toggle de status:** `simulado_questions.status` só muda via `UPDATE ... WHERE status = <valor lido>` (compare-and-swap). O Postgres serializa nativamente duas escritas concorrentes contra a mesma linha (garantia MVCC padrão, sem lock explícito necessário) — a primeira a commitar vence; a segunda, ao reavaliar o `WHERE` contra o valor já commitado, não encontra a linha. **Correção aplicada nesta entrega:** o código antes não verificava se o `UPDATE` de fato afetou uma linha (`setSimuladoQuestionAnnulment`, `lib/server/simuladoQuestionReprocessing.ts`) — a requisição perdedora da corrida acreditaria erroneamente que aplicou a transição. Corrigido com `.select("id").maybeSingle()` no próprio `UPDATE`: se vier `null`, a requisição perdeu a corrida e recebe uma mensagem clara pedindo para recarregar, sem reprocessar nada.
- **Idempotência recuperável no recálculo:** o loop de reprocessamento por tentativa não está numa transação única, mas cada passo é individualmente seguro e o algoritmo inteiro é idempotente (comprovado em `tests/simulado-scoring/`). Se o processo cair no meio, o pior cenário é "algumas tentativas ainda não recalculadas" — nunca um dado incorreto — e basta reexecutar a mesma operação (reabrir e clicar anular/desanular de novo, ou repetir a chamada de gabarito) para completá-la; tentativas já corrigidas são detectadas como inalteradas (`scoreChanged = false`) e puladas sem reprocessar de novo.
- **TopCoins fora da transação, mas seguro:** `resyncTopCoinEarnings()` roda depois do reprocessamento principal (chamada de rede separada, código já existente/idempotente — delete + insert a partir do `correct_count` já commitado). Se falhar isoladamente, os resultados em `simulado_results` já estão corretos e duráveis; chamar a mesma função de novo mais tarde reconcilia sem duplicar nada.

**Testado por execução real (não apenas leitura de código):** `tests/simulado-question-annulment/concurrency.spec.ts` — simulação fiel (documentada como tal) da semântica de `UPDATE` condicional do Postgres, com duas chamadas concorrentes via `Promise.all` e interleaving forçado no pior caso (ambas leem o mesmo estado antes de qualquer uma escrever):
- duas anulações simultâneas → exatamente uma vence, estado final único;
- duas desanulações simultâneas → mesma garantia;
- anular × desanular a partir do mesmo snapshot lido → resultado determinístico (uma delas, por definição, já pede o estado atual e é rejeitada como no-op antes de qualquer escrita — não há disputa real possível entre alvos opostos a partir do mesmo snapshot);
- 10 repetições da corrida sem nenhum caso de dois vencedores.

Testes de correspondência confirmam que essa simulação usa exatamente a mesma condição (`'.eq("status", relation.status)'` + checagem de linhas afetadas) do código real.

### Ranking do Professor reflete o reprocessamento (sem cache)

O ranking é derivado, a cada carregamento, diretamente de `simulado_results` (via `representative_attempt_id` de cada participante) — nunca de um valor persistido separadamente ou cacheado. Como o reprocessamento já reescreve `simulado_results.correct_count`/`time_spent_seconds` do participante afetado, e a dashboard do Professor faz polling a cada 10s (`docs/Sprint-evento-de-simulado.md`, seção 95), a reordenação aparece automaticamente, sem qualquer código adicional. Critério real (auditado, não presumido): acertos decrescentes → tempo total crescente → nome (pt-BR); ranking competitivo (1º, 2º, 2º, 4º) quando há empate exato em acertos **e** tempo.

A função `rankedParticipants()` foi extraída de `app/professor/eventos/[id]/page-client.tsx` para `lib/eventRanking.ts` (lógica idêntica, só movida — necessário para ser testável por execução real, já que o arquivo original é `"use client"` com imports pesados). Testado em `tests/simulado-question-annulment/ranking.spec.ts`: cenário completo do pedido (aluno A=8, aluno B=7 → questão anulada eleva B para 8 → reordena por tempo; desanular reverte), empate real (mesmo acertos e tempo → `rank_tied=true`, ranking competitivo), empate só em acertos com tempos diferentes (não é tratado como empate), participante sem resultado (não quebra o ranking dos demais) e idempotência (mesma entrada produz sempre a mesma saída).

Nenhum outro ranking de desempenho de aluno existe no sistema — auditado por busca em todo `app/`: as únicas outras ocorrências de "rank"/"ranking" são posição de card de Evento (`/meus-eventos`, prioridade de exibição, não desempenho) e numeração de card de assunto no relatório Raio-X (`/admin/raio-x-provas`, não é ranking de aluno) — nenhuma das duas precisou de alteração.

---

## Fechamento cirúrgico — notificação por revisão + fim do bypass da rota antiga (2026-09-07)

Dois pontos identificados como não aceitáveis na entrega de 2026-09-06 foram corrigidos. **Nenhum outro comportamento foi tocado** — `lib/simuladoScoring.ts` (motor de correção), a serialização por compare-and-swap, `resyncTopCoinEarnings()`, o ranking e o alerta do Banco permanecem exatamente como estavam.

### Ponto 1 — identidade de revisão na notificação

**O gap real:** a chave de idempotência da notificação era `(student_id, type, reference_id)`, com `reference_id = attempt.id`. Isso já distinguia corretamente um retry (upsert na mesma linha, sem duplicar) de uma mudança de **tipo** diferente (anular vs. desanular vs. gabarito, cada um com seu próprio `type`). O que faltava: duas revisões **do mesmo tipo** sobre a mesma tentativa — por exemplo anular a questão X e, depois, anular a questão Y no mesmo Simulado — colidiam no mesmo `(student_id, "question_annulled_result_changed", attempt.id)` e a segunda `upsert` **sobrescrevia silenciosamente** a primeira: dois eventos reais, uma notificação só.

**Correção — identidade de revisão persistida, nunca um timestamp gerado a cada tentativa:**

| Evento | Onde a identidade é gerada e persistida | Quando muda |
|---|---|---|
| Anular/desanular (`setSimuladoQuestionAnnulment`) | `simulado_questions.status_revision_id` (`randomUUID()`, gravado no MESMO `UPDATE` condicional que já faz o compare-and-swap do status) | A cada transição de status bem-sucedida (as duas direções) |
| Mudança de gabarito (`reprocessAfterAnswerKeyChange`) | `questions.answer_key_revision_id` (`randomUUID()`, gravado no MESMO `UPDATE` que já grava `correct_alternative_label`, só quando o valor de fato muda) | A cada mudança real de gabarito |

A identidade é gerada **uma vez, no momento exato da transição/mudança real** (nunca dentro do loop de `reprocessSimulado`, que só recebe `context.revisionId` pronto e nunca chama `randomUUID()` — confirmado por teste). Um retry de `reprocessSimulado`/`reprocessAfterAnswerKeyChange` para a MESMA revisão (o processo caiu no meio e foi chamado de novo, sem que o status/gabarito tenha mudado outra vez) relê o mesmo valor persistido — nunca gera um novo.

`student_notifications.revision_id` (migration `20260907140000_notification_revision_identity.sql`) entra na chave de unicidade: `(student_id, type, reference_id, revision_id)`. `reference_id` continua sendo `attempt.id` (não mudou de significado); `revision_id` é o que diferencia:
- **retry da mesma revisão** → mesmo `revision_id` → `upsert` colide → 1 notificação;
- **revisão futura distinta** (mesmo `type` ou não) → `revision_id` novo → linha nova → notificação nova.

Tipos sem conceito de revisão (`event_result_released`, único outro consumidor da tabela) usam uma coluna `NOT NULL DEFAULT` sentinela (UUID zero) em vez de `NULL` — se fosse `NULL`, a semântica padrão do Postgres (`NULL` nunca é igual a `NULL` numa constraint `UNIQUE`) faria cada notificação desse tipo virar uma linha nova a cada liberação de resultado, quebrando a idempotência que já existia. `lib/server/simuladoEvents.ts` foi atualizado só na string do `onConflict` (de 3 para 4 colunas, para bater com o índice novo) — continua sem passar `revision_id`, herdando a sentinela automaticamente. Comportamento desse tipo **inalterado**, confirmado por teste.

**Limitação que existia antes desta correção e que foi eliminada:** anular duas questões diferentes (mesmo `type`) na mesma tentativa não perde mais a primeira notificação.

**Testes (execução real):** `tests/simulado-question-annulment/notification-revision.spec.ts` — retry da mesma revisão (1 notificação), anulação seguida de desanulação (2 notificações distintas), anulação de X seguida de anulação de Y no mesmo Simulado/tentativa (2 notificações — o cenário exato do gap original), gabarito alterado depois (nova notificação), retry após falha parcial simulada (não duplica o que já foi processado, completa só o que faltava), e a sentinela de `event_result_released` preservando o comportamento anterior. Testes de correspondência confirmam que a simulação usa a mesma migration/chave do código real.

### Ponto 2 — rota antiga não contorna mais a reconciliação

**O gap real:** `PUT /api/admin/simulados/[id]/questions` (edição em lote da grade de questões do Simulado) escrevia `simulado_questions.status` num `UPDATE` direto, sem compare-and-swap e sem chamar `reprocessSimulado` — se usada num Simulado que já tivesse resultados, a mudança de status ficava silenciosamente sem reconciliar.

**Correção — delega ao mesmo serviço central, não duplica a lógica:** o `UPDATE` que grava `order_number`/`points` (nunca afeta pontuação, continua direto) foi separado do campo `status`. Quando o item do lote pede um `status` diferente do atual, a rota chama `setSimuladoQuestionAnnulment()` — o MESMO serviço usado pelas rotas dedicadas de Admin e Professor — para aquele vínculo. Uma corrida perdida (`!outcome.ok`, ex.: outra ação já mudou o status entre a leitura e a escrita) não derruba o salvamento em lote inteiro: vira um aviso em `status_change_warnings` na resposta, e o status já reconciliado por quem venceu a corrida prevalece — nunca um `UPDATE` por fora do serviço central.

**Pré-aplicação preservada, sem tratamento especial:** `reprocessSimulado()` já retorna cedo (sem nenhuma tentativa/consulta pesada) quando o Simulado ainda não tem questões ou nenhuma tentativa `completed` — então rotear toda mudança de status por `setSimuladoQuestionAnnulment`, mesmo durante a montagem do Simulado (antes de qualquer aluno responder), não introduz custo real nem N+1. Criação de vínculo **novo** (via `POST` ou como linha nova dentro do próprio `PUT`) continua podendo definir o status inicial diretamente no `INSERT` — não há resultado prévio contra o qual reconciliar uma linha que ainda não existia.

**Auditoria (item 18 do pedido) — busca real no repositório, não uma lista mantida à mão:** todo arquivo sob `app/`/`lib/` que referencia `simulado_questions` foi varrido por um `.update(...)` encadeado diretamente em `.from("simulado_questions")` contendo `status:`. Resultado: só o motor central (`lib/server/simuladoQuestionReprocessing.ts`) escreve `status` fora de um `INSERT` de vínculo novo. Nenhum outro ponto de escrita restante.

**Testes:** `tests/simulado-question-annulment/legacy-route-bypass.spec.ts` — confirma a delegação, a separação order/points × status, o tratamento de corrida perdida como aviso (não erro fatal), o custo zero em pré-aplicação, e a varredura global por regex sobre todos os arquivos `.ts`/`.tsx` de `app/`/`lib/`.

### Validação desta rodada

`npx tsc --noEmit`: limpo. `npm run build`: limpo (mesmas rotas de antes, incluindo as duas de anulação). `eslint` nos arquivos tocados nesta rodada: 0 problemas (a contagem pré-existente do resto do repositório, 484 problemas, é anterior a esta Sprint e não muda). Regressão: as 5 suítes já existentes desta Sprint (concorrência, scoring, ranking, anulação estrutural, notificação — 47 testes) + as 2 novas (`notification-revision`, `legacy-route-bypass` — 15 testes) + as 5 suítes de Evento/professor pedidas explicitamente para reconfirmação (`event-representative-attempt`, `event-operations`, `event-acquisition-session`, `event-professor-assignment`, `professor-management` — 73 testes) = **135/135 passando**, nenhuma regressão.

**Nota corrigida em 2026-09-07 (ver seção seguinte):** a frase que estava aqui ("não existe pending_reconciliation_at nesta arquitetura") descrevia o estado do código nesta data, mas não era uma decisão de design — era um bloqueador real (uma queda de processo no meio de `reprocessSimulado`, depois de o status já ter mudado, deixava resultados parcialmente reconciliados sem nenhuma forma objetiva de detectar ou retomar). Foi corrigido — ver "Marcador objetivo de reconciliação pendente" abaixo.

Nenhuma migration foi aplicada — `supabase/migrations/20260907140000_notification_revision_identity.sql` foi criada e commitada localmente, não executada.

---

## Marcador objetivo de reconciliação pendente — recuperação de falha parcial (2026-09-07)

### O bloqueador real

Até esta correção, `reprocessSimulado()` rodava um `for` sem `try/catch` por tentativa: se a conexão/processo caísse na tentativa 38 de 100, a transição de `simulado_questions.status` **já tinha comitado** (o compare-and-swap é a primeira escrita, antes do reprocessamento), mas as tentativas 38–100 ficavam com o resultado antigo — e nenhuma coluna registrava isso. Pior: uma nova tentativa de anular a MESMA questão era rejeitada de cara como *"esta questão já está anulada"* (a checagem de no-op não distinguia "já anulada e reconciliada" de "já anulada mas com reconciliação incompleta"), então não havia sequer como reexecutar pela rota normal.

### A correção — reaproveitando `lib/simuladoScoring.ts` como fonte única

**Nenhum motor de scoring foi duplicado.** A correção é inteiramente estrutural, dentro de `lib/server/simuladoQuestionReprocessing.ts` — que continua chamando `computeSimuladoAttemptResult()` (`lib/simuladoScoring.ts`) exatamente como antes:

- **`simulado_questions.pending_reconciliation_at`** (coluna nova, migration `20260907130000_simulado_question_annulment_reconciliation.sql`) — marcado (`now()`) no MESMO `UPDATE` que já faz o compare-and-swap do status, junto com `status_revision_id`. Uma pendência agora se identifica por um único `SELECT ... WHERE pending_reconciliation_at IS NOT NULL` — nunca por memória, log, ou o Admin lembrar de agir.
- **Reaproveita `status_revision_id`** (já existente desde `20260907140000_notification_revision_identity.sql`, criado no fechamento anterior desta mesma Sprint): a revisão que fica pendente é a mesma que identifica as notificações — os dois conceitos foram integrados num só, como pedido explicitamente ("11. REVISION_ID" do pedido).
- **`processPendingReconciliationForSimulado(supabase, simuladoId)`** (nova) — encontra vínculos pendentes, reivindica cada um por compare-and-swap (pelo valor exato de `pending_reconciliation_at` lido, não só "não nulo" — protege contra duas retomadas concorrentes, seção 35 do pedido), chama `reprocessSimulado()` reaproveitando o MESMO `status_revision_id` (nunca gera um novo), e só limpa a pendência depois que `reprocessSimulado()` retornar sem lançar exceção. Se `reprocessSimulado()` falhar de novo, a pendência permanece — detectável e retomável na próxima chamada.
- **`getPendingReconciliationSummary(supabase, simuladoId?)`** (nova) — quantas pendências, quais questões, desde quando, qual `status_revision_id`.
- **`setSimuladoQuestionAnnulment()` ganhou dois comportamentos**: (1) se o vínculo já tem uma pendência de uma transição anterior, tenta concluí-la automaticamente (`processPendingReconciliationForSimulado`) *antes* de aplicar a nova transição — nenhuma revisão nova é aceita em cima de uma antiga inconclusa (seção 19 do pedido); se a tentativa automática também falhar, a nova transição é rejeitada com uma mensagem clara. (2) se `reprocessSimulado()` falhar depois que o status já mudou, a função não propaga o erro como falha genérica — retorna `{ ok: true, pendingReconciliation: true }`: o status mudou de verdade, só o recálculo ficou pendente, recuperável.
- **Endpoint manual, Admin-only**: `GET`/`POST /api/admin/simulados/[id]/reconciliation` — consulta e retoma pendências, para o caso em que a tentativa automática acima também não conseguir (ex.: indisponibilidade momentânea do banco).

### Bug real encontrado e corrigido ao escrever o teste de falha parcial

Escrever o teste de "falha determinística após a tentativa 37 de 100" (abaixo) expôs um segundo problema, mais sutil, no código já existente: `resyncTopCoinEarnings()` era chamado num loop **separado, ao final** de `reprocessSimulado()`, iterando só sobre os alunos cujo resultado mudou NAQUELA passagem. Se o processo caísse durante o loop principal (antes de alcançar esse loop de TopCoins), os alunos já corrigidos ficavam com TopCoins desatualizados — e um retry posterior nunca mais os resincronizaria, porque `scoreChanged` já dava `false` para eles (o resultado já estava correto) e o retry só resincroniza quem mudou NA PASSAGEM DELE. Ou seja: um subconjunto de alunos podia ficar com TopCoins permanentemente errados após uma falha parcial, mesmo com a nota 100% correta.

**Corrigido:** `resyncTopCoinEarnings()` passou a ser chamado **dentro** do loop por tentativa (deduplicado por aluno via um `Set` local), antes do ponto onde uma falha pode interromper aquela tentativa especificamente — não mais um loop separado ao final. `resyncTopCoinEarnings()` em si **não foi alterado** (continua idempotente, delete+insert do zero a partir de `correct_count` vigente) — só o *lugar* de onde é chamado.

### Testado por execução real — 100 tentativas, falha determinística na 37ª

`tests/simulado-question-annulment/reconciliation-recovery.spec.ts` — transpila e executa (`vm` + `ts.transpileModule`, mesma limitação de `"server-only"` documentada em `concurrency.spec.ts`) o motor real com um Supabase falso em memória (mesma semântica de `UPDATE ... WHERE` fiel ao Postgres já usada em `notification-revision.spec.ts`), `resyncTopCoinEarnings`/`logActivity` substituídos por stubs que só registram chamadas:

- **A:** execução completa sem falha (baseline) — 100/100 processados, sem pendência, TopCoins/notificação 1x por aluno.
- **B–P (combinado):** falha injetada determinística na 37ª tentativa de 100 — status já `annulled`, `pending_reconciliation_at` preenchido, exatamente 37 resultados corrigidos e 63 ainda antigos (verificado por `SELECT`, nunca por inferência), `getPendingReconciliationSummary` detecta a pendência com o `status_revision_id` certo; retry (`processPendingReconciliationForSimulado`) completa os 100, limpa a pendência, reaproveita o MESMO `status_revision_id`; estado final byte-a-byte idêntico ao baseline (score, `correct_count`, `annulled_count`); nenhum score duplicado; nenhuma notificação duplicada (mesma `revision_id` em todas, nenhum `(student_id, reference_id)` repetido); todo aluno cujo resultado foi corrigido também foi resincronizado — a prova de regressão do bug de TopCoins acima.
- **J:** desanulação depois da recuperação gera uma revisão nova e notificações novas, distintas da anulação.
- **K:** uma transição contraditória (desanular) enquanto a anulação anterior está pendente é bloqueada com uma mensagem explícita; assim que a falha para de ocorrer, a PRÓXIMA tentativa da mesma transição já destrava sozinha (self-heal automático, sem endpoint manual).
- **X:** duas chamadas concorrentes de `processPendingReconciliationForSimulado` para o mesmo Simulado — só uma reconcilia de fato (a outra perde a corrida do compare-and-swap de reivindicação e não reprocessa nada), sem duplicar notificação nem TopCoins.

### Decisão de arquitetura reafirmada

A garantia continua sendo **serialização real (compare-and-swap) + scoring determinístico único em TypeScript (`lib/simuladoScoring.ts`) + idempotência + marcador objetivo de pendência + recuperação segura** — nunca uma transação Postgres monolítica, e nunca uma segunda implementação do scoring em SQL. "Reexecutar tudo" (todas as tentativas elegíveis do Simulado, não só as que faltavam) numa retomada é deliberado e aceitável (seção 14 do pedido): o motor é determinístico, então reprocessar uma tentativa já correta não a altera — só é um trabalho redundante, nunca incorreto.

### Validação desta rodada

`npx tsc --noEmit`: limpo. `npm run build`: limpo (mesmas rotas de antes + `GET`/`POST /api/admin/simulados/[id]/reconciliation`). `eslint` nos arquivos tocados nesta rodada: 0 problemas. Regressão: as suítes desta Sprint (67 testes: scoring, anulação estrutural, concorrência, ranking, notificação por revisão, rota antiga, **+ recovery**) + as 5 suítes de Evento/professor pedidas para reconfirmação (73 testes) = **140/140 passando**, nenhuma regressão.

Migrations pendentes desta Sprint (criadas, **nenhuma aplicada**): `20260907130000_simulado_question_annulment_reconciliation.sql` (nova nesta rodada — `pending_reconciliation_at` é o único campo estrutural realmente novo; o restante normaliza colunas já existentes desde a migration original da tabela) e `20260907140000_notification_revision_identity.sql` (do fechamento anterior). A ordem numérica (130000 antes de 140000, apesar de criada depois) é segura porque ambas usam `add column if not exists`/`create ... if not exists` — comutativas entre si, sem dependência de ordem de execução.

---

## Incidente de truncamento silencioso — carregamento incompleto de `simulado_answers` (2026-09-07)

### O que aconteceu, em produção, real

A migration `20260907130000` foi aplicada manualmente em produção e a questão `ET3582` (3º Simulado de Processo Civil) foi anulada uma única vez pela área do Professor. A transição de status funcionou corretamente (compare-and-swap, `status_revision_id` gerado, `pending_reconciliation_at` marcado e depois limpo com sucesso — nenhuma falha, nenhuma pendência). **Mas o reprocessamento produziu dados errados para 113 dos 135 resultados oficiais já liberados deste Simulado**, com reduções de até 10 pontos.

**Causa raiz, confirmada por auditoria direta do banco:** `reprocessSimulado()` buscava `simulado_answers` de todas as tentativas do Simulado numa única chamada, sem paginação:

```ts
supabase.from("simulado_answers").select(...).in("attempt_id", attemptIds)
```

Este Simulado tinha 135 tentativas oficiais × 12 questões ≈ 1620 linhas de resposta — acima do limite padrão de linhas por resposta do PostgREST/Supabase (`max_rows`, tipicamente 1000). A consulta foi **cortada silenciosamente, sem erro** (o Postgres nem chega a saber que só recebeu parte do que pediu — é o PostgREST que limita a resposta HTTP). Para toda resposta que ficou fora do corte, o motor não encontrou entrada no mapa de respostas e classificou a questão como **"em branco"** — mesmo com a resposta real, completa, presente em `simulado_answers`. A questão anulada (`ET3582`) em si sempre ficou correta (crédito integral, bonificação histórica preservada); o dano foi em **outras questões do mesmo Simulado**, sem relação com a anulação.

Auditoria confirmou: nenhuma invariante estrutural foi violada (`score ≤ max_score`, `percentage ≤ 100`, contadores somam o total de questões) — os números ficaram **consistentes entre si, só incorretos**, o que tornou o problema silencioso mesmo para quem olhasse cada resultado isoladamente.

### Por que isso não é o mesmo problema que a recuperação de falha parcial resolve

`pending_reconciliation_at`/CAS/idempotência por `revision_id` protegem contra o processo **cair no meio** do reprocessamento. Aqui o processo **terminou "com sucesso"** — não houve exceção, não houve falha de rede, não houve retry necessário do ponto de vista do mecanismo de recuperação. O bug estava em quais dados o motor sequer *enxergava*, não em uma interrupção do processamento.

### Correção — paginação explícita e determinística, nunca um limite mágico maior

`fetchAllPages()` (nova, privada, em `lib/server/simuladoQuestionReprocessing.ts`) pagina por `.range(from, to)` com `.order("id")` (chave primária — garante que nenhuma linha seja pulada nem duplicada entre páginas) até uma página voltar com menos que 1000 linhas, e confere o total acumulado contra o `count` exato que o Postgres relata na mesma consulta (`{ count: "exact" }`) — se algo ainda assim divergir, lança erro em vez de seguir com dado incompleto (a garantia de recuperação de falha parcial já existente cobre esse erro normalmente: `pending_reconciliation_at` continua marcado, detectável, retomável). Funciona para 100 linhas, 1.000, 20.000 ou qualquer volume futuro — não é "aumentar `.limit()`", é sempre paginar até esgotar. Aplicada às três consultas de `reprocessSimulado()` que escalam com o número de tentativas: `simulado_attempts`, `simulado_answers` e `simulado_results`.

**Distinção importante, auditada e preservada (`lib/simuladoScoring.ts` não foi tocado):** resposta ausente porque a linha existe no banco mas não coube na página é diferente de resposta ausente porque o aluno genuinamente deixou em branco — o modelo de dados já resolve isso: `POST .../attempts/[attemptId]/answers` só grava uma linha em `simulado_answers` quando o aluno realmente seleciona uma alternativa (confirmado em código); branco real nunca teve linha. A defesa de completude, portanto, não compara "tentativas × questões" (isso classificaria brancos reais como corrupção) — compara o total de linhas efetivamente carregadas contra o `count` exato do Postgres para o mesmo filtro, que é imune a essa ambiguidade.

### Reprocessar a MESMA revisão sem gerar uma nova (correção do incidente, ainda não executada em produção)

A revisão `e60acda3-428d-45c6-b669-f1bee17837ea` (a anulação real de `ET3582`) terminou formalmente (`pending_reconciliation_at = null`) com dado incorreto — não é um caso de retomada de pendência. `reconcileCurrentRevision()` (nova) cobre exatamente isso: reprocessa `reprocessSimulado()` reaproveitando um `status_revision_id` já existente, **sem** mudar `status` e **sem** gerar revisão nova — desde que o `status_revision_id` informado ainda seja, no momento da chamada, o vigente naquele vínculo (senão rejeita — protege contra reprocessar por engano uma revisão já superada por uma transição mais recente). Como a notificação e o changelog continuam chaveados pela revisão (não pela execução), reexecutar a mesma revisão depois de corrigida a paginação não duplica nada: os 135 avisos já existentes colidem no mesmo `(student_id, type, reference_id, revision_id)`.

Exposto Admin-only via o endpoint **já existente** `POST /api/admin/simulados/[id]/reconciliation` (nenhuma rota nova): quando o corpo inclui `simulado_question_id` + `expected_revision_id`, delega para `reconcileCurrentRevision()`; sem esses campos, continua o comportamento normal (retomar pendências). Decisão deliberada de não criar um endpoint novo para um caminho raro/incidente — reaproveita a superfície Admin-only já auditada.

### Testado por execução real, na MESMA escala do incidente

`tests/simulado-question-annulment/large-answer-set.spec.ts` — 135 tentativas × 12 questões = 1620 `simulado_answers`, motor real transpilado e executado (mesma limitação de `"server-only"` já documentada):
1. reproduz o bug controladamente: o padrão antigo (sem `.range()`) contra a mesma fixture retorna só 1000 de 1620 linhas;
2. o motor atual (`fetchAllPages`) carrega as 1620 completas — `blank_count` continua 0 para os 135, nenhum branco artificial;
3. tentativas nas posições 1, 50, 84, 85, 100, 135 (cruzando a fronteira de 1000 respostas, por volta da 83ª/84ª tentativa) conferidas individualmente: sempre 12 respostas reais consideradas;
4. bonificação histórica preservada para 6 alunos-teste espalhados pela fixture, incluindo perto da fronteira de página — sem duplicar, sem perder o crédito;
5. reexecutar a mesma revisão (`reconcileCurrentRevision`) na mesma escala é idempotente: `resultsChanged: 0` (nada muda de novo, porque já estava certo), notificações não dobram, status e revisão permanecem intactos.

Regressão completa: as suítes desta Sprint (70 testes: scoring, anulação estrutural, concorrência, ranking, notificação por revisão, rota antiga, recovery, **+ 3 de volume**) + as 5 suítes de Evento/professor (73 testes) = **143/143 passando**.

### Outras consultas de volume auditadas, não alteradas (fora do fluxo de reprocessamento)

Buscadas todas as consultas `.select().in(...)` sobre `simulado_answers`/`simulado_attempts`/`simulado_results`/`simulado_event_participants` no repositório. Duas categorias fora do escopo desta correção (mesma classe de risco teórico, mas não fazem parte do fluxo de reprocessamento, e a esta escala atual nenhuma delas passa de algumas centenas de linhas):
- `app/api/professor/events/[id]/route.ts:50-51` — dashboard do Modo Aula do Professor busca `simulado_answers`/`simulado_results` de todas as tentativas representativas de um Evento (mesmo padrão `.in("attempt_id", ...)` sem `.range()`); escalaria com o número de participantes × questões de um Evento muito grande.
- `lib/server/simuladoEvents.ts:172` (`releasePendingEventResults`) e `app/api/admin/events/[id]/participants/route.ts` — listam `simulado_event_participants` por evento, uma linha por pessoa (não multiplicado por questão); risco bem mais distante.
- `app/lib/server/topcoinsSync.ts` (`resyncTopCoinEarnings`) — auditada e **não** é risco: já é escopada por `student_id` + `simulado_id` (as tentativas de UM aluno em UM Simulado), nunca escala com o total de participantes.

Nenhuma dessas foi alterada — não fazem parte direta deste incidente. Registradas aqui para decisão futura, se a escala justificar.

### Estado dos dados de produção

**Nenhum dado de produção foi corrigido nesta rodada.** Os 135 resultados deste Simulado continuam com os números produzidos pelo incidente até que `reconcileCurrentRevision()` seja executado deliberadamente contra produção, em uma etapa controlada separada, depois desta correção estar revisada e no ar. `ET3582` permanece `annulled` (não foi desanulada como parte desta investigação/correção).

### Prova Professor

O caderno de prova em PDF gerado pelo Professor/Admin (a partir do Evento) não expõe gabarito: `SimuladoQuestionsPdf` (`app/lib/pdf/simulado-result-pdf.ts`) ganhou `showAnswerKey?: boolean`, gating todo o destaque de alternativa correta atrás de `highlightCorrect = showAnswerKey && alternative.is_correct`. O PDF do aluno (`downloadSimuladoResultPdf`) continua com `showAnswerKey: true`, sem nenhuma mudança de comportamento — a correção/resultado do aluno em si (`lib/simuladoScoring.ts`, reconciliação, `pending_reconciliation_at`) não foi tocada. Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seções 98 e 99.

### Ranking PDF

Exportação do Ranking oficial (mesma regra de `rankedParticipants()`) em PDF, dentro da aba Participantes do Professor. Não toca `lib/simuladoScoring.ts` nem recalcula `correct_count`/`display_score`/`time_spent_ms`/`owl_help_used_count`/`focus_violation_count` — consome exatamente os valores já consolidados. Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seção 99.

### Regra de classificação do Ranking — pontuação > coruja > advertências > tempo (2026-09-09)

`rankedParticipants()` passou a comparar, hierarquicamente: `display_score` (score oficial, o mesmo já exibido como "Nota" — não `correct_count`) → `owl_help_used_count` → `focus_violation_count` → `time_spent_ms`. Pontuação continua soberana. Nenhum dos quatro campos é recalculado — todos vêm já consolidados da tentativa oficial/representativa (`simulado_results`/`simulado_attempts`). Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seção 103.

### "Tópicos de maior dificuldade" no modal "Ver" do Ranking — mesma análise da tela de resultados do aluno (2026-09-09)

`normalizeTextKey`/`canonicalizeTopicLabel`/`addTopicRollup` — a lógica de canonicalização/deduplicação de tópicos já usada em "Tópicos para revisar" na tela de resultados do aluno (`app/meus-simulados/[id]/resultado/page-client.tsx`) — foram extraídas verbatim (sem reescrever) para `lib/topicDifficulty.ts`, que também ganhou `buildDifficultyTopics` (versão achatada, mesma regra de incidência de erro, sem agrupar por assunto). A tela de resultados do aluno passou a importar do módulo compartilhado em vez de definir localmente — comportamento do aluno inalterado. Questão anulada nunca conta como erro (mesma regra); status por questão (correta/errada/em branco) calculado do mesmo jeito. Não recalcula `correct_count`/`wrong_count`/`blank_count`/`annulled_count`/score em nenhum ponto. Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seção 104.

### Guia "Insights" do Professor — análise pedagógica coletiva por tópico, com suavização estatística k=2 (2026-09-09)

Nova 4ª aba na dashboard do Evento do Professor (`app/professor/eventos/[id]/page-client.tsx`), calculada por `lib/eventInsights.ts` (funções puras): dificuldade por questão `D_q = wrong/(correct+wrong)` (branco fora do denominador, anulada excluída), dificuldade bruta por tópico `D_t` (média simples, sem peso por volume de resposta), dificuldade global `D_global` (mesma regra), e dificuldade ajustada `D_adjusted = (n·D_t + k·D_global)/(n+k)`, k=2, usada para ordenar — `D_t` bruto continua sempre visível ao lado, nunca escondido. Reaproveita `canonicalizeTopicLabel` de `lib/topicDifficulty.ts` (seção 104) e o `questionStats` já calculado em `GET /api/professor/events/[id]/route.ts` (zero consultas novas). Resumo textual final ("O que merece revisão em aula") é determinístico, sem IA/API externa. Não altera scoring, resultados, TopCoins nem a regra de classificação do Ranking (seção 103). Detalhes completos, incluindo o exemplo numérico de suavização e a lista de arquivos/testes: `docs/Sprint-evento-de-simulado.md`, seção 105.

### Refinamento de UX da guia "Insights" — classificação simplificada, sem Mapa de domínio, questão em modal (2026-09-10)

Ajuste de apresentação sobre a guia "Insights" (seção anterior) — a matemática (D_q/D_t/D_global/D_adjusted, k=2) não mudou. A lista de tópicos deixou de mostrar a dificuldade "observada" ao lado da ajustada e os rótulos de confiança da amostra ("Evidência inicial"/"Confiança moderada"/"Confiança alta") — só a dificuldade ajustada é exibida agora, com uma classificação visual renomeada (Extrema/Alta/Média/Baixa, limiares 75/50/25% centralizados em `classifyTopicDifficultyBand()`). A lista "Questões mais difíceis" deixou de mostrar taxa de branco e passou a ser clicável: abre a questão completa (enunciado + alternativas) num modal de consulta que reaproveita `QuestionDisplayCard` (mesmo componente da aba Questões/revisão) e o mesmo `data.questions` já carregado — zero fetch novo, zero mudança de permissão. O bloco "Mapa de domínio" foi removido integralmente por decisão de clareza do usuário. Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seção 106.

### Correção da coleta de dados dos Insights — paginação completa e revalidação de status (2026-09-10)

Auditoria comprovou, no mesmo Evento do incidente `ET3582`, que `GET /api/professor/events/[id]` truncava silenciosamente `simulado_answers` (1587 reais, 1000 retornadas) por falta de paginação — mesma classe de bug do "Incidente de truncamento silencioso" (seção acima), agora corrigida também nesta rota via `fetchAllPages()` (extraída para o módulo compartilhado `lib/server/supabasePagination.ts`, reaproveitada por `lib/server/simuladoQuestionReprocessing.ts` e pela rota do Professor). Adicionalmente, a rota passou a revalidar o status da tentativa antes de incluí-la nos Insights (`completedRepresentativeAttemptIds`, estritamente `completed`) — defesa em profundidade contra `representative_attempt_id` histórico inconsistente (12 casos reais encontrados: 3 `in_progress`, 9 `disqualified`). A aba Questões/revisão (Modo Aula) manteve sua base operacional original, sem alteração. Nenhuma mudança em `lib/simuladoScoring.ts`. Detalhes completos: `docs/Sprint-evento-de-simulado.md`, seção 107.

### Atualização da base operacional (pré-commit, 2026-09-09)

A preservação da base antiga de Questões/revisão mencionada acima descreve a etapa anterior. A correção final usa conclusão válida ou tentativa ativa, deduplicada por aluno, sem alterar a base consolidada dos Insights ou resultados oficiais. Decisão completa e dívida histórica: `docs/Sprint-evento-de-simulado.md`, seção 109.

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

### Cross-referência — finalização (submit) agora atômica com o resultado (2026-09-10)

`simulado_results` e `simulado_attempts.status = "completed"` passaram a ser gravados na mesma transação (`complete_student_attempt`, `supabase/migrations/20260909170000_atomic_attempt_transitions.sql`) — antes eram dois passos TypeScript separados (INSERT do resultado, depois UPDATE da tentativa), com risco de ficar um sem o outro em caso de falha no segundo passo. `lib/simuladoScoring.ts` (motor de correção) não foi alterado — a transação só persiste um resultado já calculado em TypeScript. Concorrência otimista via `updated_at` esperado: se a tentativa mudou desde a leitura que alimentou o cálculo (resposta ou violação de foco concorrente), a transação rejeita e o cliente reenvia o submit, nunca gravando um resultado calculado sobre estado desatualizado. Detalhes completos: `docs/Sprint-simulados.md`, "Engine de tentativas blindada transacionalmente + fluxo de abandono".
