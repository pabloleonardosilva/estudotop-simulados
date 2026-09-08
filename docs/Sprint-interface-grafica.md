# Sprint Interface Gráfica

## Decisão oficial

O EstudoTOP Simulados possui exatamente duas interfaces visuais oficiais: **Dark Premium** e **Clean Premium**. Diferenças de composição e estados funcionais são permitidas, mas nenhuma página deve criar uma terceira identidade visual.

## Fonte da verdade

- `app/globals.css`: contratos, tokens e aliases globais.
- `app/components/AppShell.tsx`: declaração da interface utilizada por cada shell autenticado.
- `app/components/ui/PageBackground.tsx`: aplicação explícita da base escolhida em páginas administrativas.
- `app/components/ui/`: componentes reutilizáveis de botões, campos, cards, tabelas, modais e estados.

## Dark Premium

A referência preservada é o Admin, especialmente `/admin/jornadas/[id]`. O contrato neutro é `.et-interface-dark`; `.et-admin-dark-*` permanece como família operacional compatível. A identidade usa canvas profundo, superfícies escuras elevadas, bordas translúcidas, texto slate claro, laranja institucional, sombras profundas e glows discretos.

Os switches da Dark Premium possuem contraste próprio: no estado desligado, trilho, borda e marcador permanecem discretos, porém claramente distinguíveis do card; no estado ligado, o laranja institucional mantém o destaque. O tratamento visual não altera tamanho, animação ou comportamento e não se aplica aos controles da Clean Premium.

### Composição, backgrounds e rolagem

No Admin, a coluna principal do `AppShell` é o contêiner de rolagem no desktop e `.et-admin-dark-content` é responsável pelo canvas global. Somente um filho direto que declare explicitamente `.et-admin-dark-page` pode ter seu background neutralizado para deixar esse canvas aparecer. Nunca se deve apagar genericamente o background de todo `main` ou `div` descendente: fullscreens, overlays, drawers, painéis fixos e camadas decorativas precisam conservar a superfície definida pelo próprio componente.

Um modal Dark usa backdrop deliberadamente translúcido e pode revelar a página desfocada ao fundo. Um fullscreen de trabalho deve cobrir a viewport com background opaco, possuir sua própria rolagem quando necessário e conter o encadeamento dessa rolagem, impedindo que header, sidebar, footer ou conteúdo inferior apareçam durante o uso.

## Clean Premium

A referência preservada é a Área do Aluno. O contrato neutro é `.et-interface-clean`. `.student-theme`, `.teacher-theme` e `.et-admin-clean-content` permanecem como aliases e camadas de compatibilidade. A identidade usa canvas claro, superfícies brancas, bordas slate suaves, texto escuro, laranja institucional, azul complementar, cores semânticas e sombras leves.

## Escolha e compatibilidade

Toda página nova ou revisada deve declarar uma das duas bases. A escolha é de produto, não do perfil. O shell do aluno pode combinar cabeçalho escuro com conteúdo Clean Premium sem constituir uma terceira interface.

Páginas administrativas claras, como `/questoes/nova`, `/questoes/importar` e `/questoes/gerar-ia`, usam `.et-admin-clean-content` dentro do shell Dark Premium. Essa camada impede que normalizações escuras alterem o conteúdo Clean Premium.

A interface utilizada para criar ou importar uma questão não acompanha a entidade. A apresentação é determinada pela página atual: o importador e seus editores contextuais usam Clean Premium; os cards vinculados na edição do simulado usam Dark Premium, independentemente da origem da questão.

Particularidades locais devem atender somente necessidades funcionais ou de composição. Tokens permanentes devem evoluir na base global. Os aliases atuais não devem ser removidos ou renomeados em massa; a adoção das classes neutras é progressiva.

## Escopo

A consolidação não converteu páginas, alterou regras de negócio ou redesenhou componentes. Responsividade, shells, header, sidebar, footer e rotas de foco foram preservados.

Nenhuma migration foi criada ou alterada nesta Sprint.

## 07/09/2026 - Acabamento editorial global do Admin Clean

Implementado em Sistema e main-worktree por orientacao expressa do responsavel, preservando as alteracoes preexistentes de cada arvore. Esta entrega evolui a Clean Premium; nao cria uma terceira interface.

### Diagnostico e consumidores

Antes, et-interface-clean declarava o contrato neutro e et-admin-clean-content neutralizava estilos Dark. As paginas combinavam fundos cinza, cards brancos e valores locais de borda/sombra. Agora o acabamento editorial esta centralizado em app/globals.css, restrito a et-admin-clean-content.

