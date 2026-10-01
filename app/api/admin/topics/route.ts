import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeTopicComparableName, normalizeTopicName } from "@/lib/utils/text";
import { requireAdmin } from "@/lib/server/authGuard";

type TopicPayload = {
  id?: string;
  name?: string;
  subject_id?: string | null;
  discipline_id?: string | null;
  is_active?: boolean;
  confirm_question_update?: boolean;
};

type TopicQuestionUsage = { id: string; code: string };

// Tópico de Assunto: escopo = assunto. Tópico direto: escopo = disciplina com subject_id nulo.
type TopicScope = { subjectId: string | null; disciplineId: string };

const TOPIC_COLUMNS = "id, name, normalized_name, subject_id, discipline_id, is_active, created_at, updated_at";

function scopeLabel(scope: TopicScope) {
  return scope.subjectId ? "neste assunto" : "nesta disciplina";
}

async function findDuplicate(name: string, scope: TopicScope, ignoreId?: string) {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("topics").select("id, name");
  query = scope.subjectId
    ? query.eq("subject_id", scope.subjectId)
    : query.eq("discipline_id", scope.disciplineId).is("subject_id", null);

  if (ignoreId) query = query.neq("id", ignoreId);

  const { data, error } = await query;
  if (error) throw new Error("Não foi possível verificar os tópicos existentes.");

  const comparable = normalizeTopicComparableName(name);
  return (data || []).find((topic) => normalizeTopicComparableName(topic.name) === comparable) || null;
}

async function findQuestionUsage(scope: TopicScope, topicName: string): Promise<TopicQuestionUsage[]> {
  const supabase = createSupabaseAdminClient();
  const questions: Array<{ id: string; code: string | null; evaluated_topics: string[] | null }> = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("questions")
      .select("id, code, evaluated_topics");
    query = scope.subjectId
      ? query.eq("subject_id", scope.subjectId)
      : query.eq("discipline_id", scope.disciplineId).is("subject_id", null);

    const { data, error } = await query
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error("Não foi possível verificar o uso do tópico.");

    const rows = data || [];
    questions.push(...rows);
    if (rows.length < pageSize) break;
  }

  const comparable = normalizeTopicComparableName(topicName);
  return questions
    .filter((question) =>
      Array.isArray(question.evaluated_topics)
      && question.evaluated_topics.some((name) => normalizeTopicComparableName(name) === comparable),
    )
    .map((question) => ({ id: question.id, code: question.code || question.id.slice(0, 8) }));
}

function usageMessage(questions: TopicQuestionUsage[]) {
  const visibleCodes = questions.slice(0, 8).map((question) => question.code);
  const remaining = questions.length - visibleCodes.length;
  const codes = `${visibleCodes.join(", ")}${remaining > 0 ? ` e mais ${remaining}` : ""}`;
  return `${questions.length} ${questions.length === 1 ? "questão utiliza" : "questões utilizam"} este tópico: ${codes}.`;
}

