begin;

create table if not exists public.student_correction_video_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  simulado_id uuid not null references public.simulados(id) on delete cascade,
  video_identity text not null,
  video_provider text not null,
  watched_segments jsonb not null default '[]'::jsonb,
  watched_seconds numeric(12,2) not null default 0,
  video_duration_seconds numeric(12,2) not null,
  max_progress_percent numeric(7,4) not null default 0,
  first_started_at timestamptz not null default now(),
  last_watched_at timestamptz not null default now(),
  completed_threshold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_correction_video_progress_identity_check check (char_length(video_identity) between 3 and 200),
  constraint student_correction_video_progress_provider_check check (video_provider in ('html5', 'youtube', 'vimeo')),
  constraint student_correction_video_progress_watched_seconds_check check (watched_seconds >= 0),
  constraint student_correction_video_progress_duration_check check (video_duration_seconds > 0),
  constraint student_correction_video_progress_percent_check check (max_progress_percent between 0 and 100),
  constraint student_correction_video_progress_segments_check check (jsonb_typeof(watched_segments) = 'array')
);

create unique index if not exists unique_student_correction_video_progress_video
  on public.student_correction_video_progress (student_id, simulado_id, video_identity);

create index if not exists idx_student_correction_video_progress_student
  on public.student_correction_video_progress (student_id, simulado_id);

drop trigger if exists trg_student_correction_video_progress_updated_at on public.student_correction_video_progress;
create trigger trg_student_correction_video_progress_updated_at
  before update on public.student_correction_video_progress
  for each row execute function public.set_updated_at();

alter table public.student_correction_video_progress enable row level security;
revoke all on table public.student_correction_video_progress from anon, authenticated;

comment on table public.student_correction_video_progress is 'Cobertura efetivamente reproduzida do vídeo de correção por aluno, simulado e identidade do vídeo atual.';
comment on column public.student_correction_video_progress.watched_segments is 'Intervalos não sobrepostos, em segundos, reproduzidos pelo player e validados pela API server-side.';
comment on column public.student_correction_video_progress.completed_threshold_at is 'Instante permanente em que a cobertura do vídeo atingiu pelo menos 20%.';

commit;
