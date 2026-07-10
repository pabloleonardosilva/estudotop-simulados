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

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();

    const disciplineId = String(body.discipline_id || "").trim();
    const rawText = String(body.text || "").trim();

    if (!disciplineId) return NextResponse.json({ ok: false, message: "Selecione a disciplina." }, { status: 400 });
    if (!rawText) return NextResponse.json({ ok: false, message: "Informe pelo menos um assunto." }, { status: 400 });

    const names = Array.from(new Set(rawText.split(/\r?\n/).map(canonicalizeSubjectName).filter(Boolean)));
    const supabase = createSupabaseAdminClient();

    const { data: existingSubjects, error: listError } = await supabase
      .from("subjects")
      .select("id, name")
      .eq("discipline_id", disciplineId);

    if (listError) throw new Error(listError.message);

    const existingKeys = new Set((existingSubjects || []).map((item) => normalizeComparableName(item.name)));

    let createdCount = 0;
    let ignoredCount = 0;

    for (const name of names) {
      const comparable = normalizeComparableName(name);

      if (existingKeys.has(comparable)) {
        ignoredCount += 1;
        continue;
      }

      const { error } = await supabase
        .from("subjects")
        .insert({ name, discipline_id: disciplineId, is_active: true });

      if (error) throw new Error(error.message);
      createdCount += 1;
      existingKeys.add(comparable);
    }

    return NextResponse.json({
      ok: true,
      message: `${createdCount} assunto(s) cadastrado(s). ${ignoredCount} ignorado(s) por ja existir(em).`,
      createdCount,
      ignoredCount,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro ao cadastrar assuntos em massa." },
      { status: 500 }
    );
  }
}
