# Sprint — Central de Ajuda (mensagens aluno ↔ admin)

**Status:** planejado em 2026-07-05, implementação em andamento.

## Contexto

O aluno pediu um botão "Ajuda" no menu superior (`Header.tsx`). Ao esclarecer o que esse botão deveria fazer, o usuário (dono do produto, atua como admin) descreveu uma necessidade maior: uma "janela de contato" dentro da plataforma onde o aluno escreve uma mensagem para o admin; um painel administrativo onde o admin vê e responde todas as mensagens; um aviso automático para o aluno quando ele entra no sistema e há uma resposta nova; e um painel para o aluno acompanhar o histórico de suas mensagens/respostas.

Não existe hoje nenhum mecanismo de contato/suporte dentro da plataforma nem componente de toast/notificação — o único popup existente é o `PremiumModal` (bloqueante, um por vez), que se encaixa perfeitamente no "aviso ao entrar no sistema" pedido.

## Modelo de dados

Modelo **ticket** (1 mensagem do aluno + 1 resposta do admin por linha), não um chat multi-turno — o aluno pode abrir vários tickets ao longo do tempo, cada um com histórico próprio. Isso é suficiente para tudo que foi pedido e evita a complexidade de um chat em tempo real.

Migração `supabase/migrations/<timestamp>_student_help_messages.sql`, seguindo o padrão de `20260702150000_logs_auditoria_unificacao.sql` (begin/commit, `create table if not exists`, índices `idx_<tabela>_<coluna>`, RLS habilitado + `revoke all ... from anon, authenticated` porque todo acesso passa pelo service-role client no servidor):

```sql
create table if not exists public.student_help_messages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  message text not null,
  status text not null default 'open' check (status in ('open', 'answered')),
  admin_reply text,
  replied_at timestamptz,
  replied_by uuid references public.profiles(id),
  student_seen_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_help_messages_student_id on public.student_help_messages(student_id);
create index if not exists idx_student_help_messages_status on public.student_help_messages(status);
create index if not exists idx_student_help_messages_created_at on public.student_help_messages(created_at desc);

create trigger trg_student_help_messages_updated_at
before update on public.student_help_messages
for each row
execute function public.set_updated_at(); -- função já existe (criada em 20260511183000_create_simulados_admin_core.sql)

comment on table public.student_help_messages is 'Mensagens de ajuda enviadas pelo aluno e respondidas pelo admin (Central de Ajuda).';

alter table public.student_help_messages enable row level security;
revoke all on table public.student_help_messages from anon, authenticated;
```

`student_seen_reply_at`: null enquanto o aluno não reconheceu a resposta. Ao responder, o admin seta `status='answered'`, `replied_at=now()`, `replied_by=<admin.id>` e o backend **zera** `student_seen_reply_at` para `null` (mesmo que já tivesse valor de um popup anterior) — isso é o que dispara o próximo popup. O aluno "reconhece" a resposta fechando o popup (ação padrão ou o botão "Ver resposta") — nesse momento uma chamada marca `student_seen_reply_at = now()` para todos os tickets respondidos e não vistos daquele aluno. O painel do aluno (histórico completo) não depende dessa coluna — ela só controla o popup.

**⚠️ Migração no Supabase:** não é aplicada automaticamente — o arquivo `.sql` é criado no repositório e precisa ser rodado manualmente (dashboard do Supabase ou `supabase db push`) antes de testar a feature.

## Arquivos novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/<ts>_student_help_messages.sql` | schema acima |
| `app/api/student/help-messages/route.ts` | `GET` lista tickets do próprio aluno (`getStudentFromRequest`, mesmo padrão de `app/api/student/notes/route.ts`); `POST` cria novo ticket (`{ message }`, valida não-vazio e tamanho máx. ~2000 chars) |
| `app/api/student/help-messages/mark-seen/route.ts` | `POST` marca `student_seen_reply_at = now()` em todos os tickets `answered` e não vistos do aluno autenticado |
| `app/api/admin/help-messages/route.ts` | `GET` lista todos os tickets com paginação simples (`page`/`limit`/`.range()`, igual `app/api/admin/logs/route.ts`), filtro opcional `?status=open|answered`, join com `students(name, email)`; usa `requireAdmin(request)` |
| `app/api/admin/help-messages/[id]/route.ts` | `PATCH` responde um ticket (`{ admin_reply }`) → seta `admin_reply`, `replied_at`, `replied_by`, `status='answered'`, `student_seen_reply_at=null`; usa `requireAdmin(request)` |
| `app/components/HelpCenterModal.tsx` | Modal "janela de contato" do aluno: textarea + botão "Enviar" (POST) no topo, histórico de tickets anteriores abaixo (mensagem, status, resposta do admin, datas) — visual dark glass consistente com `app/minhas-anotacoes/page-client.tsx`. Recebe `open`/`onClose`, busca via `GET` ao abrir |
| `app/admin/ajuda/page.tsx` | Server Component: `requireAdminPage()` + busca inicial via `createSupabaseAdminClient()` (mesmo padrão de `app/admin/alunos/page.tsx`) |
| `app/admin/ajuda/page-client.tsx` | Lista de tickets com abas Abertas/Respondidas/Todas (modelo: painel de abas de `AlunoActivityPanel` em `app/admin/alunos/[id]/page-client.tsx`), textarea de resposta por ticket, `PATCH` ao enviar |

