import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logPasswordActivity } from "@/app/lib/server/studentActivityLog";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ ok: false, message: "Sessão não localizada." }, { status: 401 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user?.id) {
      return NextResponse.json({ ok: false, message: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, must_change_password")
      .eq("id", userId)
      .maybeSingle();

    const { data: student } = await supabase
      .from("students")
      .select("id, status")
      .eq("id", userId)
      .maybeSingle();

    if (!profile || profile.role !== "student" || !profile.must_change_password || !student || student.status === "blocked") {
      return NextResponse.json({ ok: false, message: "Troca de senha nÃ£o autorizada para esta conta." }, { status: 403 });
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: false, is_active: true })
      .eq("id", userId);

    if (profileError) {
      void logSystemError({ source: "api.auth.complete_password_change", error: profileError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível concluir a troca de senha." }, { status: 400 });
    }

    await supabase
      .from("students")
      .update({ status: "active" })
      .eq("id", userId);

    // Registra no histórico do aluno que a senha provisória foi substituída
    // pela senha definitiva. Não registramos a senha em si por segurança.
    await logPasswordActivity({
      supabase,
      studentId: userId,
      eventType: "password_changed",
      description: "Senha definitiva criada pelo aluno",
      performedByName: "Aluno",
      details: { source: "student_first_access", changed_by: "student" },
    });

    return NextResponse.json({ ok: true, message: "Senha definitiva ativada com sucesso." });
  } catch (error) {
    void logSystemError({ source: "api.auth.complete_password_change", error, request });
    return NextResponse.json(
      { ok: false, message: "Erro inesperado ao finalizar troca de senha." },
      { status: 500 }
    );
  }
}
