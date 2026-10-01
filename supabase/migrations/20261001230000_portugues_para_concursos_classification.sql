-- Classificação das questões de Português no assunto "Português para Concursos" (somente dados).
--
-- Escopo fechado, por identificadores confirmados na auditoria de 01/10/2026 (projeto
-- estudotop-simulados, ref uphqihoqzwqjzmsimaug):
--   * cria o assunto "Português para Concursos" (id fixo 38b30a5e-78fb-4e25-b9cb-dcc2cfa44e4a) na
--     disciplina Português (2e2ef950-faee-4ef6-89c1-d5327aea1800);
--   * move para ele os 14 tópicos diretos usados (mesmos ids, nomes e propriedades);
--   * atribui o assunto às 10 questões ET3916–ET3925 preservando evaluated_topics;
--   * cria os 10 vínculos em question_subjects;
--   * exclui, sem CASCADE efetivo, o assunto de teste "Teste - Pablo", seu tópico "Bla Bla" e os
--     tópicos diretos sem uso "Azeite de Oliva", "Gaffarinha" e "Teste - Concordância".
--
-- Não altera estrutura, RLS, grants, funções ou triggers. Não toca tentativas, respostas,
-- resultados, snapshots, gabaritos, Simulados, Jornadas ou Eventos. Questões sem assunto continuam
-- tecnicamente permitidas.
--
-- Ordem obrigatória: os tópicos são movidos ANTES das questões. Ao gravar subject_id na questão,
-- trg_questions_sync_topics_on_review faz upsert em (subject_id, normalized_name); com os tópicos
-- já no assunto, o upsert só atualiza a própria linha (nenhum tópico novo, nenhum órfão).
-- Efeito conhecido e aceito: updated_at das 10 questões e dos 14 tópicos é renovado pelos
-- triggers existentes (não desligados).
--
-- Qualquer divergência das pré-condições ou pós-condições aborta a transação inteira.
-- Backup pré-migration (fora do repositório):
--   D:/Projetos_Software/estudotop-simulados/Backups/2026-10-01-portugues-para-concursos/backup.json
--   sha256 d466cdfedd09749571a286057732ff06b502dec8a85a5e8287e6ca75ccdcb8ff
--
-- Estado: PREPARADA, NÃO EXECUTADA. Rollback ao final (comentado).

begin;

set local timezone = 'UTC';

create temp table _ppc_questions (id uuid primary key, code text not null, md5_topics text not null, md5_rest text not null) on commit drop;
insert into _ppc_questions (id, code, md5_topics, md5_rest) values
  ('7efec72f-969f-4eb5-9b28-62bf11c02911', 'ET3916', '75c2692fed5670a8a61ee30b0f921417', '87f4bb019e682581cd7c4a1b8bf2c2dd'),
  ('dd4e6079-7979-485a-a122-83d18232f888', 'ET3917', '113210bb8a6e3f2951d0b42587effe0f', 'a0bae2e2bb6c275b17df76f59b372ecc'),
  ('2696c158-049a-45bb-a5cc-8a371be2c2df', 'ET3918', 'e50816c9dfa261f4e5b1a5bbc1730bd4', '27ced5d7caf13d3440a43e2e93be7bf8'),
  ('070eedcd-566b-4dbf-b759-4e8354b47f07', 'ET3919', '06dbeb52367feeb6bd0207c98a81d40b', 'ecf74f99ab363814cb930bd1f18105e5'),
  ('338dc981-b29a-4d6f-9d9d-9f1cc693d679', 'ET3920', '84f746ae39381c0b3b19e6546d347619', '96524faf54a18d15c084efe97481c7f0'),
  ('a9efe56d-54e5-4621-acc6-d76cca9736a3', 'ET3921', 'c12ec9acad29c55becb3f5a38fe637c9', 'ac6faf0e32391685f7a635864c146928'),
  ('9cb697b3-9268-4a1a-8a42-d2ab2c45d9b7', 'ET3922', 'b55af1d74df5faf3b6832f4dfc765977', '2980fa0f4c0bfb2bbb831208d50ae33b'),
  ('a16816f5-8f2f-42f8-aec0-25d623ad39bd', 'ET3923', '83bf38024a2935e1b27939b584d451fd', '74d625c42d3a9c1623c654c4ae87aa58'),
  ('4014bc28-33eb-4099-9b27-6466447ca7c9', 'ET3924', 'dbe43434c99c52d226d0e8395037fdda', '58354c5c69712838bb7c7daca447ed3c'),
  ('b766de07-9c5e-4001-9e42-7e92892464e0', 'ET3925', '83bf38024a2935e1b27939b584d451fd', '390f891065b671019986e75c82034a7c');

