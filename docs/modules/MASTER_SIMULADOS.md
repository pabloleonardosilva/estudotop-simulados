# ARQUIVO MESTRE — MÓDULO SIMULADOS

**Produto:** EstudoTOP Simulados  
**Documento:** Arquitetura oficial consolidada do módulo de Simulados  
**Status:** Fonte oficial da verdade para desenvolvimento  
**Última revisão:** 2026-05-11  

Este documento define a arquitetura oficial do módulo de Simulados.

Ele consolida todas as decisões arquiteturais tomadas até aqui sobre simulados, tentativas, feedback instantâneo, anulação de questões, alteração de gabarito, reprocessamento, ranking, antifraude, dashboard do aluno, auditoria, pontuação e regras antes de iniciar a prova.

Este documento não cria implementação.

Não representa:

- código criado;
- migrations criadas;
- rotas criadas;
- telas criadas;
- componentes criados;
- alteração de UI.

---

## 1. VISÃO GERAL DO MÓDULO

O módulo de Simulados será o motor base para aplicação, correção, acompanhamento, ranking e histórico de provas simuladas dentro do EstudoTOP Simulados.

Ele deve nascer preparado para dois usos:

1. **Simulado avulso**
   - Um simulado publicado pode ser acessado, respondido e finalizado pelo aluno.

2. **Jornadas de Simulados**
   - No futuro, uma Jornada será composta por vários simulados.
   - Exemplo:
     - Jornada Delegado AL.
     - Semana 1: Simulado 01.
     - Semana 2: Simulado 02.
     - Semana 3: Simulado 03.

O produto principal futuro será a Jornada de Simulados. Por isso, o módulo de Simulados precisa ser independente, mas preparado para ser agrupado dentro de Jornadas sem reescrever o motor de tentativas, respostas, resultados, ranking e reprocessamento.

### 1.1 Objetivos principais

- Permitir que o admin crie e configure simulados.
- Permitir que o admin adicione questões existentes ou crie questão manualmente.
- Permitir preview realista da experiência do aluno sem gerar tentativa real.
- Permitir que o aluno veja as regras vitais antes de iniciar.
- Permitir que o aluno inicie, responda, salve progresso, retome e finalize uma tentativa.
- Registrar respostas, tempo, violações de foco, resultado e histórico de tentativas.
- Controlar consumo de tentativa por progresso, finalização ou desclassificação.
- Recalcular resultados quando houver anulação de questão ou alteração de gabarito.
- Notificar alunos quando seus resultados forem alterados.
- Preparar ranking futuro dentro de Jornadas usando apenas a primeira tentativa completa.
- Preparar a estrutura para dashboard do aluno.
- Permitir overrides individuais de tentativas por aluno e simulado.

### 1.2 Fora do escopo deste documento

- Implementação de telas.
- Implementação de componentes.
- Criação de migrations.
- Criação de rotas reais.
- Alteração de layout.
- Alteração no Banco de Questões existente.
- Implementação do módulo de Jornadas.

---

## 2. VISÃO DE NEGÓCIO

O aluno não comprará apenas simulados isolados.

O produto estratégico será:

- Jornadas de Simulados.

Exemplo:

- Jornada Delegado Alagoas.
- 12 semanas.
- 1 simulado por semana.
- Ranking por simulado dentro da Jornada.
- Evolução de desempenho ao longo da Jornada.

O módulo de Simulados precisa funcionar sozinho, mas sem impedir:

- agrupamento futuro em Jornadas;
- ranking por Jornada;
- comparação entre alunos;
- dashboard consolidado;
- notificações de alterações relevantes;
- reprocessamento de resultados;
- auditoria de alterações sensíveis;
- regras antifraude por tentativa.

---

## 3. REGRAS DE NEGÓCIO

### 3.1 Criação de simulado

O admin deve conseguir criar um simulado com:

- nome do simulado;
- descrição;
- disciplina opcional;
- status;
- tempo de prova;
- tentativas padrão;
- exibição de resultado ao finalizar;
- exibição de gabarito ao finalizar;
- feedback instantâneo;
- exibição de comentário do professor;
- vídeo opcional de correção;
- ordenação manual;
- embaralhamento de questões;
- embaralhamento de alternativas;
- permissão ou não de respostas em branco;
- sistema de pontuação.

### 3.2 Status do simulado

Status permitidos:

- `draft`: simulado em rascunho, visível apenas para admin.
- `published`: simulado disponível para alunos autorizados.
- `archived`: simulado arquivado, não aparece como novo para alunos, mas mantém histórico.

Regras:

- Apenas simulados `published` podem ser iniciados por alunos.
- Simulados `draft` podem ser editados livremente.
- Simulados `archived` não devem apagar tentativas, respostas, resultados ou rankings históricos.
- Simulados publicados com tentativas ou resultados têm edição estrutural bloqueada.

### 3.3 Simulado publicado com tentativas ou resultados

Se um simulado `published` já possuir tentativas ou resultados, o sistema não deve permitir:

- adicionar questões;
- remover questões;
- reordenar questões.

Ainda deve ser permitido:

- alterar comentário do professor;
- alterar gabarito;
- anular questão.

Essas alterações são permitidas porque representam correção pedagógica ou administrativa, mas exigem:

- auditoria;
- reprocessamento quando afetar resultado;
- notificação aos alunos afetados;
- atualização de ranking quando aplicável.

### 3.4 Tempo de prova

Valores administrativos previstos:

- 30 minutos.
- 60 minutos.
- 90 minutos.
- 120 minutos.
- Sem limite.

Regra técnica:

- `time_limit_minutes = null` representa simulado sem limite.
- Quando houver limite, o sistema deve calcular `expires_at` no servidor ao iniciar a tentativa.
- O timer do frontend é apenas informativo.
- A autoridade final sobre tempo deve ser sempre do servidor.

### 3.5 Tentativas padrão do simulado

Configurações possíveis:

- 1 tentativa.
- 2 tentativas.
- 3 tentativas.
- Ilimitado.

Campo:

```text
max_attempts
```

Regra:

- `max_attempts = null` significa tentativas ilimitadas.
- `max_attempts` define a regra padrão do simulado.

### 3.6 Overrides individuais de tentativas

Existem dois níveis de controle de tentativas:

1. Configuração geral do simulado.
2. Configuração individual por aluno.

O admin pode ajustar manualmente o número de tentativas de um aluno para um simulado específico.

Exemplos:

- liberar tentativa extra;
- reduzir tentativas;
- resetar tentativa por erro técnico;
- conceder nova tentativa excepcional.

Conceito futuro:

```text
student_simulado_attempt_overrides
```

Regra:

- Se existir override individual, ele prevalece sobre `max_attempts` do simulado.
- Caso contrário, vale `max_attempts` do simulado.
- Tudo deve ser auditável.

### 3.7 Regra oficial de consumo de tentativa

Uma tentativa passa a contar se acontecer qualquer um dos cenários:

1. O aluno responder mais de 50% das questões.
2. O aluno clicar em **Finalizar**.
3. A tentativa for desclassificada por violação de foco/troca de aba ou janela.

Fórmula para o primeiro cenário:

```text
answered_count / total_questions > 0.5
```

Exemplo com 10 questões:

- respondeu 5: ainda não conta.
- respondeu 6: conta.
- respondeu 3 e clicou em Finalizar: conta.
- saiu sem finalizar e respondeu apenas 3: não conta.
- teve segunda violação de foco: conta como tentativa consumida.

Se o aluno sair antes de responder mais de 50% e sem clicar em Finalizar:

- a tentativa continua registrada;
- a tentativa pode ficar como `abandoned`;
- a tentativa não consome o limite de tentativas.

Campos relacionados:

