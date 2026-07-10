import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeTopicComparableName, normalizeTopicName } from "@/lib/utils/text";
import { requireAdmin } from "@/lib/server/authGuard";

type TopicPayload = {
  id?: string;
  name?: string;
  subject_id?: string;
  is_active?: boolean;
  confirm_question_update?: boolean;
};

type TopicQuestionUsage = { id: string; code: string };

async function findDuplicate(name: string, subjectId: string, ignoreId?: string) {
  const supabase = createSupabaseAdminClient();
  let query = supabase.from("topics").select("id, name").eq("subject_id", subjectId);

  if (ignoreId) query = query.neq("id", ignoreId);

  const { data, error } = await query;
  if (error) throw new Error("Não foi possível verificar os tópicos existentes.");

  const comparable = normalizeTopicComparableName(name);
  return (data || []).find((topic) => normalizeTopicComparableName(topic.name) === comparable) || null;
}

async function findQuestionUsage(subjectId: string, topicName: string): Promise<TopicQuestionUsage[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("questions")
    .select("id, code, evaluated_topics")
    .eq("subject_id", subjectId);

  if (error) throw new Error("Não foi possível verificar o uso do tópico.");

  const comparable = normalizeTopicComparableName(topicName);
  return (data || [])
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

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get("subject_id");
    const activeOnly = searchParams.get("active") === "true";
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("topics")
      .select("id, name, normalized_name, subject_id, is_active, created_at, updated_at")
      .order("name", { ascending: true });

    if (subjectId) query = query.eq("subject_id", subjectId);
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
    const subjectId = body.subject_id;

    if (!subjectId) {
      return NextResponse.json({ ok: false, message: "Selecione um assunto para cadastrar o tópico." }, { status: 400 });
    }

    if (name.length < 2) {
      return NextResponse.json({ ok: false, message: "Informe um tópico válido." }, { status: 400 });
    }

    const existing = await findDuplicate(name, subjectId);
    if (existing) {
      return NextResponse.json(
        { ok: false, message: `O tópico "${existing.name}" já existe neste assunto.` },
        { status: 409 },
      );
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("topics")
      .insert({ subject_id: subjectId, name, normalized_name: normalizeTopicComparableName(name), is_active: true })
      .select("id, name, normalized_name, subject_id, is_active, created_at, updated_at")
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
      .select("id, name, subject_id, is_active")
      .eq("id", body.id)
      .maybeSingle();

    if (currentError) throw new Error("Não foi possível consultar o tópico.");
    if (!current) return NextResponse.json({ ok: false, message: "Tópico não encontrado." }, { status: 404 });

    const subjectId = body.subject_id || current.subject_id;
    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = normalizeTopicName(body.name);
      if (name.length < 2) {
        return NextResponse.json({ ok: false, message: "Informe um tópico válido." }, { status: 400 });
      }

      const existing = await findDuplicate(name, subjectId, body.id);
      if (existing) {
        return NextResponse.json(
          { ok: false, message: `O tópico "${existing.name}" já existe neste assunto.` },
          { status: 409 },
        );
      }

      const affectedQuestions = current.name === name ? [] : await findQuestionUsage(subjectId, current.name);
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
          .select("id, name, normalized_name, subject_id, is_active, created_at, updated_at")
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

    if (typeof body.subject_id === "string") updates.subject_id = body.subject_id;
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

    const { data, error } = await supabase
      .from("topics")
      .update(updates)
      .eq("id", body.id)
      .select("id, name, normalized_name, subject_id, is_active, created_at, updated_at")
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
      .select("id, name, subject_id")
      .eq("id", id)
      .maybeSingle();

    if (topicError) throw new Error("Não foi possível consultar o tópico.");
    if (!topic) return NextResponse.json({ ok: false, message: "Tópico não encontrado." }, { status: 404 });

    const affectedQuestions = await findQuestionUsage(topic.subject_id, topic.name);

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
