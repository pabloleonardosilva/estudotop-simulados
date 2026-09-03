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
