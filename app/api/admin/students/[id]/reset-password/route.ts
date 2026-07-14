import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { sendFirstAccessEmail } from "@/app/lib/server/sendFirstAccessEmail";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;

  if (!id) {
    return NextResponse.json({ ok: false, message: "ID do aluno é obrigatório." }, { status: 400 });
  }

  try {
    const supabase = createSupabaseAdminClient();

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name, email")
      .eq("id", id)
      .single();

    if (studentError || !student) {
      return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
    }

    const newPassword = generateTemporaryPassword();

    const { error: authError } = await supabase.auth.admin.updateUserById(id, {
      password: newPassword,
      email_confirm: true,
    });

    if (authError) {
      void logSystemError({ source: "api.admin.students.reset_password.auth", error: authError, request, metadata: { student_id: id } });
      return NextResponse.json({ ok: false, message: "Não foi possível redefinir a senha do aluno." }, { status: 500 });
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", id);

    if (profileError) {
      return NextResponse.json(
        { ok: false, message: "A senha foi redefinida, mas não foi possível exigir a criação de uma nova senha." },
        { status: 500 },
      );
    }

    await supabase.from("students").update({ welcome_email_status: "sending", welcome_email_error: null }).eq("id", id);

    let emailSent = true;
    let emailMessage = "E-mail enviado ao aluno.";
    try {
      await sendFirstAccessEmail(id, undefined, { preserveAccountStatus: true });
    } catch (emailError) {
      emailSent = false;
      emailMessage = emailError instanceof Error ? emailError.message : "Falha ao enviar e-mail.";
      await supabase.from("students").update({ welcome_email_status: "failed", welcome_email_error: emailMessage }).eq("id", id);
    }

    await supabase.from("student_activity_log").insert({
      student_id: id,
      event_type: "password_reset",
      description: emailSent ? "Senha redefinida e link para criação de nova senha enviado por e-mail" : "Senha redefinida, mas o e-mail falhou",
      details: { email_sent: emailSent },
      performed_by_name: "Admin",
    });

    void logAdminAction({ adminUserId: admin.id, action: "admin.student.password_reset", entityType: "student", entityId: id, severity: "warning", request, metadata: { email_sent: emailSent } });

    return NextResponse.json({
      ok: true,
      emailSent,
      message: emailSent ? "Senha redefinida. O aluno recebeu por e-mail o link para criar uma nova senha." : "Senha redefinida, mas o e-mail não pôde ser enviado. Tente novamente.",
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.students.reset_password", error, request, metadata: { student_id: id } });
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro inesperado." }, { status: 500 });
  }
}
