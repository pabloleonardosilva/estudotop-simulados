begin;

update public.simulado_events as event
set card_image_id = image.id
from public.system_images as image
where event.card_image_id is null
  and image.image_type = 'event_card'
  and image.storage_path = case event.cover_key
    when 'saude' then 'event-cards/legacy-saude.webp'
    when 'policial' then 'event-cards/legacy-policial.webp'
    when 'tribunais' then 'event-cards/legacy-tribunais.webp'
    else 'event-cards/legacy-administrativo.webp'
  end;

commit;
