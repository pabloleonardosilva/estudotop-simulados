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


## 14/09/2026 - Card premium de Transações Hotmart

Aplicado somente em `app/admin/configuracoes/hotmart/page-client.tsx`, branch `hotmart-homologacao`. O card de transação (compartilhado por Transações, Pendências e Compras em duplicidade, função `renderTransactionCard`) segue o Dark Premium oficial, reaproveitando exclusivamente tokens já existentes em `app/globals.css`: `.et-admin-dark-list-card` (superfície do card, com o mesmo hover `-translate-y-0.5`/`border-white/[0.12]` já usado em `/assuntos`), `.et-admin-dark-label`, `.et-admin-dark-card-title`, `.et-admin-dark-text`, `.et-admin-dark-muted`, `.et-admin-dark-divider` e a família `.et-admin-dark-badge`/`.et-admin-dark-badge-{success,warning,danger,info,neutral}` para os estados semânticos (vinculado/processado = verde, pendência/revisão = âmbar, chargeback/bloqueio = vermelho). Ações usam `PremiumButton` (`dark-primary` para a ação principal **Vincular**, `dark`/`dark-warning`/`dark-success` para as demais, mesmo padrão já usado no resto da página). Nenhum token, cor ou componente novo foi criado; nenhuma terceira identidade visual foi introduzida.

Hierarquia do card: Produto (nome + UCODE com botão copiar, reaproveitando o mesmo padrão de "Produtos vinculados") → Compra (data comercial, valor/moeda quando existentes, badge de situação) → Comprador (nome quando existir, e-mail) → Acesso no EstudoTOP (badge Vinculado + destino, ou Destino indisponível, ou Produto não vinculado + botão Vincular) → Transação (código secundário) e situação interna traduzida. Responsivo: empilha em coluna única abaixo de `lg` (1024px), duas colunas lado a lado a partir daí; UCODE longo quebra com `break-all`. Testado com TypeScript e build; validação visual manual no Preview fica pendente de confirmação do responsável.

Nenhuma migration foi criada ou alterada nesta Sprint. Nenhuma outra tela foi redesenhada.

## 15/09/2026 - Refinamento visual final do card de Transações Hotmart

Aplicado somente em `renderTransactionCard`, dentro de `app/admin/configuracoes/hotmart/page-client.tsx`, branch `hotmart-homologacao`. Escopo puramente visual: nenhuma regra de negócio, prop, estado (`linkState`, `canLink`, `canReprocess`, `canExtend`, `canRefund`), rota ou API foi alterada. Referência visual: `/bancas` (`et-admin-dark-list-card`, `et-admin-dark-icon-box-orange`, badge de status no canto superior direito do card, hover `-translate-y-0.5`/`border-white/[0.12]`).

Composição nova: cabeçalho único com `et-admin-dark-icon-box-orange` (ícone `Package`, já em `lucide-react`) + nome do produto em destaque à esquerda e o badge de situação da compra (`purchaseStatusTone`) à direita — mesmo padrão do cabeçalho dos cards de `/bancas`. UCODE e o código da transação passam a usar `font-mono` (precedente já existente em `/questoes/duplicatas` para IDs técnicos). Bloco "Compra" simplificado para Data/Valor em grade; quando há valor sem moeda, o valor aparece em uma linha e "moeda não informada" em uma segunda linha muted, sem inferir BRL. A coluna direita ("Acesso no EstudoTOP" / "Transação" / "Situação no EstudoTOP") ganhou superfície própria (`rounded-xl border border-white/10 bg-white/[0.03]`, mesmo padrão já usado nesta página para sub-cards de mapeamento/histórico) para deixar de parecer conteúdo solto. Quando o produto está sem nenhum vínculo (`linkState === "unlinked"`) e o `processing_status` da transação também indica ausência de destino/mapeamento (`pending_mapping`/`pending_destination`), a "Situação no EstudoTOP" passa a exibir a mensagem administrativa "Aguardando definição de destino" com uma linha auxiliar orientando a vincular — só troca o texto apresentado neste card; não altera `processing_status`, `linkState` nem nenhuma outra tela. Estados financeiros específicos (chargeback, bloqueio, revisão de data comercial etc.) mantêm suas mensagens próprias, inalteradas.

Nenhum token, cor, componente ou biblioteca novos; nenhuma terceira identidade visual introduzida. Testado com `npx tsc --noEmit`, `npm run build`, `eslint` do arquivo alterado e `node scripts/test-hotmart-unit.cjs` (que trava trechos exatos do JSX deste card por asserção de string — as classes/estrutura novas foram ajustadas para preservar as asserções existentes sem alterar o teste). Validação visual manual no Preview e nas larguras 1366×768/mobile fica pendente de confirmação do responsável. Nenhuma migration foi criada ou alterada nesta Sprint. Nenhuma outra tela foi redesenhada.
