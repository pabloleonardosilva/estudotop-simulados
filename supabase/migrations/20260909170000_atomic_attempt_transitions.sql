begin;

-- Internal helper: the row lock is held until the calling RPC transaction ends.
create or replace function public.lock_student_attempt(p_attempt_id uuid, p_student_id uuid, p_simulado_id uuid)
returns public.simulado_attempts
language plpgsql security invoker set search_path = ''
as $$
declare a public.simulado_attempts;
begin
  select * into a from public.simulado_attempts where id = p_attempt_id for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND' using errcode = 'P0002'; end if;
  if a.student_id is distinct from p_student_id or a.simulado_id is distinct from p_simulado_id
     or a.is_preview or a.attempt_context = 'professor_preview' then
    raise exception 'ATTEMPT_FORBIDDEN' using errcode = '42501';
  end if;
  if a.attempt_context = 'event' and not exists (
    select 1 from public.simulado_event_participants p
    join public.simulado_events e on e.id = p.event_id
    where p.id = a.event_participant_id and p.event_id = a.event_id
      and p.student_id = p_student_id and e.simulado_id = p_simulado_id
  ) then raise exception 'ATTEMPT_CONTEXT_INVALID' using errcode = '42501'; end if;
  if a.student_jornada_simulado_id is not null and not exists (
    select 1 from public.student_jornada_simulados s
    join public.student_jornadas j on j.id = s.student_jornada_id
    where s.id = a.student_jornada_simulado_id and s.simulado_id = p_simulado_id
      and j.student_id = p_student_id
  ) then raise exception 'ATTEMPT_CONTEXT_INVALID' using errcode = '42501'; end if;
  return a;
end;
$$;

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
  locked := coalesce((a.settings_snapshot->>'instant_feedback_enabled')::boolean, false);
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
    'is_correct', case when locked then alternative.is_correct else null end, 'is_locked', locked,
    'answered_count', answered, 'progress_percent', progress, 'counts_toward_limit', consumed);
end;
$$;

create or replace function public.abandon_student_attempt(p_attempt_id uuid, p_student_id uuid, p_simulado_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare a public.simulado_attempts; answered integer; consumed boolean;
begin
  a := public.lock_student_attempt(p_attempt_id, p_student_id, p_simulado_id);
  if a.status = 'abandoned' then
    return jsonb_build_object('ok', true, 'message', 'Tentativa encerrada.', 'status', a.status, 'counts_toward_limit', a.counts_toward_limit);
  end if;
  if a.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'http_status', 409, 'status', a.status, 'message', 'Tentativa encerrada.');
  end if;
  select count(*) into answered from public.simulado_answers where attempt_id = p_attempt_id and selected_alternative_id is not null;
  consumed := a.counts_toward_limit or answered::numeric / greatest(a.total_questions, 1) > 0.5;
  update public.simulado_attempts set status = 'abandoned', answered_count = answered,
    progress_percent = round(answered::numeric / greatest(a.total_questions, 1) * 100, 2),
    counts_toward_limit = consumed, counted_at = case when consumed then coalesce(counted_at, clock_timestamp()) else counted_at end,
    last_activity_at = clock_timestamp() where id = p_attempt_id;
  return jsonb_build_object('ok', true, 'message', 'Tentativa encerrada.', 'status', 'abandoned', 'counts_toward_limit', consumed);
end;
$$;

