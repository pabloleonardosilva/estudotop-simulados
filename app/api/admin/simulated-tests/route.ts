import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

function clean(value?: string | null) {
  return (value || "").trim();
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();

    const title = clean(body.title);
    const description = clean(body.description);
    const durationMinutes = body.duration_minutes ? Number(body.duration_minutes) : null;
    const status = clean(body.status) || "draft";
    const correctionVideoUrl = clean(body.correction_video_url);

    if (!title) {
      return NextResponse.json(
        { ok: false, message: "Informe o título do simulado." },
        { status: 400 }
      );
    }

    if (!["draft", "pending_review", "published", "archived"].includes(status)) {
      return NextResponse.json(
        { ok: false, message: "Status inválido." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("simulated_tests")
      .insert({
        title,
        description: description || null,
        duration_minutes: durationMinutes,
        status,
        correction_video_url: correctionVideoUrl || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: error?.message || "Erro ao criar simulado." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Simulado criado com sucesso.",
      id: data.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Erro inesperado ao criar simulado.",
      },
      { status: 500 }
    );
  }
}
