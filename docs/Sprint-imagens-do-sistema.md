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
- Evento mantém `cover_key`; `card_image_id` tem prioridade no card e `cover_key` continua como fallback.
- O hero de `/professor/eventos/[id]` recebe somente `professor_banner_url`. Quando o banner é nulo, o hero anterior permanece inalterado.
- O banner cadastrado preenche uma máscara panorâmica arredondada com `object-fit: cover`, recorte central e sem distorção. A máscara usa acabamento sutil com borda translúcida, ring interno e sombra premium. Um degradê branco localizado protege a leitura dos textos no lado esquerdo, preservando a imagem no restante da composição. A altura responsiva é controlada pela interface (340px na base, 300px em telas pequenas, 280px em telas médias, 320px em telas extragrandes e 340px em telas 2XL); as ações ficam logo abaixo do banner.
- As duplicações preservam as referências às imagens, sem duplicar arquivos.
- As APIs do aluno e do professor retornam somente a URL resolvida da imagem associada, nunca a biblioteca completa.

## APIs

- `GET /api/admin/system-images?type=...`: lista a biblioteca solicitada.
- `POST /api/admin/system-images`: recebe `file`, `name` e `type`, envia ao Storage e cria o registro. Se o insert falhar, remove o objeto enviado.
- `DELETE /api/admin/system-images?id=...`: recebe somente o ID do registro, revalida o administrador e o uso atual, remove o arquivo do Storage e depois o registro. Se a exclusão do registro falhar, tenta restaurar o arquivo no mesmo caminho.
- Não existe endpoint público da galeria. A exclusão bloqueia referências existentes e preserva os `ON DELETE RESTRICT`; não altera Jornadas ou Eventos automaticamente.

## Bootstrap legado

O script idempotente `scripts/bootstrap-system-images.mjs` importa os quatro WebP de `public/jornadas/categories/` para cópias independentes em `journey-cards/legacy-*.webp` e `event-cards/legacy-*.webp`. Depois cria os registros ausentes e preenche somente associações ainda nulas de Jornadas (`category`) e Eventos (`cover_key`). Os arquivos em `public/` permanecem como fallback.

Após executar a migration autorizada, executar explicitamente na raiz:

```powershell
node --env-file=.env.local scripts/bootstrap-system-images.mjs
```

Uma nova execução não duplica arquivos ou registros e não sobrescreve escolhas administrativas. O script não cria banners de professor automaticamente.

## Arquivos impactados

- Biblioteca: `app/admin/configuracoes/imagens-do-sistema/**`, `app/api/admin/system-images/route.ts`, `lib/system-images.ts`.
- Jornadas: tipos, criação, edição, listagem, duplicação e API/listagem do aluno.
- Eventos: criação, edição, duplicação, API/listagem do aluno e dashboard do professor.
- Navegação: adição cirúrgica em `app/components/Sidebar.tsx`.
- Infraestrutura: migration e script de bootstrap citados acima.

As imagens e funcionalidades de questões não foram alteradas.