create or replace function public.record_student_attempt_focus(p_attempt_id uuid, p_student_id uuid, p_simulado_id uuid, p_violation_number integer)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare a public.simulado_attempts; next_count integer;
begin
  a := public.lock_student_attempt(p_attempt_id, p_student_id, p_simulado_id);
  if a.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'http_status', 409, 'status', a.status, 'disqualified', a.status = 'disqualified', 'message', 'Tentativa encerrada.');
  end if;
  -- The sequence identifies a retry; it cannot skip the first two occurrences.
  if p_violation_number is null or p_violation_number < 1 or p_violation_number > a.focus_violation_count + 1 then
    return jsonb_build_object('ok', false, 'http_status', 409, 'violation_count', a.focus_violation_count, 'message', 'Sequencia de foco desatualizada.');
  end if;
  next_count := greatest(a.focus_violation_count, p_violation_number);
  if next_count > a.focus_violation_count then
    update public.simulado_attempts set focus_violation_count = next_count, tab_switch_count = tab_switch_count + 1,
      status = case when next_count >= 3 then 'disqualified' else status end,
      disqualified_at = case when next_count >= 3 then clock_timestamp() else disqualified_at end,
      disqualification_reason = case when next_count >= 3 then 'focus_violation' else disqualification_reason end,
      counts_toward_limit = counts_toward_limit or next_count >= 3,
      counted_at = case when next_count >= 3 then coalesce(counted_at, clock_timestamp()) else counted_at end,
      last_activity_at = clock_timestamp() where id = p_attempt_id;
  end if;
  return jsonb_build_object('ok', true, 'message', 'Foco registrado.', 'status', case when next_count >= 3 then 'disqualified' else 'in_progress' end,
    'disqualified', next_count >= 3, 'violation_count', next_count);
end;
$$;

create or replace function public.complete_student_attempt(
  p_attempt_id uuid, p_student_id uuid, p_simulado_id uuid, p_expected_updated_at timestamptz, p_result jsonb
)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare a public.simulado_attempts; result_id uuid; r public.simulado_results;
begin
  a := public.lock_student_attempt(p_attempt_id, p_student_id, p_simulado_id);
  if a.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'http_status', 409, 'status', a.status, 'message', 'Tentativa encerrada.');
  end if;
  -- TS scoring used this version. A committed answer/focus update invalidates it.
  if a.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'http_status', 409, 'status', a.status, 'message', 'A tentativa mudou. Finalize novamente.');
  end if;
  r := jsonb_populate_record(null::public.simulado_results, p_result);
  insert into public.simulado_results (
    attempt_id, simulado_id, student_id, total_questions, answered_questions,
    correct_count, wrong_count, blank_count, annulled_count, score, display_score,
    max_score, percentage, display_percentage, scoring_model, time_spent_seconds, finished_at, result_snapshot
  ) values (
    p_attempt_id, p_simulado_id, p_student_id, r.total_questions, r.answered_questions,
    r.correct_count, r.wrong_count, r.blank_count, r.annulled_count, r.score, r.display_score,
    r.max_score, r.percentage, r.display_percentage, r.scoring_model, r.time_spent_seconds, r.finished_at, r.result_snapshot
  ) returning id into result_id;
  update public.simulado_attempts set status = 'completed', submitted_at = r.finished_at,
    time_spent_seconds = r.time_spent_seconds, counts_toward_limit = true, counted_at = coalesce(counted_at, r.finished_at),
    answered_count = r.answered_questions,
    progress_percent = case when r.total_questions > 0 then round(r.answered_questions::numeric / r.total_questions * 100, 2) else 0 end,
    last_activity_at = clock_timestamp() where id = p_attempt_id;
  return jsonb_build_object('ok', true, 'message', 'Simulado finalizado.', 'status', 'completed', 'id', result_id);
end;
$$;

revoke all on function public.lock_student_attempt(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_student_attempt_answer(uuid, uuid, uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.abandon_student_attempt(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_student_attempt_focus(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_student_attempt(uuid, uuid, uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.lock_student_attempt(uuid, uuid, uuid) to service_role;
grant execute on function public.save_student_attempt_answer(uuid, uuid, uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.abandon_student_attempt(uuid, uuid, uuid) to service_role;
grant execute on function public.record_student_attempt_focus(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.complete_student_attempt(uuid, uuid, uuid, timestamptz, jsonb) to service_role;

commit;