-- md5_rest: md5 de to_jsonb(linha) sem subject_id e updated_at (UTC).
create temp table _ppc_moved_topics (id uuid primary key, normalized_name text not null, md5_rest text not null) on commit drop;
insert into _ppc_moved_topics (id, normalized_name, md5_rest) values
  ('d432cdb7-d02b-4edb-a29f-73aecacdc978', 'acentuacao grafica', 'd8ff2fa37ef5d561e272d4b74a257571'),
  ('c98e0d15-6c7d-4ff3-8a6f-2c5b5f96a56d', 'crase', 'a0fb730637cf8342e071e457a8bfc489'),
  ('10afe590-0fed-4246-922d-a02a59eb2c98', 'figuras de linguagem', '1788af45a53cee9f0bf2c9d370890efc'),
  ('ccd76514-7126-485a-8d10-f0ccfcabb1fa', 'oracao subordinada causal', '3f3bd4687fd29b77a26ba96084f2392e'),
  ('f7606396-81ba-4c8d-aa40-1b3fa27e33c9', 'oracao subordinada concessiva', '1e7cae56e4b33fc24932f4deb283a33d'),
  ('5acdd097-fb3c-444a-95bf-4c7ca80fe4fe', 'oracao subordinada coordenada sindetica aditiva', 'aeae71618ca8de06415634537d9bd149'),
  ('81ba185f-37c6-4587-9275-621e4c42a27d', 'oracao subordinada substantiva', 'fe525551baefd00e5326457e8bd355c6'),
  ('a80455ff-11e1-4c00-8694-580c234fb750', 'pontuacao no periodo simples', '807a85ddd9dea22d348a8362f1b55888'),
  ('067aa77c-b3b7-4d9c-b856-d3446a89081d', 'principais funcoes morfossintaticas do “que”', '52f97b533522ccbbe2213cf335bb714c'),
  ('753a0e4f-c42d-49a7-bd26-8ad65c6cced2', 'subordinacao (oracao adjetiva)', '724e593454c5612e15460a36f96828db'),
  ('34156910-c3f5-4d3f-8bc4-a3286e2abb6b', 'tipologia textual', 'a8f2430c55378183c8ea11c0dc2414de'),
  ('c960eaf2-d5bd-401c-8ced-927f409e4154', 'transitividade', 'b30a33e113da3c468895d0e50eba3691'),
  ('7fd01721-50af-41c9-8f08-30eb9d35f3a4', 'transitividade verbal', '231c7f8b3616f050741ff0466d38a1b8'),
  ('6966f2fd-da6e-44cc-b58e-59bd3437cb83', 'voz passiva', '58c6498647bac7429b3c24dc6092dc7f');

create temp table _ppc_deleted_topics (id uuid primary key, normalized_name text not null, subject_id uuid, md5_rest text not null) on commit drop;
insert into _ppc_deleted_topics (id, normalized_name, subject_id, md5_rest) values
  ('907e50c0-fb19-4a53-ba4a-b48066a86f05', 'bla bla', 'c484e59f-33e9-4c97-a214-07673254c754', '290efbd4a6a4f375965346eb4116ce87'),
  ('6cf61a37-ac51-4365-99b8-2d5ef2e7f6ac', 'azeite de oliva', null, '6c0d95407bb932c1e8160608cb3845df'),
  ('133b3214-d3bb-4418-9086-ef240b6726da', 'gaffarinha', null, '09444d13f71d4f85d92c3d81f0802e38'),
  ('fb4c8018-3599-441c-9c92-657f714c7beb', 'teste - concordancia', null, '2407521bf6cc3d22fac614d35035976d');

create temp table _ppc_fingerprints (name text primary key, before_value text, after_value text) on commit drop;

do $$
declare
  v_discipline constant uuid := '2e2ef950-faee-4ef6-89c1-d5327aea1800';
  v_subject constant uuid := '38b30a5e-78fb-4e25-b9cb-dcc2cfa44e4a';
  v_test_subject constant uuid := 'c484e59f-33e9-4c97-a214-07673254c754';
  v_count integer;
