import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeComparableName, normalizeEntityName } from "@/lib/utils/text";
import { requireAdmin } from "@/lib/server/authGuard";

type DisciplinePayload = {
  id?: string;
  name?: string;
  description?: string;
  is_active?: boolean;
};

async function findDuplicate(name: string, ignoreId?: string) {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("disciplines")
    .select("id, name");

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
    const body = (await request.json()) as DisciplinePayload;

    const name = normalizeEntityName(body.name || "");
    const description = (body.description || "").trim() || null;

    if (!name || name.length < 3) {
      return NextResponse.json(
        { ok: false, message: "Informe uma disciplina válida." },
        { status: 400 }
      );
    }

    const existing = await findDuplicate(name);

    if (existing) {
      return NextResponse.json(
        {
          ok: false,
          message: `A disciplina "${existing.name}" já existe no sistema.`,
        },
        { status: 409 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { error } = await supabase.from("disciplines").insert({
      name,
      description,
      is_active: true,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Disciplina "${name}" cadastrada com sucesso.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao cadastrar disciplina.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await request.json()) as DisciplinePayload;

    if (!body.id) {
      return NextResponse.json(
        { ok: false, message: "ID da disciplina não informado." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const updates: Record<string, unknown> = {};

    if (typeof body.name === "string") {
      const name = normalizeEntityName(body.name);

      if (!name || name.length < 3) {
        return NextResponse.json(
          { ok: false, message: "Informe uma disciplina válida." },
          { status: 400 }
        );
      }

      const existing = await findDuplicate(name, body.id);

      if (existing) {
        return NextResponse.json(
          {
            ok: false,
            message: `A disciplina "${existing.name}" já existe no sistema.`,
          },
          { status: 409 }
        );
      }

      updates.name = name;
    }

    if (typeof body.description === "string") {
      updates.description = body.description.trim() || null;
    }

    if (typeof body.is_active === "boolean") {
      updates.is_active = body.is_active;
    }

    const { error } = await supabase
      .from("disciplines")
      .update(updates)
      .eq("id", body.id);

    if (error) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Disciplina atualizada com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao atualizar disciplina.",
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
        { ok: false, message: "ID da disciplina não informado." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { count, error: countError } = await supabase
      .from("subjects")
      .select("id", { count: "exact", head: true })
      .eq("discipline_id", id);

    if (countError) {
      return NextResponse.json(
        { ok: false, message: countError.message },
        { status: 400 }
      );
    }

    if ((count || 0) > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "Não é possível excluir uma disciplina que possui assuntos vinculados. Inative a disciplina ou remova os assuntos antes.",
        },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("disciplines")
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
      message: "Disciplina excluída com sucesso.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao excluir disciplina.",
      },
      { status: 500 }
    );
  }
}
