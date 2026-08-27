begin;

alter table public.simulado_events
  add column if not exists professor_banner_position_x numeric(5,2) null,
  add column if not exists professor_banner_position_y numeric(5,2) null;

alter table public.simulado_events
  drop constraint if exists simulado_events_professor_banner_position_check;

alter table public.simulado_events
  add constraint simulado_events_professor_banner_position_check check (
    (professor_banner_position_x is null and professor_banner_position_y is null)
    or
    (professor_banner_position_x between 0 and 100 and professor_banner_position_y between 0 and 100)
  );

comment on column public.simulado_events.professor_banner_position_x is
  'Posição horizontal normalizada do banner da área do professor. Nulo usa 50%.';

comment on column public.simulado_events.professor_banner_position_y is
  'Posição vertical normalizada do banner da área do professor. Nulo usa 50%.';

commit;