begin
  -- -------------------------------------------------------------------------
  -- PASSO 1 — pré-condições (com bloqueio das linhas envolvidas)
  -- -------------------------------------------------------------------------
  perform 1 from public.disciplines where id = v_discipline for update;
  if not exists (select 1 from public.disciplines where id = v_discipline and name = 'Português') then
    raise exception 'PRE: disciplina Português não encontrada pelo id confirmado.';
  end if;

  if exists (select 1 from public.subjects where id = v_subject)
     or exists (select 1 from public.subjects where lower(name) = lower('Português para Concursos')) then
    raise exception 'PRE: o assunto "Português para Concursos" (ou o id reservado) já existe; reutilização exige nova análise.';
  end if;

  perform 1 from public.questions where id in (select id from _ppc_questions) for update;
  perform 1 from public.topics where discipline_id = v_discipline for update;
  perform 1 from public.subjects where discipline_id = v_discipline for update;

  select count(*) into v_count from public.questions where discipline_id = v_discipline;
  if v_count <> 10 then
    raise exception 'PRE: esperadas 10 questões em Português, encontradas %.', v_count;
  end if;

  select count(*) into v_count
  from public.questions q
  join _ppc_questions e on e.id = q.id
  where q.subject_id is null
    and q.discipline_id = v_discipline
    and q.code = e.code
    and q.status = 'published'
    and md5(q.evaluated_topics::text) = e.md5_topics
    and md5(((to_jsonb(q) - 'subject_id') - 'updated_at')::text) = e.md5_rest;
  if v_count <> 10 then
    raise exception 'PRE: as 10 questões não estão no estado do backup (conferidas: %).', v_count;
  end if;

  if exists (select 1 from public.question_subjects where question_id in (select id from _ppc_questions)) then
    raise exception 'PRE: as questões já possuem vínculos em question_subjects.';
  end if;

  select count(*) into v_count from public.topics where discipline_id = v_discipline;
  if v_count <> 18 then
    raise exception 'PRE: esperados 18 tópicos em Português, encontrados %.', v_count;
  end if;

  select count(*) into v_count
  from public.topics t
  join _ppc_moved_topics e on e.id = t.id
  where t.discipline_id = v_discipline
    and t.subject_id is null
    and t.normalized_name = e.normalized_name
    and md5(((to_jsonb(t) - 'subject_id') - 'updated_at')::text) = e.md5_rest;
  if v_count <> 14 then
    raise exception 'PRE: os 14 tópicos a mover não estão no estado do backup (conferidos: %).', v_count;
  end if;

  -- Os tópicos das 10 questões são exatamente os 14 tópicos a mover (pela normalização do banco).
  if exists (
    select public.normalize_topic_key(topic)
    from public.questions q, unnest(q.evaluated_topics) as topic
    where q.id in (select id from _ppc_questions)
    except
    select normalized_name from _ppc_moved_topics
  ) or exists (
    select normalized_name from _ppc_moved_topics
    except
    select public.normalize_topic_key(topic)
    from public.questions q, unnest(q.evaluated_topics) as topic
    where q.id in (select id from _ppc_questions)
  ) then
    raise exception 'PRE: os tópicos avaliados das questões não correspondem aos 14 tópicos a mover.';
  end if;

  if exists (select 1 from public.topics where subject_id = v_subject) then
    raise exception 'PRE: já existem tópicos no id reservado do novo assunto.';
  end if;

  -- Exclusões: estado exato e ausência de dependências.
  if not exists (
    select 1 from public.subjects s
    where s.id = v_test_subject and s.name = 'Teste - Pablo' and s.discipline_id = v_discipline
      and md5(to_jsonb(s)::text) = 'f3cfb0c79f83b96acc26e19c9182ab0b'
  ) then
    raise exception 'PRE: assunto "Teste - Pablo" ausente ou alterado desde o backup.';
  end if;

  select count(*) into v_count
  from public.topics t
  join _ppc_deleted_topics e on e.id = t.id
  where t.discipline_id = v_discipline
    and t.subject_id is not distinct from e.subject_id
    and t.normalized_name = e.normalized_name
    and md5(((to_jsonb(t) - 'subject_id') - 'updated_at')::text) = e.md5_rest;
  if v_count <> 4 then
    raise exception 'PRE: os 4 tópicos a excluir não estão no estado do backup (conferidos: %).', v_count;
  end if;

  if exists (select 1 from public.topics where subject_id = v_test_subject and id <> '907e50c0-fb19-4a53-ba4a-b48066a86f05')
     or exists (select 1 from public.questions where subject_id = v_test_subject)
     or exists (select 1 from public.question_subjects where subject_id = v_test_subject)
     or exists (select 1 from public.exam_analysis_questions where subject_id = v_test_subject or v_test_subject = any(subject_ids)) then
    raise exception 'PRE: o assunto "Teste - Pablo" possui dependências.';
  end if;

  if exists (
    select 1
    from public.questions q, unnest(q.evaluated_topics) as topic
    where public.normalize_topic_key(topic) in (select normalized_name from _ppc_deleted_topics)
  ) or exists (
    select 1 from public.exam_analysis_questions
    where public.normalize_topic_key(coalesce(subtopic_name, '')) in (select normalized_name from _ppc_deleted_topics)
  ) then
    raise exception 'PRE: algum tópico a excluir está em uso.';
  end if;

  -- Nenhuma tentativa em andamento nos Simulados que usam as questões.
  if exists (
    select 1 from public.simulado_attempts a
    where a.status = 'in_progress'
      and a.simulado_id in (select simulado_id from public.simulado_questions where question_id in (select id from _ppc_questions))
  ) then
    raise exception 'PRE: há tentativa em andamento em Simulado com estas questões; executar em outra janela.';
  end if;

  -- Impressões dos dados protegidos (comparadas no PASSO 7, na mesma transação).
  insert into _ppc_fingerprints (name, before_value)
  select 'simulado_questions', md5(coalesce(string_agg(md5(s::text), '' order by s.id), ''))
    from public.simulado_questions s where s.question_id in (select id from _ppc_questions)
  union all
  select 'simulados', md5(coalesce(string_agg(md5(s::text), '' order by s.id), ''))
    from public.simulados s where s.id in (select simulado_id from public.simulado_questions where question_id in (select id from _ppc_questions))
  union all
  select 'simulado_attempts', md5(coalesce(string_agg(md5(a::text), '' order by a.id), ''))
    from public.simulado_attempts a where a.simulado_id in (select simulado_id from public.simulado_questions where question_id in (select id from _ppc_questions))
  union all
  select 'simulado_results', md5(coalesce(string_agg(md5(r::text), '' order by r.id), ''))
    from public.simulado_results r where r.simulado_id in (select simulado_id from public.simulado_questions where question_id in (select id from _ppc_questions))
  union all
  select 'simulado_answers', md5(coalesce(string_agg(md5(a::text), '' order by a.id), ''))
    from public.simulado_answers a where a.question_id in (select id from _ppc_questions)
  union all
  select 'question_alternatives', md5(coalesce(string_agg(md5(a::text), '' order by a.id), ''))
    from public.question_alternatives a where a.question_id in (select id from _ppc_questions)
  union all
  select 'other_questions', md5(coalesce(string_agg(md5(q::text), '' order by q.id), ''))
    from public.questions q where q.discipline_id is distinct from v_discipline
  union all
  select 'other_topics', md5(coalesce(string_agg(md5(t::text), '' order by t.id), ''))
    from public.topics t where t.discipline_id <> v_discipline
  union all
  select 'other_subjects', md5(coalesce(string_agg(md5(s::text), '' order by s.id), ''))
    from public.subjects s where s.discipline_id is distinct from v_discipline
  union all
  select 'other_question_subjects', md5(coalesce(string_agg(md5(qs::text), '' order by qs.id), ''))
    from public.question_subjects qs where qs.question_id not in (select id from _ppc_questions)
  union all
  select 'disciplines', md5(coalesce(string_agg(md5(d::text), '' order by d.id), ''))
    from public.disciplines d;

  -- -------------------------------------------------------------------------
  -- PASSO 2 — novo assunto
  -- -------------------------------------------------------------------------
  insert into public.subjects (id, name, description, is_active, discipline_id)
  values (v_subject, 'Português para Concursos', null, true, v_discipline);

  -- -------------------------------------------------------------------------
  -- PASSO 3 — mover os 14 tópicos (antes das questões; ver cabeçalho)
  -- -------------------------------------------------------------------------
  update public.topics
  set subject_id = v_subject
  where id in (select id from _ppc_moved_topics)
    and subject_id is null
    and discipline_id = v_discipline;
  get diagnostics v_count = row_count;
  if v_count <> 14 then
    raise exception 'PASSO 3: esperados 14 tópicos movidos, movidos %.', v_count;
  end if;

  -- -------------------------------------------------------------------------
  -- PASSO 4 — atribuir o assunto às 10 questões (evaluated_topics não é tocado)
  -- -------------------------------------------------------------------------
  update public.questions
  set subject_id = v_subject
  where id in (select id from _ppc_questions)
    and subject_id is null
    and discipline_id = v_discipline;
  get diagnostics v_count = row_count;
  if v_count <> 10 then
    raise exception 'PASSO 4: esperadas 10 questões atualizadas, atualizadas %.', v_count;
  end if;

  -- -------------------------------------------------------------------------
  -- PASSO 5 — vínculos em question_subjects
  -- -------------------------------------------------------------------------
  insert into public.question_subjects (question_id, subject_id)
  select id, v_subject from _ppc_questions
  on conflict (question_id, subject_id) do nothing;
  get diagnostics v_count = row_count;
  if v_count <> 10 then
    raise exception 'PASSO 5: esperados 10 vínculos criados, criados %.', v_count;
  end if;

  -- -------------------------------------------------------------------------
  -- PASSO 6 — exclusões aprovadas (dependências revalidadas imediatamente antes)
  -- -------------------------------------------------------------------------
  if exists (
    select 1
    from public.questions q, unnest(q.evaluated_topics) as topic
    where public.normalize_topic_key(topic) in (select normalized_name from _ppc_deleted_topics)
  ) or exists (select 1 from public.questions where subject_id = v_test_subject)
     or exists (select 1 from public.question_subjects where subject_id = v_test_subject) then
    raise exception 'PASSO 6: dependência surgiu antes da exclusão.';
  end if;

  delete from public.topics t
  using _ppc_deleted_topics e
  where t.id = e.id
    and t.normalized_name = e.normalized_name
    and t.discipline_id = v_discipline;
  get diagnostics v_count = row_count;
  if v_count <> 4 then
    raise exception 'PASSO 6: esperados 4 tópicos excluídos, excluídos %.', v_count;
  end if;

  if exists (select 1 from public.topics where subject_id = v_test_subject) then
    raise exception 'PASSO 6: o assunto de teste ainda possui tópicos; exclusão abortada.';
  end if;

  delete from public.subjects where id = v_test_subject and name = 'Teste - Pablo' and discipline_id = v_discipline;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'PASSO 6: esperado 1 assunto de teste excluído, excluídos %.', v_count;
  end if;

  -- -------------------------------------------------------------------------
  -- PASSO 7 — pós-condições (qualquer falha desfaz tudo)
  -- -------------------------------------------------------------------------
  if not exists (select 1 from public.subjects where id = v_subject and name = 'Português para Concursos' and discipline_id = v_discipline and is_active)
     or (select count(*) from public.subjects where discipline_id = v_discipline) <> 1 then
    raise exception 'POS: assuntos de Português divergentes do esperado.';
  end if;

  select count(*) into v_count
  from public.topics t
  join _ppc_moved_topics e on e.id = t.id
  where t.subject_id = v_subject
    and t.discipline_id = v_discipline
    and t.normalized_name = e.normalized_name
    and md5(((to_jsonb(t) - 'subject_id') - 'updated_at')::text) = e.md5_rest;
  if v_count <> 14 or (select count(*) from public.topics where discipline_id = v_discipline) <> 14 then
    raise exception 'POS: tópicos de Português divergentes (preservados: %).', v_count;
  end if;

  if exists (select 1 from public.topics where subject_id = v_subject group by normalized_name having count(*) > 1)
     or exists (select 1 from public.topics where discipline_id = v_discipline and subject_id is null) then
    raise exception 'POS: duplicidade ou tópico direto remanescente em Português.';
  end if;

  select count(*) into v_count
  from public.questions q
  join _ppc_questions e on e.id = q.id
  where q.subject_id = v_subject
    and q.discipline_id = v_discipline
    and md5(q.evaluated_topics::text) = e.md5_topics
    and md5(((to_jsonb(q) - 'subject_id') - 'updated_at')::text) = e.md5_rest;
  if v_count <> 10 then
    raise exception 'POS: questões divergentes (preservadas: %).', v_count;
  end if;

  if (select count(*) from public.question_subjects where subject_id = v_subject) <> 10
     or (select count(distinct question_id) from public.question_subjects where subject_id = v_subject and question_id in (select id from _ppc_questions)) <> 10
     or (select count(*) from public.question_subjects where question_id in (select id from _ppc_questions)) <> 10 then
    raise exception 'POS: vínculos em question_subjects divergentes.';
  end if;

  if exists (select 1 from public.subjects where id = v_test_subject)
     or exists (select 1 from public.topics where id in (select id from _ppc_deleted_topics)) then
    raise exception 'POS: registros de teste não foram excluídos.';
  end if;

  update _ppc_fingerprints f set after_value = x.value
  from (
    select 'simulado_questions' as name, md5(coalesce(string_agg(md5(s::text), '' order by s.id), '')) as value
      from public.simulado_questions s where s.question_id in (select id from _ppc_questions)
    union all
    select 'simulados', md5(coalesce(string_agg(md5(s::text), '' order by s.id), ''))
      from public.simulados s where s.id in (select simulado_id from public.simulado_questions where question_id in (select id from _ppc_questions))
    union all
    select 'simulado_attempts', md5(coalesce(string_agg(md5(a::text), '' order by a.id), ''))
      from public.simulado_attempts a where a.simulado_id in (select simulado_id from public.simulado_questions where question_id in (select id from _ppc_questions))
    union all
    select 'simulado_results', md5(coalesce(string_agg(md5(r::text), '' order by r.id), ''))
      from public.simulado_results r where r.simulado_id in (select simulado_id from public.simulado_questions where question_id in (select id from _ppc_questions))
    union all
    select 'simulado_answers', md5(coalesce(string_agg(md5(a::text), '' order by a.id), ''))
      from public.simulado_answers a where a.question_id in (select id from _ppc_questions)
    union all
    select 'question_alternatives', md5(coalesce(string_agg(md5(a::text), '' order by a.id), ''))
      from public.question_alternatives a where a.question_id in (select id from _ppc_questions)
    union all
    select 'other_questions', md5(coalesce(string_agg(md5(q::text), '' order by q.id), ''))
      from public.questions q where q.discipline_id is distinct from v_discipline
    union all
    select 'other_topics', md5(coalesce(string_agg(md5(t::text), '' order by t.id), ''))
      from public.topics t where t.discipline_id <> v_discipline
    union all
    select 'other_subjects', md5(coalesce(string_agg(md5(s::text), '' order by s.id), ''))
      from public.subjects s where s.discipline_id is distinct from v_discipline
    union all
    select 'other_question_subjects', md5(coalesce(string_agg(md5(qs::text), '' order by qs.id), ''))
      from public.question_subjects qs where qs.question_id not in (select id from _ppc_questions)
    union all
    select 'disciplines', md5(coalesce(string_agg(md5(d::text), '' order by d.id), ''))
      from public.disciplines d
  ) x
  where x.name = f.name;

  if exists (select 1 from _ppc_fingerprints where after_value is distinct from before_value)
     or (select count(*) from _ppc_fingerprints) <> 11 then
    raise exception 'POS: dados protegidos alterados durante a migration: %.',
      (select string_agg(name, ', ') from _ppc_fingerprints where after_value is distinct from before_value);
  end if;
end;
$$;

commit;

-- ===========================================================================
-- ROLLBACK (NÃO EXECUTAR SEM AUTORIZAÇÃO). Cópia executável e testada:
--   D:/Projetos_Software/estudotop-simulados/Backups/2026-10-01-portugues-para-concursos/rollback.sql
-- Ordem obrigatória: tópicos voltam ao escopo direto ANTES das questões perderem o assunto; caso
-- contrário trg_questions_sync_topics_on_review recria tópicos diretos e o rollback deixa duplicatas.
-- Restaura com ids, nomes, datas e propriedades originais (do backup) o assunto "Teste - Pablo" e os
-- 4 tópicos excluídos. Não restaurável sem desligar triggers: updated_at das 10 questões e dos 14
-- tópicos movidos.
-- ===========================================================================