| Consumidor | Aplicacao |
| --- | --- |
| /questoes/importar | Hero e componentes herdados; etapas numeradas, processamento, metricas, estados, metadados e alternativas com classes semanticas. |
| /questoes/nova | Hero e componentes herdados; superficie de questao, metadados, alternativas e acao de salvar integrados. |
| /questoes/gerar-ia | Hero e componentes herdados; questoes, estados, alternativas e metricas integrados. Coluna lateral inicia em xl; cards permitem popovers fora dos limites. |
| /simulados/[id]/editar - criar manualmente em lote | Somente o fullscreen Clean: cards, metadados, alternativas e acoes responsivas. Mantidos superficie opaca, rolagem propria e limite max-w-6xl. |
| /simulados/[id]/editar - importar com IA | Herda o importador existente com seu contexto de destino preservado. |
| /questoes/[id]/editar e demais paginas Dark | Nao convertidas. QuestionEditor e cards vinculados ao Simulado continuam Dark. |

### Contrato central

PageBackground variant=light ativa et-interface-clean, et-admin-clean-content, et-clean-page e et-clean-container. Componentes light existentes fornecem os hooks; nao basta adicionar bg-white para classificar uma pagina como Clean.

- Tokens --et-interface-* reutilizados no escopo administrativo: canvas, surface, surface-elevated, border, text, muted, accent, accent-secondary, shadow e radius.
- Tokens --et-clean-*: canvas, orange-fill, border-orange/blue/green/red, shadow-sm/lg, glow-orange/blue/green/red, radius-field/panel.
- Estrutura: et-clean-page, et-clean-container, et-clean-hero, et-clean-title, et-clean-section-title, et-clean-description, et-clean-label.
- Superficies: et-clean-card, et-clean-question, et-clean-question-body, et-clean-processing, et-clean-metadata e et-clean-metadata-grid.
- Controles: et-clean-field, et-clean-field-group, et-clean-textarea, et-clean-button e variantes primary/secondary/danger, et-clean-popover, et-clean-step.
- Progresso: et-clean-progress-track/fill, et-clean-metrics, et-clean-metric, et-clean-metric-value/label.
- Estados: et-clean-success, et-clean-danger, et-clean-warning, et-clean-info e et-clean-selected. Laranja indica acao/selecao; verde acerto/sucesso; vermelho erro/duplicata; ambar atencao; azul informacao e topicos. Preservada a semantica anterior das assertivas Certo/Errado.
- Edicao: et-clean-editor, et-clean-toolbar, et-clean-editor-row, et-clean-alternative, et-clean-alternative-correct e et-clean-topics.

Canvas usa luz radial laranja/azul sobre gradiente claro; cards usam superficies brancas elevadas. Container ate 1480px, padding 32/40/64 e faixa notebook 24/28/56; fullscreen nao recebe essa largura. H1 34/40, reduzido para 28/34 abaixo de 1024; titulos 20/26; campos 48px, botoes 44px. Fonte Inter ja carregada pelo projeto, sem alterar body ou fontes Dark. Metadados empilham em mobile; seletores toleram nomes longos; toolbar permite quebra; topicos longos quebram linha. Sem zoom ou scale para densidade; reduced-motion respeitado.

Ajustes deliberados da referencia: texto escuro #431407 sobre o gradiente laranja para contraste; blur nao repetido em cada questao/alternativa; composicoes locais preservadas. As quatro imagens e o documento visual separado nao estavam disponiveis nesta sessao; usados os parametros textuais do prompt, sem declarar equivalencia pixel a pixel.

### Arquivos e limites

- app/globals.css: tokens, componentes semanticos e responsividade.
- app/components/ui/PageBackground.tsx, PageHeader.tsx e PremiumCard.tsx: hooks da variante light.
- app/components/ui/PremiumButton.tsx, PremiumInput.tsx, PremiumSelect.tsx e SearchableSelect.tsx: hooks de campos, acoes e popovers; dimensionamento do seletor Clean.
- app/components/questions/RichTextEditor.tsx, SubjectMultiSelect.tsx e EvaluatedTopicsInput.tsx: somente hooks visuais; handlers preservados.
- app/questoes/importar/page-client.tsx, app/questoes/nova/page-client.tsx, app/questoes/gerar-ia/page-client.tsx e app/simulados/[id]/editar/page-client.tsx: adaptacoes de JSX/classes para consumir a fonte central.

Header, Sidebar, AppShell, area do Aluno, APIs, regras de negocio, assets e dependencias nao foram alterados nesta entrega. Nenhuma migration foi criada ou alterada nesta Sprint. Sem commit, push ou deploy.

