begin;

alter table public.simulados
  add column if not exists anti_tab_switch_enabled boolean not null default true,
  add column if not exists anti_window_blur_enabled boolean not null default true;

comment on column public.simulados.anti_tab_switch_enabled is
  'Controla se o simulado registra violação quando o aluno troca de guia, minimiza a janela ou usa ALT+TAB durante a execução.';

comment on column public.simulados.anti_window_blur_enabled is
  'Controla se o simulado registra violação quando a janela perde foco para outra janela/aplicativo, incluindo uso lado a lado.';

commit;
