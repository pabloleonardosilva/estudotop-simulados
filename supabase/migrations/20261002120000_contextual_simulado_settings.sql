-- PREPARADA, NÃO EXECUTADA. Aplicação exige backup e implantação coordenada.
begin;

alter table public.jornadas
  add column feedback_mode text not null default 'final_only' check (feedback_mode in ('instant','final_only')),
  add column navigation_override text check (navigation_override in ('open','closed')),
  add column result_policy text not null default 'released' check (result_policy in ('released','blocked')),
  add column owl_help_enabled boolean not null default false,
  add column owl_help_limit integer,
  add constraint jornadas_context_settings_check check (
    (feedback_mode <> 'instant' or navigation_override is distinct from 'open') and
    ((owl_help_enabled and owl_help_limit is not null and owl_help_limit > 0) or (not owl_help_enabled and owl_help_limit is null)));
alter table public.simulado_events
  add column feedback_mode text not null default 'final_only' check (feedback_mode in ('instant','final_only')),
  add column navigation_override text check (navigation_override in ('open','closed')),
  add column owl_help_enabled boolean not null default false,
  add column owl_help_limit integer,
  add constraint events_context_settings_check check (
    (feedback_mode <> 'instant' or navigation_override is distinct from 'open') and
    ((owl_help_enabled and owl_help_limit is not null and owl_help_limit > 0) or (not owl_help_enabled and owl_help_limit is null)));
alter table public.jornada_simulados
  add column owl_help_enabled_override boolean,
  add column owl_help_limit_override integer,
  add constraint jornada_simulados_owl_override_check check (
    case when owl_help_enabled_override is true then owl_help_limit_override is not null and owl_help_limit_override > 0
    else owl_help_limit_override is null end);
alter table public.simulado_attempts add column result_released_at timestamptz;

-- Preserva cada vínculo; o fallback legado usa as questões reais, não question_count.
update public.jornada_simulados js set
  owl_help_enabled_override = coalesce(s.owl_help_enabled,false),
  owl_help_limit_override = case when s.owl_help_enabled then coalesce(s.owl_help_limit,greatest(1,(select count(*) / 10 from public.simulado_questions sq where sq.simulado_id=s.id))) else null end
from public.simulados s where s.id=js.simulado_id;
update public.simulado_events e set
  owl_help_enabled=coalesce(s.owl_help_enabled,false),
  owl_help_limit=case when s.owl_help_enabled then coalesce(s.owl_help_limit,greatest(1,(select count(*) / 10 from public.simulado_questions sq where sq.simulado_id=s.id))) else null end
from public.simulados s where s.id=e.simulado_id;
do $$ begin
  if exists (select 1 from public.simulados s where (s.feedback_mode='instant' or s.instant_feedback_enabled) and
    (exists(select 1 from public.jornada_simulados js where js.simulado_id=s.id) or exists(select 1 from public.simulado_events e where e.simulado_id=s.id))) then
    raise exception 'Contexto vinculado com feedback imediato: revisar backfill antes de aplicar.';
  end if;
end $$;
-- Autorizações históricas preservadas sem reescrever snapshots, respostas ou resultados.
update public.simulado_attempts set result_released_at=coalesce(submitted_at,clock_timestamp())
where status='completed' and student_jornada_simulado_id is not null;

create or replace function public.preserve_jornada_result_release()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.result_released_at is not null then
    new.result_released_at := old.result_released_at;
  elsif new.status='completed' and new.student_jornada_simulado_id is not null then
    perform 1 from public.jornadas j join public.student_jornadas sj on sj.jornada_id=j.id
      join public.student_jornada_simulados sjs on sjs.student_jornada_id=sj.id
      where sjs.id=new.student_jornada_simulado_id and j.result_policy='released' for share of j;
    if found then new.result_released_at:=clock_timestamp(); end if;
  end if;
  return new;
end $$;
create trigger trg_attempts_preserve_jornada_result_release before insert or update on public.simulado_attempts
for each row execute function public.preserve_jornada_result_release();

create or replace function public.release_jornada_results_on_policy()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.result_policy='released' then
    update public.simulado_attempts a set result_released_at=clock_timestamp()
    from public.student_jornada_simulados sjs join public.student_jornadas sj on sj.id=sjs.student_jornada_id
    where a.student_jornada_simulado_id=sjs.id and sj.jornada_id=new.id and a.status='completed' and a.result_released_at is null;
  end if;
  return new;
