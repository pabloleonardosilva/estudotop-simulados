import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { passwordPolicyError } from "@/lib/auth/passwordPolicy";
import { getPasswordPolicyContext } from "@/lib/server/passwordPolicyContext";
import { logPasswordActivity } from "@/app/lib/server/studentActivityLog";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { getApprovedStudentForPasswordRecovery } from "@/lib/server/passwordRecoveryEligibility";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return NextResponse.json({ ok: false, code: "PASSWORD_SESSION_INVALID", message: "Sua sessão de alteração de senha expirou. Solicite um novo acesso." }, { status: 401 });

    const { password, confirmPassword } = (await request.json()) as { password?: string; confirmPassword?: string };
    const supabase = createSupabaseAdminClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return NextResponse.json({ ok: false, code: "PASSWORD_SESSION_INVALID", message: "Sua sessão de alteração de senha expirou. Solicite um novo acesso." }, { status: 401 });

    const approvedStudent = await getApprovedStudentForPasswordRecovery(supabase, { userId: userData.user.id });
    if (!approvedStudent) return NextResponse.json({ ok: false, code: "PASSWORD_RECOVERY_NOT_ALLOWED", message: "A recuperação de senha está disponível somente para alunos aprovados." }, { status: 403 });

    const context = await getPasswordPolicyContext(supabase, userData.user.id, userData.user.email);
    const policyError = passwordPolicyError(password || "", confirmPassword, context);
    if (policyError) return NextResponse.json({ ok: false, ...policyError, field: "password" }, { status: 400 });

    const { error: updateError } = await supabase.auth.admin.updateUserById(userData.user.id, { password });
    if (updateError) {
      void logSystemError({ source: "api.auth.reset_password", error: updateError, request });
      return NextResponse.json({ ok: false, code: "PASSWORD_UPDATE_FAILED", message: "Não foi possível atualizar sua senha. Tente novamente." }, { status: 400 });
    }

    await logPasswordActivity({ supabase, studentId: approvedStudent.id, eventType: "password_reset", description: "Senha redefinida pelo aluno", performedByName: "Aluno", details: { source: "recovery_session", changed_by: "student" } });

    return NextResponse.json({ ok: true, message: "Senha alterada com sucesso." });
  } catch (error) {
    void logSystemError({ source: "api.auth.reset_password", error, request });
    return NextResponse.json({ ok: false, code: "INTERNAL_ERROR", message: "Ocorreu um erro interno ao atualizar a senha." }, { status: 500 });
  }
}
