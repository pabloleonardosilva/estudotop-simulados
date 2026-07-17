import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { emailActionTokenHashCandidates } from "@/lib/security/registrationTokens";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { passwordPolicyError } from "@/lib/auth/passwordPolicy";
import { getPasswordPolicyContext } from "@/lib/server/passwordPolicyContext";
import { logPasswordActivity } from "@/app/lib/server/studentActivityLog";

type FirstAccessPayload = {
  token: string;
  password?: string;
  confirmPassword?: string;
};

export async function POST(request: Request) {
  try {
    const { token, password, confirmPassword } = (await request.json()) as FirstAccessPayload;

    if (!token) {
      return NextResponse.json({ ok: false, code: "PASSWORD_TOKEN_INVALID", message: "O link de criação ou redefinição de senha é inválido ou expirou." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const tokenHashes = emailActionTokenHashCandidates(token);

    const { data: confirmation, error } = await supabase
      .from("student_registration_confirmations")
      .select("*")
      .eq("purpose", "first_access")
      .in("token_hash", tokenHashes)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !confirmation?.user_id) {
      return NextResponse.json(
        { ok: false, code: "PASSWORD_TOKEN_INVALID", message: "O link de criação ou redefinição de senha é inválido ou expirou." },
        { status: 400 }
      );
    }

    const context = await getPasswordPolicyContext(supabase, confirmation.user_id, confirmation.email);
    const policyError = passwordPolicyError(password || "", confirmPassword, context);
    if (policyError) {
      return NextResponse.json({ ok: false, ...policyError, field: "password" }, { status: 400 });
    }

    const { error: updateUserError } = await supabase.auth.admin.updateUserById(confirmation.user_id, {
      password,
      email_confirm: true,
    });

    if (updateUserError) {
      void logSystemError({ source: "api.auth.first_access", error: updateUserError, request });
      return NextResponse.json({ ok: false, code: "PASSWORD_UPDATE_FAILED", message: "Não foi possível atualizar sua senha. Tente novamente." }, { status: 400 });
    }

    const preserveAccountStatus = confirmation.metadata?.preserve_account_status === true;
    const profileUpdate = preserveAccountStatus
      ? { must_change_password: false }
      : { must_change_password: false, is_active: true };

    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", confirmation.user_id);

    if (profileError) {
      void logSystemError({ source: "api.auth.first_access", error: profileError, request });
      return NextResponse.json({ ok: false, code: "PASSWORD_UPDATE_PARTIAL", message: "A senha foi atualizada, mas não foi possível concluir a liberação do perfil. Entre em contato com o suporte." }, { status: 500 });
    }

    if (!preserveAccountStatus) {
      const { error: studentError } = await supabase
        .from("students")
        .update({ status: "active" })
        .eq("id", confirmation.user_id);

      if (studentError) {
        void logSystemError({ source: "api.auth.first_access", error: studentError, request });
        return NextResponse.json({ ok: false, code: "PASSWORD_UPDATE_PARTIAL", message: "A senha foi atualizada, mas não foi possível concluir a ativação da conta. Entre em contato com o suporte." }, { status: 500 });
      }
    }

    const { error: tokenUpdateError } = await supabase
      .from("student_registration_confirmations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", confirmation.id);
    if (tokenUpdateError) {
      void logSystemError({ source: "api.auth.first_access.token", error: tokenUpdateError, request });
      return NextResponse.json({ ok: false, code: "PASSWORD_UPDATE_PARTIAL", message: "A senha foi atualizada, mas o link não pôde ser finalizado. Entre em contato com o suporte." }, { status: 500 });
    }

    await logPasswordActivity({ supabase, studentId: confirmation.user_id, eventType: "password_changed", description: "Senha definitiva criada pelo aluno", performedByName: "Aluno", details: { source: "first_access_token", changed_by: "student" } });

    return NextResponse.json({
      ok: true,
      message: preserveAccountStatus
        ? "Senha definida com sucesso. O acesso continua sujeito ao status atual da sua conta."
        : "Senha definida com sucesso. Você já pode acessar a plataforma.",
    });
  } catch (error) {
    void logSystemError({ source: "api.auth.first_access", error, request });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao definir senha." }, { status: 500 });
  }
}