- `counts_toward_limit`.
- `counted_at`.
- `submitted_at`.
- `status`.
- `disqualified_at`.
- `disqualification_reason`.

### 3.8 Progresso e retomada

O aluno deve conseguir:

- iniciar tentativa;
- responder parcialmente;
- atualizar a página;
- fechar e voltar depois;
- retomar do mesmo ponto.

Regras:

- Deve existir no máximo uma tentativa `in_progress` por aluno e por simulado.
- Ao abrir um simulado com tentativa em andamento, o sistema deve retomar a tentativa existente.
- O progresso deve ser salvo a cada resposta.
- A ordem das questões e alternativas deve ser preservada durante toda a tentativa.

### 3.9 Finalização e respostas em branco

Configuração:

```text
allow_blank_answers
```

Valores:

- `true`: o aluno pode finalizar com questões em branco.
- `false`: o aluno deve responder todas as questões antes de finalizar.

Regra padrão:

```text
allow_blank_answers = false
```

Se `allow_blank_answers = false`:

- o sistema deve bloquear a finalização enquanto houver questão sem resposta;
- o aviso deve informar que ainda existem questões pendentes.

Se `allow_blank_answers = true`:

- o aluno pode finalizar mesmo com questões em branco;
- questões em branco recebem pontuação conforme `scoring_model`.

Em qualquer cenário:

- ao clicar em Finalizar, a tentativa passa a contar.

### 3.10 Sistema de pontuação

Configuração:

```text
scoring_model
```

Valores:

- `traditional`
- `cebraspe`

#### 3.10.1 Modelo tradicional

```text
acerto = +1
erro = 0
branco = 0
```

#### 3.10.2 Modelo CEBRASPE

```text
acerto = +1
erro = -1
branco = 0
```

Regras:

- Internamente, a tabela de resultados deve aceitar `score` negativo.
- O reprocessamento deve sempre respeitar o `scoring_model` do simulado.
- Questões anuladas sempre concedem o ponto da questão, independentemente do modelo.

### 3.11 Nota interna e nota exibível

Mesmo no modelo CEBRASPE, o aluno não verá nota negativa.

Regra:

- O `score` interno pode ser negativo.
- A nota exibida ao aluno nunca pode ser menor que zero.
- O percentual exibido ao aluno nunca pode ser menor que zero.

Campos conceituais:

- `score`: pontuação interna calculada.
- `display_score`: pontuação exibível ao aluno.
- `percentage`: percentual interno calculado.
- `display_percentage`: percentual exibível ao aluno.

Regra de exibição:

```text
display_score = max(score, 0)
display_percentage = max(percentage, 0)
```

A nota deve ser exibida sempre em dois formatos:

- pontos;
- percentual.

Exemplo tradicional:

```text
Pontuação: 7 de 10 pontos
Percentual: 70%
```

Exemplo CEBRASPE com cálculo interno negativo:

```text
score interno = -3
Pontuação: 0 de 10 pontos
Percentual: 0%
```

### 3.12 Resultado

Ao finalizar, o sistema deve salvar:

- score interno;
- score exibível;
- percentual interno;
- percentual exibível;
- quantidade de acertos;
- quantidade de erros;
- quantidade de questões em branco;
- quantidade de questões anuladas;
- tempo gasto;
- histórico da tentativa;
- snapshot do resultado;
- modelo de pontuação usado;
- estado de questões anuladas;
- gabaritos usados no momento da correção.

Regras de exibição:

- Se `show_result_on_finish = true`, o aluno vê o resultado ao finalizar.
- Se `show_answer_key_on_finish = true`, o aluno vê o gabarito.
- Se `show_teacher_comment = true`, o aluno vê comentários do professor quando existirem.
- Se houver `correction_video_url`, o aluno poderá acessar a correção em tela separada de resultado.
- O aluno sempre vê `display_score` e `display_percentage`, nunca score negativo.

### 3.13 Feedback instantâneo

Regra oficial:

Se:

```text
instant_feedback_enabled = true
```

Então:

- após o aluno marcar uma resposta;
- o sistema mostra imediatamente se acertou ou errou;
- aquela questão fica bloqueada;
- o aluno não pode alterar a resposta depois.

Motivo:

- Evitar uso do feedback como consulta.

Se `show_teacher_comment = true`, o comentário do professor também pode ser exibido após a resposta.

Se `instant_feedback_enabled = false`:

- o aluno pode alterar respostas até finalizar, salvo regra específica futura.

### 3.14 Comentário do professor

O comentário pertence à questão no Banco de Questões.

No simulado:

- o admin decide se comentários serão exibidos;
- o aluno só vê comentários após finalizar ou após responder, caso feedback instantâneo esteja ativo.

Em simulado publicado com tentativas ou resultados:

- o comentário do professor pode ser alterado;
- essa alteração deve ser registrada em auditoria;
- não exige reprocessamento de score;
- pode ou não gerar aviso ao aluno, conforme decisão futura de produto.

### 3.15 Vídeo de correção

Campo opcional:

- URL Vimeo.

Regras:

- O vídeo pertence ao simulado, não à tentativa.
- O aluno deve ver o vídeo na área de resultado quando disponível.
- O sistema deve validar minimamente se a URL é aceitável antes de salvar.

### 3.16 Adição de questões

O admin deve conseguir adicionar questões por filtros:

- disciplina;
- assunto;
- banca;
- dificuldade;
- busca textual.

Também deve conseguir criar questão manualmente.

Regra:

- Ao criar questão manualmente dentro do fluxo do simulado, a questão deve ser salva no Banco de Questões e vinculada ao simulado.
- Essa criação deve respeitar as mesmas validações do Banco de Questões.

Restrição:

- Se o simulado publicado já possuir tentativas ou resultados, não é permitido adicionar questões.

### 3.17 Ordenação e embaralhamento

Opções:

- ordem manual;
- embaralhar questões;
- embaralhar alternativas.

Regra oficial:

- A ordem das questões e das alternativas deve ser gerada no momento da criação da tentativa.
- Nunca deve ser gerada em tempo de renderização.

Motivo:

- Evitar mudança de ordem em refresh.
- Garantir retomada consistente.
- Garantir correção coerente.
- Garantir snapshot histórico confiável.

Regras:

- A ordem manual fica salva em `simulado_questions.order_number`.
- Se embaralhar questões estiver ativo, a ordem real do aluno deve ser salva em `simulado_attempts.question_order`.
- Se embaralhar alternativas estiver ativo, a ordem real das alternativas deve ser salva em `simulado_answers.alternative_order` ou em snapshot equivalente da tentativa.
- A correção nunca deve depender da posição visual.
- A correção deve depender do ID da alternativa correta ou da chave correta da questão.

### 3.18 Anulação de questão

Uma questão dentro de um simulado pode ter status:

- `active`
- `annulled`

Se anulada:

- aparece visualmente para o aluno com marca d’água ou equivalente premium:

```text
QUESTÃO ANULADA
```

Regra de pontuação:

- Todos os alunos recebem o ponto da questão.

Exemplos:

- Aluno acertou antes:
  - continua com o ponto;
  - não ganha ponto extra.

- Aluno errou antes:
  - passa a ganhar o ponto.

- Aluno deixou em branco:
  - passa a ganhar o ponto.

Após anulação, o sistema deve recalcular:

- score interno;
- score exibível;
- percentual interno;
- percentual exibível;
- ranking;
- histórico;
- notificações do aluno.

### 3.19 Alteração de gabarito

Se o admin alterar o gabarito de uma questão:

```text
Antes: B
Depois: D
```

Então todos os alunos daquele simulado devem ser reprocessados.

Consequências:

- notas podem subir;
- notas podem cair internamente;
- nota exibível nunca fica negativa;
- ranking pode mudar;
- alunos devem ser notificados;
- auditoria deve registrar a alteração.

### 3.20 Anulação ou alteração de gabarito durante tentativa em andamento

Se o admin aplicar:

- anulação de questão;
- alteração de gabarito;

as mudanças devem ser refletidas imediatamente no sistema.

Porém, se o aluno estiver fazendo o simulado naquele momento:

- ele continua a tentativa normalmente;
- ao finalizar, o sistema considera as alterações mais recentes;
- o aluno deve ser avisado ao final que houve alteração durante a realização.

Mensagem sugerida:

```text
Durante sua tentativa, uma questão foi anulada ou teve o gabarito alterado. Seu resultado já considera essa atualização.
```

Regra:

- A tentativa em andamento não deve ser interrompida por alteração de gabarito ou anulação.
- A correção final sempre usa o estado mais recente válido do simulado.
- O snapshot do resultado deve registrar que houve alteração durante a tentativa.

### 3.21 Reprocessamento

Sempre que houver:

- anulação de questão;
- mudança de gabarito;

o sistema deve recalcular:

- score interno;
- score exibível;
- percentual interno;
- percentual exibível;
- ranking;
- notificações do aluno.

O reprocessamento deve sempre respeitar:

- `scoring_model` do simulado;
- `allow_blank_answers`;
- pesos das questões;
- status `annulled`;
- respostas registradas;
- snapshot de tentativa;
- regras de visibilidade do resultado.

Regras:

- O reprocessamento não deve apagar a tentativa original.
- O reprocessamento deve gerar nova versão lógica do resultado ou atualizar o resultado mantendo auditoria.
- O aluno deve conseguir saber que seu resultado foi atualizado.
- O admin deve conseguir auditar quem fez a alteração e quando.

### 3.22 Notificações ao aluno

Conceito futuro:

- Área de Avisos no dashboard do aluno.

Quando houver:

- anulação de questão;
- mudança de gabarito;
- resultado recalculado;

o aluno recebe aviso.

Exemplo:

```text
Seu resultado foi atualizado.

Simulado:
Simulado 03 — Delegado AL

Questão:
Questão 12

Alteração:
Gabarito alterado

Sua nota:
82% → 86%
```

Regras:

- Avisos devem ser relacionados ao aluno afetado.
- Avisos devem permitir estado de lido/não lido.
- Avisos não substituem auditoria administrativa.
- Avisos devem usar nota exibível ao aluno, nunca score interno negativo.

### 3.23 Ranking

Dentro de uma Jornada futura, o aluno poderá visualizar:

- ranking dos alunos que resolveram aquele simulado dentro daquela Jornada.

Regra oficial:

- O ranking não deve considerar melhor tentativa.
- O ranking considera apenas a primeira tentativa completa do aluno naquele simulado dentro daquela Jornada.

Conceito:

```text
first_completed_attempt
```

Regras:

- Se o aluno fez várias tentativas, apenas a primeira tentativa finalizada entra no ranking.
- Tentativas posteriores servem para treino e histórico individual.
- Tentativas posteriores não alteram posição no ranking.
- Se houver anulação de questão ou troca de gabarito, o ranking deve ser recalculado.
- O ranking deve usar score exibível e percentual exibível.

Motivo:

- Evitar que o aluno faça uma primeira tentativa, veja gabarito/comentários e use tentativas posteriores para distorcer o ranking.

Critérios de desempate:

1. Maior score exibível.
2. Maior percentual exibível.
3. Menor tempo para finalizar o simulado.
4. Finalizou primeiro, usando timestamp de finalização.

Ou seja:

- Se dois alunos tiverem a mesma pontuação, fica na frente quem terminou em menos tempo.
- Se ainda empatar, fica na frente quem finalizou antes.

### 3.24 Antifraude: troca de aba, janela ou perda de foco

Durante a realização do simulado, o aluno não pode:

- mudar de guia;
- mudar de janela;
- sair do foco da tela do simulado.

Conceitos:

- `tab_switch_count`;
- `focus_violation_count`.

Primeira ocorrência:

- exibir aviso modal;
- registrar ocorrência;
- permitir continuar.

Mensagem sugerida:

```text
Atenção: detectamos que você saiu da tela do simulado. Em caso de nova ocorrência, a tentativa será encerrada e contará como utilizada.
```

Segunda ocorrência:

- encerrar a tentativa atual;
- marcar como tentativa perdida/consumida;
- reiniciar o simulado;
- contar uma tentativa;
- registrar ocorrência como suspeita de cola.

Status usado:

```text
disqualified
```

Regra:

- Tentativa desclassificada por troca de aba/janela deve consumir tentativa.
- Tentativa desclassificada não deve gerar resultado válido para ranking.
- A ocorrência deve ser auditável.

### 3.25 Tela de regras antes de iniciar o simulado

Antes de iniciar o simulado, o aluno deve visualizar uma tela ou modal premium de regras vitais.

Objetivos:

- evitar dúvidas;
- reduzir suporte;
- deixar as regras transparentes;
- reforçar seriedade do simulado.

Essa tela deve ser simples, clara, visual, com ícones e animações leves.

Ela deve mostrar, conforme as configurações do simulado:

1. **Tempo de prova**
   - Exemplo: `Este simulado possui 90 minutos.`
   - Ícone sugerido: `Timer`.

2. **Tentativas disponíveis**
   - Exemplo: `Você possui 1 tentativa disponível.`
   - Ícone sugerido: `RotateCcw`.

3. **Respostas em branco**
   - Se `allow_blank_answers = false`: `Você precisa responder todas as questões para finalizar.`
   - Se `allow_blank_answers = true`: `Você pode finalizar com questões em branco.`
   - Ícone sugerido: `ListChecks`.

4. **Sistema de pontuação**
   - Se `scoring_model = traditional`:
     - Acerto: `+1`.
     - Erro: `0`.
     - Em branco: `0`.
   - Se `scoring_model = cebraspe`:
     - Acerto: `+1`.
     - Erro: `-1`.
     - Em branco: `0`.
   - Ícone sugerido: `Calculator` ou `Sigma`.

5. **Feedback instantâneo**
   - Se `instant_feedback_enabled = true`: `Você verá se acertou ou errou assim que responder. Após responder, a questão será bloqueada.`
   - Se `instant_feedback_enabled = false`: `Você verá o resultado apenas no final, conforme configuração do simulado.`
   - Ícone sugerido: `MessageCircleQuestion`.

6. **Troca de aba/janela**
   - Aviso obrigatório: `Não mude de guia, janela ou saia da tela durante o simulado.`
   - Primeira ocorrência: aviso.
   - Segunda ocorrência: tentativa encerrada e consumida.
   - Ícone sugerido: `ShieldAlert`.

7. **Gabarito e comentários**
   - Mostrar conforme configuração:
     - resultado ao finalizar;
     - gabarito ao finalizar;
     - comentários do professor;
     - vídeo de correção, se disponível.
   - Ícones sugeridos:
     - `Trophy`;
     - `ListChecks`;
     - `BookOpenCheck`;
     - `PlayCircle`.

8. **Ranking**
   - Se o simulado estiver dentro de uma Jornada com ranking:
     - `O ranking considera apenas sua primeira tentativa completa.`
     - `Em caso de empate, fica na frente quem finalizar em menos tempo.`
   - Ícone sugerido: `Trophy`.

9. **Confirmação**
   - Antes de começar, o aluno deve clicar em:

```text
Estou ciente e quero iniciar o simulado
```

Regra:

- Essa confirmação inicia a tentativa.
- Sem confirmação, a tentativa não deve ser criada.

Visual futuro:

- card/modal premium;
- ícones Lucide;
- animações suaves;
- visual limpo;
- linguagem simples;
- botões claros;
- tom sério, mas amigável.

---

## 4. MODELAGEM DE BANCO

Esta seção descreve a modelagem proposta. Nenhuma migration deve ser criada antes da aprovação.

### 4.1 Tabela: `simulados`

Responsabilidade:

- Guardar a configuração principal do simulado.

Colunas propostas:

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `title` | `text` | Sim | Nome do simulado. |
| `slug` | `text` | Não | Identificador amigável para URL, se necessário. |
| `description` | `text` | Não | Descrição administrativa ou pública. |
| `discipline_id` | `uuid` | Não | Disciplina principal opcional. |
| `status` | `text` | Sim | `draft`, `published` ou `archived`. |
| `time_limit_minutes` | `integer` | Não | Minutos de prova. `null` significa sem limite. |
| `max_attempts` | `integer` | Não | Número máximo padrão de tentativas. `null` significa ilimitado. |
| `attempt_count_threshold_percent` | `numeric(5,2)` | Sim | Percentual para tentativa passar a contar por progresso. Padrão: `50.00`. |
| `show_result_on_finish` | `boolean` | Sim | Exibe resultado ao finalizar. |
| `show_answer_key_on_finish` | `boolean` | Sim | Exibe gabarito ao finalizar. |
| `instant_feedback_enabled` | `boolean` | Sim | Mostra acerto/erro a cada resposta. |
| `show_teacher_comment` | `boolean` | Sim | Mostra comentário do professor. |
| `correction_video_url` | `text` | Não | URL Vimeo da correção. |
| `shuffle_questions` | `boolean` | Sim | Embaralha questões por tentativa. |
| `shuffle_alternatives` | `boolean` | Sim | Embaralha alternativas por tentativa. |
| `allow_blank_answers` | `boolean` | Sim | Permite finalizar com questões em branco. Padrão: `false`. |
| `scoring_model` | `text` | Sim | `traditional` ou `cebraspe`. |
| `created_by` | `uuid` | Não | Admin que criou o simulado. |
| `published_at` | `timestamptz` | Não | Data de publicação. |
| `archived_at` | `timestamptz` | Não | Data de arquivamento. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Índices:

- `idx_simulados_status`.
- `idx_simulados_discipline_id`.
- `idx_simulados_created_at`.
- `idx_simulados_published_at`.
- `unique_simulados_slug`, se `slug` for usado.

Constraints:

- `status in ('draft', 'published', 'archived')`.
- `time_limit_minutes is null or time_limit_minutes in (30, 60, 90, 120)`.
- `max_attempts is null or max_attempts > 0`.
- `attempt_count_threshold_percent >= 0 and attempt_count_threshold_percent <= 100`.
- `scoring_model in ('traditional', 'cebraspe')`.
- `title` não pode ser vazio após trim.

### 4.2 Tabela: `simulado_questions`

Responsabilidade:

- Relacionar questões do Banco de Questões com simulados.
- Guardar ordem manual, peso e status da questão dentro do simulado.

Colunas propostas:

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `simulado_id` | `uuid` | Sim | Simulado ao qual a questão pertence. |
| `question_id` | `uuid` | Sim | Questão do Banco de Questões. |
| `order_number` | `integer` | Sim | Ordem manual dentro do simulado. |
| `points` | `numeric(8,2)` | Sim | Peso da questão. Padrão: `1.00`. |
| `status` | `text` | Sim | `active` ou `annulled`. |
| `annulled_at` | `timestamptz` | Não | Momento da anulação. |
| `annulled_by` | `uuid` | Não | Admin responsável pela anulação. |
| `annulment_reason` | `text` | Não | Motivo administrativo/pedagógico. |
| `is_required` | `boolean` | Sim | Indica se compõe a prova. Padrão: `true`. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Índices:

- `idx_simulado_questions_simulado_id`.
- `idx_simulado_questions_question_id`.
- `idx_simulado_questions_order`.
- `idx_simulado_questions_status`.

Constraints:

- `unique(simulado_id, question_id)`.
- `unique(simulado_id, order_number)`.
- `order_number > 0`.
- `points > 0`.
- `status in ('active', 'annulled')`.
- Se `status = 'annulled'`, `annulled_at` deve ser preenchido.

### 4.3 Tabela: `simulado_attempts`

Responsabilidade:

- Guardar cada tentativa de um aluno em um simulado.
- Controlar status, tempo, progresso e consumo de tentativa.
- Guardar a ordem real gerada no início da tentativa.
- Registrar violações de foco/troca de aba ou janela.

Colunas propostas:

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `simulado_id` | `uuid` | Sim | Simulado respondido. |
| `student_id` | `uuid` | Sim | Aluno dono da tentativa. |
| `attempt_number` | `integer` | Sim | Número sequencial da tentativa do aluno naquele simulado. |
| `status` | `text` | Sim | `in_progress`, `completed`, `expired`, `abandoned`, `cancelled` ou `disqualified`. |
| `started_at` | `timestamptz` | Sim | Início da tentativa. |
| `last_activity_at` | `timestamptz` | Não | Última resposta/salvamento. |
| `submitted_at` | `timestamptz` | Não | Finalização manual. |
| `expires_at` | `timestamptz` | Não | Expiração quando há limite de tempo. |
| `counted_at` | `timestamptz` | Não | Quando passou a contar como tentativa consumida. |
| `counts_toward_limit` | `boolean` | Sim | Se consome o limite de tentativas. |
| `answered_count` | `integer` | Sim | Questões respondidas. |
| `total_questions` | `integer` | Sim | Total de questões no momento da tentativa. |
| `progress_percent` | `numeric(5,2)` | Sim | Percentual respondido. |
| `time_spent_seconds` | `integer` | Sim | Tempo acumulado. |
| `question_order` | `jsonb` | Não | Ordem real das questões gerada na criação da tentativa. |
| `settings_snapshot` | `jsonb` | Sim | Configurações do simulado no início da tentativa. |
| `tab_switch_count` | `integer` | Sim | Contador de troca de aba/guia. Padrão: `0`. |
| `focus_violation_count` | `integer` | Sim | Contador consolidado de perda de foco. Padrão: `0`. |
| `disqualified_at` | `timestamptz` | Não | Momento da desclassificação. |
| `disqualification_reason` | `text` | Não | Motivo da desclassificação. |
| `rules_accepted_at` | `timestamptz` | Não | Momento em que o aluno confirmou ciência das regras. |
| `metadata` | `jsonb` | Sim | Dados auxiliares versionados. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Índices:

- `idx_simulado_attempts_simulado_id`.
- `idx_simulado_attempts_student_id`.
- `idx_simulado_attempts_student_simulado`.
- `idx_simulado_attempts_status`.
- `idx_simulado_attempts_disqualified_at`.
- Índice único parcial para impedir mais de uma tentativa em andamento:
  - `unique(student_id, simulado_id) where status = 'in_progress'`.

Constraints:

- `status in ('in_progress', 'completed', 'expired', 'abandoned', 'cancelled', 'disqualified')`.
- `attempt_number > 0`.
- `answered_count >= 0`.
- `total_questions > 0`.
- `answered_count <= total_questions`.
- `progress_percent >= 0 and progress_percent <= 100`.
- `time_spent_seconds >= 0`.
- `tab_switch_count >= 0`.
- `focus_violation_count >= 0`.
- `unique(simulado_id, student_id, attempt_number)`.

Regras:

- A tentativa conta se `answered_count / total_questions > 0.5`, se `submitted_at is not null` ou se `status = 'disqualified'`.
- A ordem das questões deve ser definida na criação da tentativa.
- A ordem não pode ser recalculada em refresh.
- Tentativa desclassificada consome tentativa e não entra em ranking.

