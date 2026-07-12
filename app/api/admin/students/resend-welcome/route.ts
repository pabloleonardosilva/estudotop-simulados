import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { sendStudentWelcomeEmail } from "@/app/lib/server/sendStudentWelcomeEmail";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ResendPayload = {
  studentId: string;
};

// Reenvio manual do e-mail de boas-vindas. Ação administrativa consciente:
// pode ocorrer mesmo com welcome_email_sent_at preenchido. Não altera status
// nem aprovação — usa a mesma função central da aprovação inicial.
export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  let studentId: string | null = null;

  try {
    const payload = (await request.json()) as ResendPayload;
    studentId = payload.studentId;

    if (!studentId || !UUID_PATTERN.test(studentId)) {
      return NextResponse.json({ ok: false, message: "studentId inválido." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("id", studentId)
      .maybeSingle();

    if (!student) {
      return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
    }

    let loginUrl: string;
    try {
      loginUrl = `${getPublicAppUrl()}/login`;
    } catch (configError) {
      const message = configError instanceof Error ? configError.message : "URL pública não configurada.";
      return NextResponse.json({ ok: false, message }, { status: 500 });
    }

    const result = await sendStudentWelcomeEmail({
      studentId,
      source: "manual_resend",
      loginUrl,
      performedByName: admin.full_name || "Admin",
    });

    if (!result.sent) {
      void logSystemError({
        source: "api.admin.students.resend_welcome",
        error: new Error(result.error),
        request,
        metadata: { student_id: studentId },
      });
      return NextResponse.json(
        { ok: false, message: "Não foi possível reenviar o e-mail de boas-vindas. Tente novamente." },
        { status: 500 }
      );
    }

    void logAdminAction({ adminUserId: admin.id, action: "admin.student.welcome_resent", entityType: "student", entityId: studentId, request });

    return NextResponse.json({
      ok: true,
      message: "E-mail de boas-vindas reenviado com sucesso.",
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.students.resend_welcome", error, request, metadata: { student_id: studentId } });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao reenviar e-mail de boas-vindas." }, { status: 500 });
  }
}