async function resolveScope(subjectId: string | null, disciplineId: string | null): Promise<TopicScope | { error: string }> {
  if (subjectId) {
    const supabase = createSupabaseAdminClient();
    const { data: subject, error } = await supabase
      .from("subjects")
      .select("id, discipline_id")
      .eq("id", subjectId)
      .maybeSingle();

    if (error) throw new Error("Não foi possível consultar o assunto.");
    if (!subject) return { error: "Assunto não encontrado." };
    if (!subject.discipline_id) return { error: "O assunto selecionado não pertence a nenhuma disciplina." };
    if (disciplineId && disciplineId !== subject.discipline_id) {
      return { error: "O assunto selecionado não pertence à disciplina informada." };
    }
    return { subjectId, disciplineId: subject.discipline_id };
  }

  if (!disciplineId) return { error: "Selecione a disciplina do tópico." };
  return { subjectId: null, disciplineId };
}

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get("subject_id");
    const disciplineId = searchParams.get("discipline_id");
    const directOnly = searchParams.get("direct") === "true";
    const activeOnly = searchParams.get("active") === "true";
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("topics")
      .select(TOPIC_COLUMNS)
      .order("name", { ascending: true });

    if (subjectId) query = query.eq("subject_id", subjectId);
    if (disciplineId) query = query.eq("discipline_id", disciplineId);
    if (directOnly) query = query.is("subject_id", null);
    if (activeOnly) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw new Error("Não foi possível carregar os tópicos.");

    return NextResponse.json({ ok: true, message: "Tópicos carregados com sucesso.", topics: data || [] });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao carregar tópicos." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await request.json()) as TopicPayload;
    const name = normalizeTopicName(body.name || "");
    const scope = await resolveScope(body.subject_id || null, body.discipline_id || null);

    if ("error" in scope) {
      return NextResponse.json({ ok: false, message: scope.error }, { status: 400 });
    }

    if (name.length < 2) {
      return NextResponse.json({ ok: false, message: "Informe um tópico válido." }, { status: 400 });
    }

    const existing = await findDuplicate(name, scope);
    if (existing) {
      return NextResponse.json(
        { ok: false, message: `O tópico "${existing.name}" já existe ${scopeLabel(scope)}.` },
        { status: 409 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("topics")
      .insert({
        subject_id: scope.subjectId,
        discipline_id: scope.disciplineId,
        name,
        normalized_name: normalizeTopicComparableName(name),
        is_active: true,
      })
      .select(TOPIC_COLUMNS)
      .single();

    if (error) throw new Error("Não foi possível cadastrar o tópico.");

    return NextResponse.json({ ok: true, message: `Tópico "${name}" cadastrado com sucesso.`, topic: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao cadastrar tópico." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await request.json()) as TopicPayload;

    if (!body.id) {
      return NextResponse.json({ ok: false, message: "ID do tópico não informado." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: current, error: currentError } = await supabase
      .from("topics")
      .select("id, name, subject_id, discipline_id, is_active")
      .eq("id", body.id)
      .maybeSingle();

    if (currentError) throw new Error("Não foi possível consultar o tópico.");
    if (!current) return NextResponse.json({ ok: false, message: "Tópico não encontrado." }, { status: 404 });

    const scopeChanged = body.subject_id !== undefined || body.discipline_id !== undefined;
    const resolvedScope = scopeChanged
      ? await resolveScope(
          body.subject_id !== undefined ? body.subject_id || null : current.subject_id,
          body.discipline_id !== undefined ? body.discipline_id || null : current.discipline_id,
        )
      : { subjectId: current.subject_id, disciplineId: current.discipline_id };

    if ("error" in resolvedScope) {
      return NextResponse.json({ ok: false, message: resolvedScope.error }, { status: 400 });
    }

    const scope: TopicScope = resolvedScope;
    const currentScope: TopicScope = { subjectId: current.subject_id, disciplineId: current.discipline_id };
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = normalizeTopicName(body.name);
      if (name.length < 2) {
        return NextResponse.json({ ok: false, message: "Informe um tópico válido." }, { status: 400 });
      }

      const existing = await findDuplicate(name, scope, body.id);
      if (existing) {
        return NextResponse.json(
          { ok: false, message: `O tópico "${existing.name}" já existe ${scopeLabel(scope)}.` },
          { status: 409 },
        );
      }

      const affectedQuestions = current.name === name ? [] : await findQuestionUsage(currentScope, current.name);
      if (affectedQuestions.length > 0 && !body.confirm_question_update) {
        return NextResponse.json(
          {
            ok: false,
            message: `${usageMessage(affectedQuestions)} Confirme para atualizar o nome também nessas questões.`,
            requires_confirmation: true,
            affected_questions: affectedQuestions,
          },
          { status: 409 },
        );
      }

      if (affectedQuestions.length > 0) {
        const { data: renameResult, error: renameError } = await supabase.rpc("rename_topic_and_question_references", {
          p_topic_id: body.id,
          p_new_name: name,
        });

        if (renameError) throw new Error("Não foi possível atualizar o tópico e suas questões.");

        const { data: updatedTopic, error: updatedTopicError } = await supabase
          .from("topics")
          .select(TOPIC_COLUMNS)
          .eq("id", body.id)
          .single();

        if (updatedTopicError) throw new Error("O tópico foi atualizado, mas não pôde ser recarregado.");

        const affectedCount = Number(renameResult?.[0]?.affected_count || affectedQuestions.length);
        return NextResponse.json({
          ok: true,
          message: `Tópico atualizado também em ${affectedCount} ${affectedCount === 1 ? "questão" : "questões"}.`,
          topic: updatedTopic,
          affected_questions: affectedQuestions,
        });
      }

      updates.name = name;
      updates.normalized_name = normalizeTopicComparableName(name);
    }

    if (scopeChanged) {
      updates.subject_id = scope.subjectId;
      updates.discipline_id = scope.disciplineId;
    }
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

    const { data, error } = await supabase
      .from("topics")
      .update(updates)
      .eq("id", body.id)
      .select(TOPIC_COLUMNS)
      .single();

    if (error) throw new Error("Não foi possível atualizar o tópico.");

    return NextResponse.json({ ok: true, message: "Tópico atualizado com sucesso.", topic: data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao atualizar tópico." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ ok: false, message: "ID do tópico não informado." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .select("id, name, subject_id, discipline_id")
      .eq("id", id)
      .maybeSingle();

    if (topicError) throw new Error("Não foi possível consultar o tópico.");
    if (!topic) return NextResponse.json({ ok: false, message: "Tópico não encontrado." }, { status: 404 });

    const affectedQuestions = await findQuestionUsage({ subjectId: topic.subject_id, disciplineId: topic.discipline_id }, topic.name);

    if (affectedQuestions.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: `${usageMessage(affectedQuestions)} Inative-o em vez de excluir.`,
          affected_questions: affectedQuestions,
        },
        { status: 400 },
      );
    }

    const { error } = await supabase.from("topics").delete().eq("id", id);
    if (error) throw new Error("Não foi possível excluir o tópico.");

    return NextResponse.json({ ok: true, message: "Tópico excluído com sucesso." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado ao excluir tópico." },
      { status: 500 },
    );
  }
}
