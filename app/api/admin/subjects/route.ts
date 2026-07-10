import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeComparableName, normalizeEntityName } from "@/lib/utils/text";
import { requireAdmin } from "@/lib/server/authGuard";


const SUBJECT_RENAME_MAP: Record<string, string> = {
  windows: "Microsoft Windows",
  word: "Microsoft Word",
  excel: "Microsoft Excel",
  powerpoint: "Microsoft PowerPoint",
};

function canonicalizeSubjectName(name: string) {
  const normalized = normalizeEntityName(name);
  const comparable = normalizeComparableName(normalized);
  return SUBJECT_RENAME_MAP[comparable] || normalized;
}

type SubjectPayload = {
  id?: string;
  name?: string;
  discipline_id?: string;
  description?: string;
  is_active?: boolean;
};

async function findDuplicate({
  name,
  disciplineId,
  ignoreId,
}: {
  name: string;
  disciplineId: string;
  ignoreId?: string;
}) {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("subjects")
    .select("id, name")
    .eq("discipline_id", disciplineId);

  if (ignoreId) {
    query = query.neq("id", ignoreId);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const comparable = normalizeComparableName(name);
  return (data || []).find((item) => normalizeComparableName(item.name) === comparable) || null;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await request.json()) as SubjectPayload;

    const name = canonicalizeSubjectName(body.name || "");
    const disciplineId = body.discipline_id;

    if (!disciplineId) {
      return NextResponse.json(
        { ok: false, message: "Selecione uma disciplina para cadastrar o assunto." },
        { status: 400 }
      );
    }

    if (!name || name.length < 2) {
      return NextResponse.json(
        { ok: false, message: "Informe um assunto válido." },
        { status: 400 }
      );
    }

    const existing = await findDuplicate({
      name,
      disciplineId,
    });

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          message: `O assunto "${existing.name}" já existe nessa disciplina.`,
        },
        { status: 409 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: inserted, error } = await supabase
      .from("subjects")
      .insert({
        name,
        discipline_id: disciplineId,
        is_active: true,
      })
      .select("id, name, discipline_id, is_active")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Assunto "${name}" cadastrado com sucesso.`,
      subject: inserted,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao cadastrar assunto.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await request.json()) as SubjectPayload;

    if (!body.id) {
      return NextResponse.json(
        { ok: false, message: "ID do assunto não informado." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = canonicalizeSubjectName(body.name);

      if (!name || name.length < 2) {
        return NextResponse.json(
          { ok: false, message: "Informe um assunto válido." },
          { status: 400 }
        );
      }

      if (!body.discipline_id) {
        return NextResponse.json(
          { ok: false, message: "Disciplina do assunto não informada." },
          { status: 400 }
        );
      }

      const existing = await findDuplicate({
        name,
        disciplineId: body.discipline_id,
        ignoreId: body.id,
      });

      if (existing) {
        return NextResponse.json(
          {
            ok: false,
            message: `O assunto "${existing.name}" já existe nessa disciplina.`,
          },
          { status: 409 }
        );
      }

      updates.name = name;
    }

    if (typeof body.discipline_id === "string") {
      updates.discipline_id = body.discipline_id;
    }

    if (typeof body.is_active === "boolean") {
      updates.is_active = body.is_active;
    }

    const { data: updated, error } = await supabase
      .from("subjects")
      .update(updates)
      .eq("id", body.id)
      .select("id, name, discipline_id, is_active")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Assunto atualizado com sucesso.",
      subject: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao atualizar assunto.",
      },
      { status: 500 }
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
      return NextResponse.json(
        { ok: false, message: "ID do assunto não informado." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: blockingQuestions, error: countError } = await supabase
      .from("questions")
      .select("id, code, status")
      .eq("subject_id", id);

    if (countError) {
      return NextResponse.json(
        { ok: false, message: countError.message },
        { status: 400 }
      );
    }

    if ((blockingQuestions || []).length > 0) {
      const visibleCodes = blockingQuestions.slice(0, 8).map((q) => `${q.code || q.id.slice(0, 8)} (${q.status})`);
      const remaining = blockingQuestions.length - visibleCodes.length;
      const codes = `${visibleCodes.join(", ")}${remaining > 0 ? ` e mais ${remaining}` : ""}`;
      return NextResponse.json(
        {
          ok: false,
          message: `Não é possível excluir: ${blockingQuestions.length} ${blockingQuestions.length === 1 ? "questão está vinculada" : "questões estão vinculadas"} a este assunto como assunto principal: ${codes}. Questões arquivadas também bloqueiam a exclusão — reatribua o assunto delas ou exclua-as definitivamente antes.`,
          affected_questions: blockingQuestions,
        },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("subjects")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Assunto excluído com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao excluir assunto.",
      },
      { status: 500 }
    );
  }
}