end $$;
create trigger trg_jornadas_release_results after update of result_policy on public.jornadas
for each row execute function public.release_jornada_results_on_policy();

create or replace function public.consume_student_owl_help(p_attempt_id uuid,p_student_id uuid,p_simulado_id uuid,p_simulado_question_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.simulado_attempts; s public.simulados; enabled boolean; help_limit integer; hidden jsonb; next_question uuid;
begin
  a:=public.lock_student_attempt(p_attempt_id,p_student_id,p_simulado_id);
  if a.status<>'in_progress' or a.expires_at<=clock_timestamp() then
    return jsonb_build_object('ok',false,'http_status',409,'message','Tentativa encerrada ou tempo esgotado.');
  end if;
  if not exists(select 1 from jsonb_array_elements(a.question_order) entry where entry->>'simulado_question_id'=p_simulado_question_id::text) then
    return jsonb_build_object('ok',false,'http_status',400,'message','Questão não pertence à tentativa.');
  end if;
  select * into s from public.simulados where id=p_simulado_id;
  enabled:=coalesce((a.settings_snapshot->>'owl_help_enabled')::boolean,s.owl_help_enabled,false);
  help_limit:=coalesce((a.settings_snapshot->>'owl_help_limit')::integer,s.owl_help_limit,greatest(1,a.total_questions/10));
  if not enabled then return jsonb_build_object('ok',false,'http_status',403,'message','Ajuda da Coruja desabilitada.'); end if;
  if a.owl_help_data ? p_simulado_question_id::text then
    return jsonb_build_object('ok',true,'message','Ajuda recuperada.','hiddenAlternativeIds',a.owl_help_data->p_simulado_question_id::text,'used',a.owl_help_used_count,'limit',help_limit,'reused',true);
  end if;
  if a.owl_help_used_count>=help_limit then return jsonb_build_object('ok',false,'http_status',403,'message','Todas as ajudas disponíveis foram utilizadas.'); end if;
  if exists(select 1 from public.simulado_answers where attempt_id=a.id and simulado_question_id=p_simulado_question_id and is_locked) then
    return jsonb_build_object('ok',false,'http_status',409,'message','Resposta já confirmada.');
  end if;
  if a.settings_snapshot->>'navigation_type'='closed' or coalesce((a.settings_snapshot->>'instant_feedback_enabled')::boolean,false) then
    select (entry->>'simulado_question_id')::uuid into next_question from jsonb_array_elements(a.question_order) with ordinality as ordered(entry,position)
    join public.simulado_questions sq on sq.id=(entry->>'simulado_question_id')::uuid and sq.status='active'
    where not exists(select 1 from public.simulado_answers ans where ans.attempt_id=a.id and ans.simulado_question_id=sq.id and ans.is_locked)
    order by position limit 1;
    if next_question is distinct from p_simulado_question_id then return jsonb_build_object('ok',false,'http_status',409,'message','Ajuda disponível somente na questão atual.'); end if;
  end if;
  if exists(select 1 from public.simulado_questions sq join public.questions q on q.id=sq.question_id where sq.id=p_simulado_question_id and q.question_type='true_false') then
    return jsonb_build_object('ok',false,'http_status',400,'message','A Ajuda da Coruja não pode ser usada em questões de certo ou errado.');
  end if;
  select jsonb_agg(id) into hidden from (select alt.id from public.question_alternatives alt join public.simulado_questions sq on sq.question_id=alt.question_id
    where sq.id=p_simulado_question_id and sq.simulado_id=p_simulado_id and sq.status='active' and not alt.is_correct order by random() limit 2) wrong;
  if jsonb_array_length(coalesce(hidden,'[]'::jsonb))<>2 then return jsonb_build_object('ok',false,'http_status',400,'message','Não há alternativas erradas suficientes para eliminar.'); end if;
  update public.simulado_attempts set owl_help_data=coalesce(owl_help_data,'{}'::jsonb)||jsonb_build_object(p_simulado_question_id::text,hidden),
    owl_help_used_count=owl_help_used_count+1,last_activity_at=clock_timestamp() where id=a.id;
  return jsonb_build_object('ok',true,'message','Ajuda concedida.','hiddenAlternativeIds',hidden,'used',a.owl_help_used_count+1,'limit',help_limit,'reused',false);
end $$;
revoke all on function public.consume_student_owl_help(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.consume_student_owl_help(uuid,uuid,uuid,uuid) to service_role;

create or replace function public.save_student_attempt_answer(
  p_attempt_id uuid, p_student_id uuid, p_simulado_id uuid,
  p_simulado_question_id uuid, p_question_id uuid, p_alternative_id uuid, p_response_time_seconds integer
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  a public.simulado_attempts;
  previous public.simulado_answers;
  alternative public.question_alternatives;
  answered integer;
  consumed boolean;
  locked boolean;
  progress numeric;
  next_question uuid;
  immediate boolean;
begin
  a := public.lock_student_attempt(p_attempt_id, p_student_id, p_simulado_id);
  if a.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'http_status', 409, 'status', a.status, 'message', 'Tentativa encerrada.');
  end if;
  if a.expires_at < clock_timestamp() then
    return jsonb_build_object('ok', false, 'http_status', 410, 'message', 'Tempo esgotado.');
  end if;
  if not exists (select 1 from public.simulado_questions
    where id = p_simulado_question_id and simulado_id = p_simulado_id and question_id = p_question_id and status = 'active') then
    return jsonb_build_object('ok', false, 'http_status', 409, 'message', 'Questao indisponivel.');
  end if;
  select * into alternative from public.question_alternatives where id = p_alternative_id and question_id = p_question_id;
  if not found then raise exception 'INVALID_ALTERNATIVE' using errcode = '22023'; end if;
  select * into previous from public.simulado_answers where attempt_id = p_attempt_id and simulado_question_id = p_simulado_question_id;
  if previous.is_locked then
    return jsonb_build_object('ok', false, 'http_status', 409, 'is_locked', true, 'message', 'Resposta ja confirmada.');
  end if;
  immediate := coalesce((a.settings_snapshot->>'instant_feedback_enabled')::boolean,false);
  locked := coalesce(a.settings_snapshot->>'navigation_type' = 'closed',false) or immediate;
  if locked then
    select (entry->>'simulado_question_id')::uuid into next_question
    from jsonb_array_elements(a.question_order) with ordinality as ordered(entry,position)
    join public.simulado_questions sq on sq.id=(entry->>'simulado_question_id')::uuid and sq.status='active'
    where not exists(select 1 from public.simulado_answers ans where ans.attempt_id=a.id and ans.simulado_question_id=sq.id and ans.is_locked)
    order by position limit 1;
    if next_question is distinct from p_simulado_question_id then
      return jsonb_build_object('ok',false,'http_status',409,'message','Responda na sequencia da tentativa.');
    end if;
  end if;
  insert into public.simulado_answers (
    attempt_id, simulado_question_id, question_id, selected_alternative_id, selected_alternative_label,
    is_correct, is_locked, response_time_seconds, answered_at, changed_count
  ) values (
    p_attempt_id, p_simulado_question_id, p_question_id, p_alternative_id, alternative.label,
    alternative.is_correct, locked, greatest(0, p_response_time_seconds), clock_timestamp(),
    coalesce(previous.changed_count, 0) + case when previous.id is not null and previous.selected_alternative_id is distinct from p_alternative_id then 1 else 0 end
  ) on conflict (attempt_id, simulado_question_id) do update set
    selected_alternative_id = excluded.selected_alternative_id, selected_alternative_label = excluded.selected_alternative_label,
    is_correct = excluded.is_correct, is_locked = excluded.is_locked, response_time_seconds = excluded.response_time_seconds,
    answered_at = excluded.answered_at, changed_count = excluded.changed_count;
  -- A query failure propagates and rolls back the answer too; never substitute zero.
  select count(*) into answered from public.simulado_answers where attempt_id = p_attempt_id and selected_alternative_id is not null;
  consumed := a.counts_toward_limit or answered::numeric / greatest(a.total_questions, 1) > 0.5;
  progress := round(answered::numeric / greatest(a.total_questions, 1) * 100, 2);
  update public.simulado_attempts set answered_count = answered, progress_percent = progress,
    counts_toward_limit = consumed, counted_at = case when consumed then coalesce(counted_at, clock_timestamp()) else counted_at end,
    last_activity_at = clock_timestamp() where id = p_attempt_id;
  return jsonb_build_object('ok', true, 'message', 'Resposta salva.', 'status', 'in_progress',
    'is_correct', case when immediate then alternative.is_correct else null end, 'is_locked', locked,
    'answered_count', answered, 'progress_percent', progress, 'counts_toward_limit', consumed);
end;
$$;


commit;
