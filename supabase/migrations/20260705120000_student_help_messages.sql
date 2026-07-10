begin;

-- Central de Ajuda: mensagens que o aluno envia para o admin pelo botão
-- "Ajuda" do menu superior, com resposta única do admin por mensagem
-- (modelo ticket, não chat multi-turno).

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
execute function public.set_updated_at();

comment on table public.student_help_messages is 'Mensagens de ajuda enviadas pelo aluno e respondidas pelo admin (Central de Ajuda).';

alter table public.student_help_messages enable row level security;

revoke all on table public.student_help_messages from anon, authenticated;

commit;