## Arquivos existentes editados

| Arquivo | Mudança |
|---|---|
| `app/components/Header.tsx` | novo item "Ajuda" no nav do aluno (ícone `LifeBuoy` de `lucide-react`), como `<button onClick={onOpenHelp}>` (não é rota, abre modal); nova prop `onOpenHelp?: () => void` |
| `app/components/AppShell.tsx` | no branch `isStudentArea`: estado `helpOpen` (renderiza `HelpCenterModal`, passa `onOpenHelp` pro `Header`); `useEffect` (uma vez, quando `user`+`isStudentArea`) que busca `GET /api/student/help-messages`, filtra tickets `answered` sem `student_seen_reply_at`, e se houver algum, mostra `PremiumModal` (`tone="success"`, `theme="dark"`) com prévia da resposta mais recente; ao fechar, chama `POST mark-seen` |
| `app/components/Sidebar.tsx` | branch admin: novo `NavLink` "Central de Ajuda" (ícone `LifeBuoy`) no grupo "Relatórios & sistema", com badge de contagem de tickets `open` — mesmo padrão de `reviewQueueCount` (fetch + `supabase.channel(...).on("postgres_changes", ..., table: "student_help_messages")`) |
| `docs/INDICE_FUNCOES_SISTEMA.md` | nova seção documentando a Central de Ajuda (tabela, rotas, arquivos, regras) |

`isAllowedStudentRoute` não precisa mudar (o modal não é uma rota). `isDarkPremiumRoute` ganha apenas o prefixo `/admin/ajuda` (para a página admin seguir o mesmo visual dark premium de `/admin/logs` e `/admin/alunos`).

## Ordem de implementação

1. Migration (arquivo criado, aplicação manual pelo usuário).
2. Rotas API do aluno.
3. Rotas API do admin.
4. `HelpCenterModal` + mudanças em `Header.tsx`/`AppShell.tsx` (botão + modal + popup de aviso).
5. Página `/admin/ajuda` + badge em `Sidebar.tsx`.
6. Atualizar `docs/INDICE_FUNCOES_SISTEMA.md`.
7. Validar: `npx tsc --noEmit`, `npm run lint`, teste manual no navegador (enviar mensagem como aluno → responder como admin → recarregar como aluno e ver o popup → conferir histórico nos dois painéis).

## Decisões assumidas

- Popup marca como "visto" tanto ao clicar em "Ver resposta" quanto ao simplesmente fechar — não insiste a cada recarregamento.
- Sem indicador (bolinha) de mensagem não lida no próprio botão "Ajuda" do aluno nesta primeira versão — só o popup ao entrar + o histórico dentro do modal.
- Mensagem do aluno é texto simples (sem anexos/imagens) nesta primeira versão.
- Sem envio de e-mail avisando o admin de nova mensagem — a visibilidade do admin é via badge no menu + painel `/admin/ajuda`.

## Atualização 2026-07-16 — Acesso do aluno temporariamente oculto

O item **Ajuda** do menu do aluno e o **sininho de notificações** do header foram temporariamente ocultos pela flag `SHOW_STUDENT_HELP_MENU = false` em `app/components/Header.tsx`, por decisão de produto. A funcionalidade não foi removida: `HelpCenterModal`, as APIs `help-messages` (aluno e admin) e o painel `/admin/ajuda` permanecem implementados e funcionais. Para reexibir os acessos, basta retornar a flag para `true`.