### 4.4 Tabela: `simulado_answers`

Responsabilidade:

- Guardar as respostas de cada tentativa.
- Guardar bloqueio de resposta quando houver feedback instantâneo.
- Guardar ordem real das alternativas quando houver embaralhamento.

Colunas propostas:

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `attempt_id` | `uuid` | Sim | Tentativa relacionada. |
| `simulado_question_id` | `uuid` | Sim | Questão dentro do simulado. |
| `question_id` | `uuid` | Sim | Questão original do Banco de Questões. |
| `selected_alternative_id` | `uuid` | Não | Alternativa escolhida. |
| `selected_alternative_label` | `text` | Não | Letra/chave escolhida, se aplicável. |
| `answer_text` | `text` | Não | Campo futuro para resposta discursiva. |
| `is_correct` | `boolean` | Não | Resultado da correção. |
| `is_locked` | `boolean` | Sim | Bloqueia alteração após feedback instantâneo. |
| `answered_at` | `timestamptz` | Não | Momento da resposta. |
| `response_time_seconds` | `integer` | Não | Tempo gasto na questão. |
| `changed_count` | `integer` | Sim | Quantidade de alterações na resposta. |
| `alternative_order` | `jsonb` | Não | Ordem real das alternativas para esta tentativa. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Constraints:

- `unique(attempt_id, simulado_question_id)`.
- `response_time_seconds is null or response_time_seconds >= 0`.
- `changed_count >= 0`.

### 4.5 Tabela: `simulado_results`

Responsabilidade:

- Guardar o resultado consolidado de uma tentativa finalizada.
- Preservar snapshot histórico.
- Suportar reprocessamento por anulação ou mudança de gabarito.
- Suportar score interno negativo.
- Suportar score e percentual exibíveis nunca negativos.

Colunas propostas:

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `attempt_id` | `uuid` | Sim | Tentativa finalizada. |
| `simulado_id` | `uuid` | Sim | Simulado relacionado. |
| `student_id` | `uuid` | Sim | Aluno dono do resultado. |
| `total_questions` | `integer` | Sim | Total de questões. |
| `answered_questions` | `integer` | Sim | Questões respondidas. |
| `correct_count` | `integer` | Sim | Acertos. |
| `wrong_count` | `integer` | Sim | Erros. |
| `blank_count` | `integer` | Sim | Em branco. |
| `annulled_count` | `integer` | Sim | Questões anuladas no resultado atual. |
| `score` | `numeric(10,2)` | Sim | Nota interna calculada. Pode ser negativa. |
| `display_score` | `numeric(10,2)` | Sim | Nota exibida ao aluno. Mínimo `0`. |
| `max_score` | `numeric(10,2)` | Sim | Pontuação máxima possível. |
| `percentage` | `numeric(6,2)` | Sim | Percentual interno calculado. Pode ser negativo no CEBRASPE. |
| `display_percentage` | `numeric(5,2)` | Sim | Percentual exibido ao aluno. Mínimo `0`. |
| `scoring_model` | `text` | Sim | Modelo usado: `traditional` ou `cebraspe`. |
| `time_spent_seconds` | `integer` | Sim | Tempo total. |
| `finished_at` | `timestamptz` | Sim | Momento de finalização. |
| `had_live_rule_change` | `boolean` | Sim | Indica alteração de gabarito/anulação durante a tentativa. |
| `last_reprocessed_at` | `timestamptz` | Não | Último reprocessamento. |
| `reprocess_reason` | `text` | Não | Motivo do último reprocessamento. |
| `result_snapshot` | `jsonb` | Sim | Snapshot das questões, alternativas, gabaritos e correção. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Constraints:

- `unique(attempt_id)`.
- `total_questions > 0`.
- `answered_questions >= 0`.
- `correct_count >= 0`.
- `wrong_count >= 0`.
- `blank_count >= 0`.
- `annulled_count >= 0`.
- `answered_questions <= total_questions`.
- `display_score >= 0`.
- `display_percentage >= 0 and display_percentage <= 100`.
- `time_spent_seconds >= 0`.
- `scoring_model in ('traditional', 'cebraspe')`.

Observação:

- `score` e `percentage` internos não devem ter constraint de mínimo zero, pois o modelo CEBRASPE permite cálculo negativo.

### 4.6 Tabela futura: `student_simulado_attempt_overrides`

Responsabilidade:

- Guardar exceções individuais de tentativas por aluno e simulado.

Colunas sugeridas:

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `student_id` | `uuid` | Sim | Aluno afetado. |
| `simulado_id` | `uuid` | Sim | Simulado afetado. |
| `max_attempts_override` | `integer` | Não | Limite individual substituto. |
| `extra_attempts_granted` | `integer` | Não | Tentativas extras concedidas. |
| `reason` | `text` | Sim | Justificativa administrativa. |
| `created_by` | `uuid` | Sim | Admin responsável. |
| `created_at` | `timestamptz` | Sim | Data de criação. |
| `updated_at` | `timestamptz` | Sim | Data de atualização. |

Regras:

- Se existir override ativo, ele prevalece sobre `simulados.max_attempts`.
- Toda alteração deve ser auditável.

### 4.7 Tabela futura: `simulado_audit_logs`

Responsabilidade:

- Registrar ações administrativas relevantes.

Eventos previstos:

- `publish`
- `archive`
- `update`
- `answer_key_changed`
- `question_annulled`
- `question_comment_updated`
- `settings_changed`
- `results_reprocessed`
- `attempt_override_created`
- `attempt_override_updated`
- `attempt_disqualified`

Colunas sugeridas:

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `simulado_id` | `uuid` | Sim | Simulado afetado. |
| `simulado_question_id` | `uuid` | Não | Questão afetada dentro do simulado. |
| `question_id` | `uuid` | Não | Questão original afetada. |
| `student_id` | `uuid` | Não | Aluno afetado, se houver. |
| `attempt_id` | `uuid` | Não | Tentativa afetada, se houver. |
| `admin_id` | `uuid` | Não | Admin responsável. |
| `event_type` | `text` | Sim | Tipo do evento. |
| `before_data` | `jsonb` | Não | Estado anterior. |
| `after_data` | `jsonb` | Não | Estado posterior. |
| `reason` | `text` | Não | Justificativa administrativa. |
| `created_at` | `timestamptz` | Sim | Data do evento. |

### 4.8 Tabela futura: `student_notifications`

Responsabilidade:

- Guardar avisos ao aluno.

Tipos previstos:

- `answer_key_changed`
- `question_annulled`
- `result_updated`
- `live_rule_change_detected`

Colunas sugeridas:

| Coluna | Tipo | Obrigatório | Descrição |
|---|---:|---:|---|
| `id` | `uuid` | Sim | Identificador único. |
| `student_id` | `uuid` | Sim | Aluno notificado. |
| `simulado_id` | `uuid` | Não | Simulado relacionado. |
| `attempt_id` | `uuid` | Não | Tentativa relacionada. |
| `result_id` | `uuid` | Não | Resultado relacionado. |
| `type` | `text` | Sim | Tipo do aviso. |
| `title` | `text` | Sim | Título do aviso. |
| `message` | `text` | Sim | Mensagem exibida. |
| `payload` | `jsonb` | Não | Dados complementares. |
| `read_at` | `timestamptz` | Não | Data de leitura. |
| `created_at` | `timestamptz` | Sim | Data de criação. |

---

## 5. RELACIONAMENTOS ENTRE ENTIDADES

### 5.1 Relação principal

