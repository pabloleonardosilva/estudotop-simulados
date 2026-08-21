begin;

with duplicates as (
  select id,
    row_number() over (
      partition by event_id, lower(email)
      order by created_at desc, id desc
    ) as position
  from public.simulado_event_join_intents
  where consumed_at is null
)
delete from public.simulado_event_join_intents intents
using duplicates
where intents.id = duplicates.id
  and duplicates.position > 1;

create unique index if not exists unique_simulado_event_join_intents_pending_email
  on public.simulado_event_join_intents (event_id, lower(email))
  where consumed_at is null;

commit;