### Validacao e pendencias de aceite

TypeScript e build executados nas duas arvores. Teste visual isolado em Edge headless com componentes reais renderizados por React, textos longos e 100 cards: sem overflow horizontal nas larguras 1920, 1536, 1440, 1366, 1280, 1024, 800, 768, 430 e 375. O teste identificou e permitiu corrigir o min-width dos seletores em mobile. Comparacao isolada de estilos antes/depois: 31 elementos representativos Dark/Aluno permaneceram iguais. Fixtures e capturas ficaram em diretorio temporario, fora do repositorio.

Esses testes nao equivalem a navegacao autenticada nas rotas reais. Pendentes: homologacao visual com o shell real e referencias, dropdowns interativos, fluxo completo de IA/importacao/criacao/envio, retorno ao Simulado, estados reais de erro e medicao de memoria/performance. Os testes existentes que gravam em Supabase nao foram executados contra o ambiente remoto. A implementacao visual esta aplicada; o aceite funcional e visual integral nao esta encerrado.

## 07/09/2026 - Ajuste cirurgico de metadados e topicos

Aplicado em Sistema e main-worktree, preservando o trabalho anterior. No importador, as larguras fixas (ano 72px, banca 160px, orgao 150px, assuntos 260px, dificuldade 120px e tipo 110px) desperdicavam espaco e truncavam valores. A ordem do DOM passa a ser Tipo de questao, Banca, Orgao, Ano, Assuntos e Dificuldade, conforme solicitacao posterior do responsavel.

A familia global et-clean-meta-year/board/agency/subjects/compact dimensiona os campos dentro de et-clean-metadata-grid e et-clean-metadata-fields. Ano usa 104px; tipo e dificuldade 150px. Banca, orgao e assuntos absorvem o espaco restante com pesos 1, 1.25 e 1.6. O importador distribui seis campos em uma linha quando ha espaco; entre 680 e 1119px do proprio bloco usa duas linhas completas; abaixo disso empilha, sem zoom/scale. A ordem tambem foi harmonizada nos criadores com os campos que ja existem: nao foram inventados campos ou alterados contratos. Disciplina/Status permanecem controles separados no criador manual; no fullscreen a disciplina antecede os metadados.

A revisao tipografica encontrou espacamento de letras dos labels herdado pelos valores de Ano/Orgao. Inputs/selects e seletores principais do bloco agora usam letter-spacing normal e peso 500; em desktop, 13px. Inter foi preservada, assim como os tamanhos existentes no mobile. Heroes, metricas e tipografia fora desses blocos nao foram alterados.

Topicos: tokens --et-clean-topics-surface/border/shadow e hook et-clean-topics-panel centralizam gradiente #E8F0FF / #F3F7FF / branco, borda azul rgba(37,99,235,.52) e sombra azul discreta. et-clean-topics-label usa #1D4ED8, 12px/800. O input permanece claro com foco azul suave. O painel externo incorpora o componente sem duplicar bordas/sombras; a mensagem obrigatoria permanece vermelha e o botao Adicionar conserva sua acao laranja. EvaluatedTopicsInput nao foi alterado funcionalmente.

Arquivos desta correcao: app/globals.css; app/questoes/importar/page-client.tsx; app/questoes/nova/page-client.tsx; app/questoes/gerar-ia/page-client.tsx; app/simulados/[id]/editar/page-client.tsx; este documento e docs/INDICE_FUNCOES_SISTEMA.md.

Validacao: TypeScript e build nas duas arvores. Fixture interativa temporaria em Edge, com o JSX real de metadados do importador, componentes reais e fonte Inter local, sem API remota: larguras 1920, 1536, 1440, 1366, 1280, 1024, 768, 430 e 375 sem overflow horizontal. Valores testados: 2026; INSTITUTO CONSULPLAN, LEGALLE CONCURSOS, FUNDATEC; Prefeitura de Sao Paulo, Tribunal de Justica de Minas Gerais, Conselho Regional de Quimica da 5a Regiao; assuntos longos e multiplos. Topicos vazios, autocomplete com catalogo simulado, um/varios topicos, adicao, remocao, erro e foco passaram. A comparacao dos handlers JSX antes/depois preservou todos os eventos dos quatro consumidores. Isso nao substitui homologacao autenticada de importacao, IA e salvamento nas rotas completas.

Nenhuma migration foi criada ou alterada nesta Sprint. Nenhuma regra funcional foi alterada. Estilos novos restritos ao Admin Clean; Dark, Aluno, APIs, dados, assets, shell e botoes fora do bloco preservados. Sem commit, push ou deploy.