- Um `simulado` possui várias `simulado_questions`.
- Uma `simulado_question` aponta para uma `question` do Banco de Questões.
- Uma `simulado_question` pode estar `active` ou `annulled`.
- Um `student` pode ter várias `simulado_attempts`.
- Uma `simulado_attempt` pertence a um `simulado`.
- Uma `simulado_attempt` possui várias `simulado_answers`.
- Uma `simulado_attempt` finalizada possui um `simulado_result`.
- Um `simulado_result` pode ser reprocessado.
- Um aluno pode ter override individual em `student_simulado_attempt_overrides`.
- Um aluno pode receber várias `student_notifications`.
- Um simulado pode ter vários `simulado_audit_logs`.

### 5.2 Diagrama lógico textual

```text
students
  ├── simulado_attempts
  │     ├── simulado_answers
  │     └── simulado_results
  ├── student_simulado_attempt_overrides
  └── student_notifications

simulados
  ├── simulado_questions
  │     └── questions
  ├── simulado_attempts
  ├── simulado_results
  ├── student_simulado_attempt_overrides
  └── simulado_audit_logs

disciplines
  └── simulados
```

### 5.3 Preparação para Jornadas

Modelo futuro recomendado:

```text
jornadas
  ├── jornada_simulados
  │     └── simulados
  ├── jornada_enrollments
  │     └── students
  └── jornada_rankings
        └── first_completed_attempt
```

Regras futuras:

- Uma Jornada pode ter vários simulados.
- Um simulado pode estar em várias Jornadas.
- A ordem do simulado dentro da Jornada pertence a `jornada_simulados`.
- Ranking deve ser calculado no contexto da Jornada.
- Ranking usa apenas a primeira tentativa completa.
- Anulação e mudança de gabarito devem recalcular rankings afetados.

---

## 6. ROTAS

As rotas abaixo são a arquitetura de navegação prevista. Nenhuma rota deve ser criada antes da aprovação.

### 6.1 Admin

#### `/simulados`

Objetivo:

- Listar simulados.
- Filtrar por status, disciplina e busca textual.
- Exibir quantidade de questões, status, tentativas e data de atualização.

#### `/simulados/novo`

Objetivo:

- Criar novo simulado.
- Definir dados principais e regras.

Configurações previstas:

- Sistema de pontuação:
  - Tradicional.
  - CEBRASPE.
- Pode deixar questões em branco?
  - Sim.
  - Não.
- Tentativas padrão.
- Feedback instantâneo.
- Gabarito, comentários e resultado.

#### `/simulados/[id]`

Objetivo:

- Visualizar detalhes administrativos do simulado.
- Ver questões vinculadas.
- Ver status, regras e histórico básico.
- Ver se existem tentativas ou resultados.
- Ver logs/auditoria no futuro.

#### `/simulados/[id]/editar`

Objetivo:

- Editar dados do simulado.
- Adicionar/remover/reordenar questões quando permitido.
- Configurar regras de tentativa, tempo, feedback, resultado, pontuação e respostas em branco.
- Anular questão.
- Alterar gabarito.
- Alterar comentário do professor.
- Gerenciar overrides individuais de tentativa no futuro.

Regra:

- Se o simulado publicado já tiver tentativas ou resultados, bloquear edição estrutural de questões.

#### `/simulados/[id]/preview`

Objetivo:

- Simular a experiência do aluno.
- Responder questões sem gerar tentativa real.

Regra:

- Não grava em `simulado_attempts`.
- Não grava em `simulado_answers`.
- Não grava em `simulado_results`.
- Não afeta ranking.

### 6.2 Aluno

#### `/meus-simulados`

Objetivo:

- Listar simulados disponíveis para o aluno.
- Mostrar status individual:
  - não iniciado;
  - em andamento;
  - finalizado;
  - expirado;
  - desclassificado;
  - bloqueado por limite de tentativas.

#### `/meus-simulados/[id]`

Objetivo:

- Abrir simulado.
- Exibir regras antes de iniciar.
- Iniciar ou retomar tentativa.
- Responder questões.
- Salvar progresso.
- Finalizar.

#### `/meus-simulados/[id]/resultado`

Objetivo:

- Exibir resultado da tentativa.
- Exibir pontuação em pontos e percentual.
- Exibir gabarito, se permitido.
- Exibir comentários, se permitido.
- Exibir vídeo de correção, se disponível.
- Exibir aviso de alteração durante a tentativa, se houver.
- Exibir avisos de reprocessamento quando houver.

---

## 7. PERMISSÕES

### 7.1 ADMIN

Pode:

- Criar simulado.
- Editar simulado.
- Arquivar simulado.
- Publicar simulado.
- Adicionar questões quando permitido.
- Remover questões quando permitido.
- Reordenar questões quando permitido.
- Configurar tempo, tentativas, feedback, resultado, pontuação e respostas em branco.
- Acessar preview.
- Visualizar resultados agregados.
- Alterar comentário do professor.
- Alterar gabarito.
- Anular questão.
- Reprocessar resultados quando necessário.
- Consultar auditoria.
- Conceder, reduzir ou resetar tentativas individuais por aluno e simulado.
- Visualizar ocorrências antifraude.

Não deve:

- Gerar tentativa real pelo preview.
- Apagar histórico de tentativas de alunos.
- Alterar estrutura de questões de simulado publicado com tentativas ou resultados.
- Remover rastros de auditoria.

### 7.2 ALUNO

Pode:

- Ver simulados publicados e liberados para ele.
- Ver regras antes de iniciar.
- Confirmar ciência das regras para iniciar.
- Iniciar tentativa.
- Retomar tentativa em andamento.
- Responder questões.
- Finalizar tentativa.
- Ver resultado conforme configuração do simulado.
- Ver pontuação em pontos e percentual.
- Ver vídeo de correção conforme disponibilidade.
- Ver avisos sobre atualização de resultado.
- Ver ranking quando houver Jornada e permissão.

Não pode:

- Acessar simulados em `draft`.
- Editar simulado.
- Ver resultado de outro aluno.
- Burlar limite de tentativas.
- Criar tentativa nova se já houver tentativa `in_progress`.
- Alterar resposta bloqueada por feedback instantâneo.
- Trocar de aba, janela ou sair do foco durante o simulado sem consequência.

### 7.3 VISITANTE

Pode:

- Nada no módulo de simulados, salvo páginas públicas futuras de marketing, se existirem.

Não pode:

- Iniciar tentativa.
- Ver simulados restritos.
- Ver resultados.
- Ver ranking.

---

## 8. ESTADOS DO FRONTEND

Estados principais:

| Estado | Uso |
|---|---|
| `loading` | Carregando simulado, questões, tentativa ou resultado. |
| `saving` | Salvando resposta, configuração ou progresso. |
| `draft` | Simulado em rascunho. |
| `published` | Simulado publicado. |
| `archived` | Simulado arquivado. |
| `rules_pending` | Aluno ainda não confirmou ciência das regras. |
| `not_started` | Aluno ainda não iniciou. |
| `in_progress` | Tentativa em andamento. |
| `completed` | Tentativa finalizada. |
| `expired` | Tempo encerrado. |
| `abandoned` | Tentativa abandonada sem consumo. |
| `disqualified` | Tentativa encerrada por violação de foco/troca de aba ou janela. |
| `locked` | Aluno sem permissão, sem tentativas restantes ou questão bloqueada. |
| `preview` | Admin simulando experiência sem persistência real. |
| `submitting` | Finalização em andamento. |
| `reprocessing` | Resultado/ranking em reprocessamento. |
| `annulled` | Questão anulada dentro do simulado. |
| `focus_warning` | Primeira violação de foco detectada. |
| `error` | Erro recuperável. |

---

## 9. EXPERIÊNCIA DO ALUNO

### 9.1 Fluxo esperado

