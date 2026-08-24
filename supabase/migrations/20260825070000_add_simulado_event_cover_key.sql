begin;

alter table public.simulado_events
  add column if not exists cover_key text null;

comment on column public.simulado_events.cover_key is
  'Chave do catálogo oficial de capas do Evento (ver app/admin/eventos/utils.ts). Nulo usa a capa padrão (fallback) — nenhum Evento existente quebra ou some.';

commit;
