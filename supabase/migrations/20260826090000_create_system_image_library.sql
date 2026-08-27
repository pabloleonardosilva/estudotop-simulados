begin;

create table if not exists public.system_images (
  id uuid primary key default gen_random_uuid(),
  image_type text not null,
  name text not null,
  storage_path text not null unique,
  mime_type text not null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint system_images_image_type_check check (image_type in ('journey_card', 'event_card', 'professor_event_banner')),
  constraint system_images_name_check check (char_length(btrim(name)) between 1 and 120),
  constraint system_images_mime_type_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp'))
);

create index if not exists idx_system_images_type_created_at
  on public.system_images (image_type, created_at desc);

alter table public.jornadas
  add column if not exists card_image_id uuid null references public.system_images(id) on delete restrict;

alter table public.simulado_events
  add column if not exists card_image_id uuid null references public.system_images(id) on delete restrict,
  add column if not exists professor_banner_image_id uuid null references public.system_images(id) on delete restrict;

create index if not exists idx_jornadas_card_image_id on public.jornadas (card_image_id);
create index if not exists idx_simulado_events_card_image_id on public.simulado_events (card_image_id);
create index if not exists idx_simulado_events_professor_banner_image_id on public.simulado_events (professor_banner_image_id);

create or replace function public.validate_system_image_reference()
returns trigger
language plpgsql
as $$
declare
  actual_type text;
begin
  if tg_table_name = 'jornadas' and new.card_image_id is not null then
    select image_type into actual_type from public.system_images where id = new.card_image_id;
    if actual_type is distinct from 'journey_card' then
      raise exception 'Imagem de card da Jornada deve ser do tipo journey_card.';
    end if;
  elsif tg_table_name = 'simulado_events' then
    if new.card_image_id is not null then
      select image_type into actual_type from public.system_images where id = new.card_image_id;
      if actual_type is distinct from 'event_card' then
        raise exception 'Imagem de card do Evento deve ser do tipo event_card.';
      end if;
    end if;
    if new.professor_banner_image_id is not null then
      select image_type into actual_type from public.system_images where id = new.professor_banner_image_id;
      if actual_type is distinct from 'professor_event_banner' then
        raise exception 'Banner do professor deve ser do tipo professor_event_banner.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_jornadas_validate_card_image on public.jornadas;
create trigger trg_jornadas_validate_card_image
before insert or update of card_image_id on public.jornadas
for each row execute function public.validate_system_image_reference();

drop trigger if exists trg_simulado_events_validate_images on public.simulado_events;
create trigger trg_simulado_events_validate_images
before insert or update of card_image_id, professor_banner_image_id on public.simulado_events
for each row execute function public.validate_system_image_reference();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('system-images', 'system-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.system_images enable row level security;

commit;
