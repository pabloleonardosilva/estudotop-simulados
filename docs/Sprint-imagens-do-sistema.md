# Sprint — Imagens do Sistema

## Finalidade

A biblioteca administrável permite cadastrar, visualizar e selecionar imagens em runtime, sem novo build ou deploy, exclusivamente para cards de Jornadas, cards de Eventos e o banner superior do Evento na área do professor.

## Área administrativa

- Rota: `/admin/configuracoes/imagens-do-sistema`.
- Menu: `Configurações > Imagens do Sistema`.
- Abas: `Cards de Jornadas`, `Cards de Eventos` e `Banner da área do professor`.
- Upload protegido por `requireAdmin`, aceitando JPEG, PNG e WebP de até 5 MB. MIME e assinatura binária são validados no servidor; SVG não é aceito.
- Cada imagem possui exclusão individual com confirmação. A operação é definitiva, exclusiva de administrador e não oferece exclusão em massa, lixeira, restauração ou exclusão forçada.
- Imagens vinculadas a Jornadas, cards de Eventos ou banners de Eventos não podem ser excluídas; o administrador deve trocar o vínculo antes.

## Banco e Storage

- Migration: `supabase/migrations/20260826090000_create_system_image_library.sql`.
- Tabela `system_images`: `id`, `image_type`, `name`, `storage_path`, `mime_type`, `created_by` e `created_at`.
- Tipos fechados: `journey_card`, `event_card`, `professor_event_banner`.
- Bucket público de leitura `system-images`, limite de 5 MB e escrita somente pelo backend com service role.
- Subpastas: `journey-cards/`, `event-cards/` e `professor-event-banners/`.
- `jornadas.card_image_id`, `simulado_events.card_image_id` e `simulado_events.professor_banner_image_id` são FKs com `ON DELETE RESTRICT`.
- Trigger de integridade impede associação entre tipos incompatíveis; as APIs repetem a validação na fronteira.

## Integração e compatibilidade

- Jornada mantém `category`; `card_image_id` tem prioridade visual e a categoria continua como fallback e informação semântica.
- Novos salvamentos de Evento usam `card_image_id`. Durante a transição, a listagem do aluno prioriza essa FK e usa o asset de `cover_key` somente quando ela ainda estiver nula.
- A migration de expansão `20260827110000_unify_event_card_images.sql` converte vínculos quando o registro equivalente já existe em `system_images`. Ela é segura sem bootstrap, preserva `cover_key`, mantém a FK nula quando o arquivo ainda não foi cadastrado e não executa a etapa destrutiva de consolidação.
- O hero de `/professor/eventos/[id]` recebe somente `professor_banner_url`. Quando o banner é nulo, o hero anterior permanece inalterado.
- O banner cadastrado preenche uma máscara panorâmica arredondada com `object-fit: cover`, recorte central e sem distorção. A máscara usa acabamento sutil com borda translúcida, ring interno e sombra premium. Um degradê branco localizado protege a leitura dos textos no lado esquerdo, preservando a imagem no restante da composição. A altura responsiva é controlada pela interface (340px na base, 300px em telas pequenas, 280px em telas médias, 320px em telas extragrandes e 340px em telas 2XL); as ações ficam logo abaixo do banner.
- O enquadramento do banner pertence ao Evento que utiliza a imagem. `simulado_events.professor_banner_position_x` e `professor_banner_position_y` armazenam percentuais de 0 a 100; registros antigos ou valores nulos usam `50% 50%`, equivalente ao `object-center` anterior.
- Os formulários de criação e edição oferecem a ação **Ajustar enquadramento**. O modal reutiliza a máscara real da dashboard e mantém o ajuste apenas em estado local durante o arraste. Em Evento existente, **Salvar posição** persiste diretamente X/Y; na criação, o enquadramento é persistido junto com o novo Evento.
- A troca do banner e o enquadramento são persistidos como dados independentes do mesmo Evento. O `PATCH /api/admin/events/[id]` devolve o ID e os percentuais efetivamente gravados; a interface somente confirma o salvamento do enquadramento quando o ID retornado coincide com a imagem selecionada, evitando restaurar silenciosamente um vínculo anterior.
- As leituras do Evento na edição administrativa e na dashboard do professor usam `cache: "no-store"`, e as duas APIs devolvem `Cache-Control: no-store`. Ao reabrir o ajuste, o formulário é reconstruído com os percentuais atuais do banco, sem retornar indevidamente ao centro `50% 50%`.
- As duplicações preservam as referências às imagens, sem duplicar arquivos.
- As APIs do aluno e do professor retornam somente a URL resolvida da imagem associada, nunca a biblioteca completa.

## APIs

- `GET /api/admin/system-images?type=...`: lista a biblioteca solicitada.
- `POST /api/admin/system-images`: recebe `file`, `name` e `type`, envia ao Storage e cria o registro. Se o insert falhar, remove o objeto enviado.
- `DELETE /api/admin/system-images?id=...`: recebe somente o ID do registro, revalida o administrador e o uso atual, remove o arquivo do Storage e depois o registro. Se a exclusão do registro falhar, tenta restaurar o arquivo no mesmo caminho.
- Não existe endpoint público da galeria. A exclusão bloqueia referências existentes e preserva os `ON DELETE RESTRICT`; não altera Jornadas ou Eventos automaticamente.

## Bootstrap legado

O script idempotente `scripts/bootstrap-system-images.mjs` importa os quatro WebP de `public/jornadas/categories/` para cópias independentes em `journey-cards/legacy-*.webp` e `event-cards/legacy-*.webp`. Ele cria somente arquivos/registros ausentes e conclui somente FKs nulas de Jornadas e Eventos. Os arquivos em `public/` permanecem necessários ao fallback transitório dos Eventos e ao fallback legado das Jornadas.

A migration de expansão pode ser aplicada antes do bootstrap sem falhar. Depois, mediante autorização manual e no ambiente correto, executar explicitamente na raiz para garantir os objetos físicos e concluir vínculos ainda nulos:

```powershell
node --env-file=.env.local scripts/bootstrap-system-images.mjs
```

Uma nova execução não duplica arquivos ou registros e não sobrescreve escolhas administrativas. O script não cria banners de professor automaticamente. Somente após comprovar que não restam Eventos sem `card_image_id` poderá ser criada uma migration futura de consolidação para `NOT NULL` e remoção de `cover_key`.

## Arquivos impactados

- Biblioteca: `app/admin/configuracoes/imagens-do-sistema/**`, `app/api/admin/system-images/route.ts`, `lib/system-images.ts`.
- Jornadas: tipos, criação, edição, listagem, duplicação e API/listagem do aluno.
- Eventos: criação, edição, duplicação, API/listagem do aluno e dashboard do professor.
- Navegação: adição cirúrgica em `app/components/Sidebar.tsx`.
- Infraestrutura: migration e script de bootstrap citados acima.

As imagens e funcionalidades de questões não foram alteradas.
