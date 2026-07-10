begin;

alter table public.simulado_attempts enable row level security;
alter table public.simulado_answers enable row level security;
alter table public.simulado_results enable row level security;
alter table public.simulado_feedbacks enable row level security;
alter table public.question_code_pool enable row level security;

revoke all on table public.simulado_attempts from anon, authenticated;
revoke all on table public.simulado_answers from anon, authenticated;
revoke all on table public.simulado_results from anon, authenticated;
revoke all on table public.simulado_feedbacks from anon, authenticated;
revoke all on table public.question_code_pool from anon, authenticated;

commit;