1. Aluno entra no sistema.
2. Acessa o dashboard ou `/meus-simulados`.
3. Escolhe um simulado disponível.
4. Abre `/meus-simulados/[id]`.
5. O sistema verifica:
   - simulado está publicado?
   - aluno tem acesso?
   - existe tentativa em andamento?
   - ainda há tentativas disponíveis considerando override individual?
6. Se não houver tentativa em andamento, o sistema exibe a tela/modal de regras.
7. Aluno confirma:

```text
Estou ciente e quero iniciar o simulado
```

8. O sistema cria tentativa com:
   - hora de início;
   - hora de expiração, se houver tempo limite;
   - ordem das questões;
   - ordem das alternativas;
   - snapshot das configurações do simulado;
   - registro de aceite das regras.
9. Aluno responde uma questão.
10. Sistema salva progresso.
11. Se feedback instantâneo estiver ativo:
   - sistema mostra acerto/erro;
   - bloqueia a questão respondida.
12. Se aluno trocar de aba/janela ou perder foco:
   - primeira ocorrência: modal de aviso e registro;
   - segunda ocorrência: tentativa `disqualified` e consumida.
13. Aluno pode atualizar a página.
14. Sistema retoma a tentativa existente com a mesma ordem.
15. Aluno finaliza.
16. Sistema valida respostas em branco conforme `allow_blank_answers`.
17. Sistema calcula resultado conforme `scoring_model`.
18. Sistema aplica nota exibível mínima zero.
19. Sistema salva `simulado_results`.
20. Aluno vê resultado conforme configuração.
21. Se houve anulação ou alteração de gabarito durante a tentativa, aluno vê aviso ao final.
22. Se houver vídeo de correção, aluno pode acessar a tela de resultado com vídeo.

### 9.2 Dashboard futuro do aluno

O dashboard do aluno deve exibir:

- simulados disponíveis;
- simulados em andamento;
- simulados concluídos;
- média de desempenho;
- tempo médio;
- última atividade;
- avisos;
- ranking quando houver Jornada.

Área de Avisos:

- deve destacar resultado atualizado;
- deve indicar questão anulada;
- deve indicar gabarito alterado;
- deve indicar alteração ocorrida durante tentativa;
- deve permitir marcar aviso como lido.

### 9.3 Requisitos de experiência

- O aluno não deve perder respostas ao atualizar a página.
- O aluno não deve conseguir criar duas tentativas em andamento do mesmo simulado.
- O timer deve ser claro, mas a autoridade do tempo deve ser o servidor.
- A finalização deve bloquear clique duplo.
- O resultado deve respeitar as regras configuradas pelo admin.
- Feedback instantâneo deve bloquear a questão respondida.
- Questão anulada deve aparecer com tratamento visual claro.
- Nota exibida ao aluno nunca deve ser negativa.
- A tela de regras deve aparecer antes de criar a tentativa.
- A troca de aba/janela deve ter aviso na primeira ocorrência e desclassificação na segunda.

---

## 10. PONTOS DE RISCO

### 10.1 Abrir em duas abas

Risco:

- O aluno abre o mesmo simulado em duas abas e responde de forma conflitante.

Mitigação:

- Uma única tentativa `in_progress`.
- Respostas atualizadas por `attempt_id + simulado_question_id`.
- `updated_at` para detectar sobrescrita recente.
- Resposta bloqueada não pode ser alterada se feedback instantâneo estiver ativo.

### 10.2 Refresh simultâneo

Risco:

- Atualizar durante salvamento pode perder resposta ou alterar ordem.

Mitigação:

- Salvamento por questão.
- Estado `saving`.
- Backend idempotente para resposta da mesma questão.
- Ordem de questões e alternativas gerada na criação da tentativa, nunca no render.

### 10.3 Duplicidade de tentativa

Risco:

- Clique duplo em iniciar cria duas tentativas.

Mitigação:

- A tentativa só é criada após confirmação das regras.
- Índice único parcial para uma tentativa `in_progress` por aluno e simulado.
- Botão em estado `submitting`.
- Endpoint idempotente.

### 10.4 Manipulação de timer

Risco:

- Aluno altera relógio local ou manipula frontend.

Mitigação:

- `started_at` e `expires_at` calculados no servidor.
- Finalização validada pelo servidor.
- Respostas após expiração devem ser rejeitadas ou marcadas conforme regra.

### 10.5 Abandono antes de 50%

Risco:

- Aluno inicia várias vezes sem consumir tentativa.

Regra:

- Se saiu antes de responder mais de 50% e sem finalizar, a tentativa pode ficar `abandoned` e não consome tentativa.
- Se respondeu mais de 50%, consome tentativa.
- Se clicou em Finalizar, consome tentativa.
- Se foi desclassificado, consome tentativa.

### 10.6 Edição de simulado publicado

Risco:

- Admin altera estrutura depois de alunos já terem respondido.

Mitigação:

- Bloquear adicionar/remover/reordenar questões se houver tentativas ou resultados.
- Permitir apenas alterações pedagógicas controladas:
  - comentário;
  - gabarito;
  - anulação.
- Registrar auditoria.
- Reprocessar resultados quando necessário.

### 10.7 Anulação ou alteração durante tentativa

Risco:

- Aluno está realizando a prova enquanto o admin altera gabarito ou anula questão.

Mitigação:

- Não interromper a tentativa.
- Usar alteração mais recente na finalização.
- Registrar no snapshot que houve alteração durante a tentativa.
- Avisar o aluno ao final.

### 10.8 Anulação de questão

Risco:

- Resultado antigo fica inconsistente.

Mitigação:

- Questão dentro do simulado possui `status`.
- Anulação dispara reprocessamento.
- Todos recebem ponto.
- Ranking é recalculado.
- Alunos afetados são notificados.

### 10.9 Alteração de gabarito

Risco:

- Notas e ranking mudam sem transparência.

Mitigação:

- Alteração gera auditoria.
- Resultados são reprocessados.
- Ranking é recalculado.
- Alunos afetados são notificados.
- Snapshot registra antes/depois.

### 10.10 Embaralhamento e correção

Risco:

- Alternativa correta muda de posição visual.

Mitigação:

- Correção por ID da alternativa ou chave lógica.
- Snapshot da ordem apresentada ao aluno.
- Ordem gerada apenas na criação da tentativa.

### 10.11 Finalização duplicada

Risco:

- Clique duplo em finalizar gera dois resultados.

Mitigação:

- `unique(attempt_id)` em `simulado_results`.
- Estado `submitting`.
- Endpoint idempotente.
- Finalização sempre consome tentativa.

### 10.12 Score negativo

Risco:

- Sistema exibir nota negativa ao aluno.

Mitigação:

- `score` interno aceita valores negativos.
- `display_score` mínimo é zero.
- `display_percentage` mínimo é zero.
- Ranking usa valores exibíveis.

### 10.13 Troca de aba ou janela

Risco:

- Aluno usa outra guia, janela ou aplicativo para consultar respostas.

Mitigação:

- Registrar `tab_switch_count`.
- Registrar `focus_violation_count`.
- Primeira ocorrência: modal de aviso.
- Segunda ocorrência: tentativa `disqualified`.
- Tentativa desclassificada consome tentativa.
- Registrar suspeita de cola.

### 10.14 Overrides de tentativa

Risco:

- Admin concede tentativa extra sem rastreabilidade.

Mitigação:

- Usar `student_simulado_attempt_overrides`.
- Exigir motivo.
- Registrar `created_by`.
- Auditar criação e alteração.

---

## 11. REPROCESSAMENTO DE RESULTADOS

### 11.1 Eventos que disparam reprocessamento

Disparam reprocessamento:

- `question_annulled`
- `answer_key_changed`

Não disparam reprocessamento de score:

- alteração de comentário do professor;
- alteração de vídeo;
- alteração de descrição;
- arquivamento do simulado.

### 11.2 Dados recalculados

Sempre recalcular:

- score interno;
- score exibível;
- percentual interno;
- percentual exibível;
- acertos;
- erros;
- brancos;
- anuladas;
- ranking;
- histórico;
- notificações.

### 11.3 Regra de pontuação no reprocessamento

Para questão anulada:

```text
pontuação do aluno = points da questão
```

Para modelo tradicional:

```text
acerto = +points
erro = 0
branco = 0
```

Para modelo CEBRASPE:

```text
acerto = +points
erro = -points
branco = 0
```

Regra de exibição:

```text
display_score = max(score, 0)
display_percentage = max(percentage, 0)
```

### 11.4 Notificação pós-reprocessamento

Quando o resultado de um aluno mudar:

- criar aviso no dashboard;
- informar simulado;
- informar questão;
- informar tipo da alteração;
- informar nota anterior e nova nota, quando aplicável;
- usar nota exibível, não score interno negativo.

---

## 12. UI FUTURA

Esta seção descreve intenção futura de interface. Não representa implementação agora.

### 12.1 Criação do simulado

Na tela de criação do simulado, dentro de Configurações, adicionar:

Sistema de pontuação:

```text
( ) Tradicional
( ) CEBRASPE
```

Pode deixar questões em branco?

```text
Sim / Não
```

Regra padrão:

```text
Não
```

### 12.2 Tela/modal de regras antes de iniciar

Antes de iniciar o simulado, o aluno deve ver card/modal premium com:

- Tempo de prova, ícone `Timer`.
- Tentativas disponíveis, ícone `RotateCcw`.
- Respostas em branco, ícone `ListChecks`.
- Sistema de pontuação, ícone `Calculator` ou `Sigma`.
- Feedback instantâneo, ícone `MessageCircleQuestion`.
- Troca de aba/janela, ícone `ShieldAlert`.
- Gabarito e comentários, ícones `Trophy`, `ListChecks`, `BookOpenCheck`, `PlayCircle`.
- Ranking, ícone `Trophy`.
- Botão: `Estou ciente e quero iniciar o simulado`.

### 12.3 Resultado

Resultado deve exibir sempre:

```text
Pontuação: X de Y pontos
Percentual: Z%
```

No CEBRASPE, se o cálculo interno for negativo:

```text
Pontuação: 0 de Y pontos
Percentual: 0%
```

### 12.4 Questão anulada

Na experiência do aluno, questão anulada deve ter tratamento visual premium com marca d’água ou equivalente:

```text
QUESTÃO ANULADA
```

### 12.5 Antifraude

Primeira violação:

- modal premium de aviso.

Segunda violação:

- modal informando encerramento/desclassificação da tentativa.

---

## 13. ROADMAP

### Sprint 1 — Admin

Objetivo:

- Construir a gestão administrativa do simulado.

Entregas:

- Modelagem aprovada.
- Migrations aprovadas.
- CRUD administrativo de simulados.
- Configurações de tempo, tentativas, status e feedback.
- Configuração de pontuação.
- Configuração de respostas em branco.
- Adição de questões existentes.
- Criação manual de questão a partir do simulado.
- Ordenação manual.
- Configuração de embaralhamento.
- Preview admin sem tentativa real.
- Validações para publicação.

### Sprint 2 — Aluno

Objetivo:

- Permitir que o aluno responda simulados publicados.

Entregas:

- Lista de simulados do aluno.
- Tela/modal de regras antes de iniciar.
- Iniciar tentativa somente após aceite.
- Retomar tentativa.
- Salvar respostas.
- Preservar progresso após refresh.
- Preservar ordem de questões e alternativas.
- Controlar tempo.
- Controlar limite de tentativas.
- Bloquear resposta com feedback instantâneo.
- Validar respostas em branco.
- Controlar troca de aba/janela.
- Finalizar tentativa.

### Sprint 3 — Resultados

Objetivo:

- Consolidar correção, histórico, reprocessamento e visualização de resultado.

Entregas:

- Cálculo de score interno.
- Suporte a score interno negativo.
- Score exibível mínimo zero.
- Percentual exibível mínimo zero.
- Pontuação em pontos e percentual.
- Acertos, erros, brancos e anuladas.
- Tempo gasto.
- Histórico de tentativas.
- Gabarito conforme regra.
- Comentários conforme regra.
- Vídeo de correção.
- Snapshot histórico.
- Anulação de questão.
- Alteração de gabarito.
- Reprocessamento.
- Notificações ao aluno.

### Sprint 4 — Jornadas

Objetivo:

- Usar simulados como blocos dentro de Jornadas.

Entregas futuras:

- Tabela `jornadas`.
- Tabela `jornada_simulados`.
- Ordem dos simulados na Jornada.
- Liberação por semana, data ou progresso.
- Dashboard da Jornada.
- Histórico do aluno por Jornada.
- Ranking por simulado dentro da Jornada.
- Ranking baseado apenas em `first_completed_attempt`.
- Reprocessamento de ranking após anulação ou alteração de gabarito.

---

## 14. DECISÕES OFICIAIS CONSOLIDADAS

1. Tentativa conta se o aluno responder mais de 50% das questões, clicar em Finalizar ou for desclassificado.
2. Tentativa abandonada antes de 50% e sem finalização não consome tentativa.
3. Tentativa desclassificada por troca de aba/janela consome tentativa.
4. Feedback instantâneo bloqueia a questão após a resposta.
5. Simulado publicado com tentativas ou resultados não permite adicionar, remover ou reordenar questões.
6. Simulado publicado com tentativas ou resultados permite alterar comentário, alterar gabarito e anular questão.
7. Questão anulada concede ponto a todos os alunos.
8. Mudança de gabarito reprocessa todos os resultados afetados.
9. Anulação de questão reprocessa todos os resultados afetados.
10. Alteração de gabarito ou anulação durante tentativa em andamento é considerada na finalização e deve ser informada ao aluno.
11. Reprocessamento atualiza score interno, score exibível, percentual interno, percentual exibível, ranking, histórico e notificações.
12. Score interno pode ser negativo no modelo CEBRASPE.
13. Nota exibida ao aluno nunca pode ser negativa.
14. Percentual exibido ao aluno nunca pode ser negativo.
15. Resultado deve exibir pontos e percentual.
16. Ranking futuro será por simulado dentro da Jornada.
17. Ranking não usa melhor tentativa.
18. Ranking considera apenas a primeira tentativa completa: `first_completed_attempt`.
19. Critério de desempate do ranking: maior score exibível, maior percentual exibível, menor tempo, finalizou primeiro.
20. Ordem de questões e alternativas é gerada na criação da tentativa, nunca no render.
21. Dashboard futuro do aluno terá simulados, desempenho, última atividade, avisos e ranking.
22. Auditoria administrativa será planejada com `simulado_audit_logs`.
23. `allow_blank_answers` define se o aluno pode finalizar com questões em branco.
24. `scoring_model` define pontuação tradicional ou CEBRASPE.
25. Override individual de tentativas prevalece sobre `max_attempts`.
26. Antes de iniciar, o aluno deve aceitar a tela/modal de regras vitais.

---

## 15. PRINCÍPIO ARQUITETURAL FINAL

O módulo de Simulados deve ser independente, persistente, auditável, reprocessável e preparado para Jornadas.

Ele deve permitir Simulados avulsos hoje e Jornadas amanhã, sem reescrever:

- tentativas;
- respostas;
- resultados;
- regras de tempo;
- regras de tentativas;
- overrides individuais;
- sistema de pontuação;
- antifraude;
- ranking;
- notificações;
- histórico do aluno.

