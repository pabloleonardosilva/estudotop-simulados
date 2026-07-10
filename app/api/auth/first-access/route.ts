import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { hashRegistrationValue } from "@/lib/security/registrationTokens";
import { logSystemError } from "@/app/lib/server/auditLogger";

type FirstAccessPayload = {
  token: string;
  password: string;
};

export async function POST(request: Request) {
  try {
    const { token, password } = (await request.json()) as FirstAccessPayload;

    if (!token || !password) {
      return NextResponse.json({ ok: false, message: "Token e senha são obrigatórios." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ ok: false, message: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const tokenHash = hashRegistrationValue(token);

    const { data: confirmation, error } = await supabase
      .from("student_registration_confirmations")
      .select("*")
      .eq("purpose", "first_access")
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !confirmation?.user_id) {
      return NextResponse.json(
        { ok: false, message: "Link inválido ou expirado. Solicite um novo link à equipe EstudoTOP." },
        { status: 400 }
      );
    }

    const { error: updateUserError } = await supabase.auth.admin.updateUserById(confirmation.user_id, {
      password,
      email_confirm: true,
    });

    if (updateUserError) {
      void logSystemError({ source: "api.auth.first_access", error: updateUserError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível definir a senha. Tente novamente ou solicite um novo link." }, { status: 400 });
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ must_change_password: false, is_active: true })
      .eq("id", confirmation.user_id);

    if (profileError) {
      void logSystemError({ source: "api.auth.first_access", error: profileError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível concluir o primeiro acesso." }, { status: 400 });
    }

    const { error: studentError } = await supabase
      .from("students")
      .update({ status: "active" })
      .eq("id", confirmation.user_id);

    if (studentError) {
      void logSystemError({ source: "api.auth.first_access", error: studentError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível concluir o primeiro acesso." }, { status: 400 });
    }

    await supabase
      .from("student_registration_confirmations")
      .update({ used_at: new Date().toISOString() })
      .eq("id", confirmation.id);

    return NextResponse.json({ ok: true, message: "Senha definida com sucesso. Você já pode acessar a plataforma." });
  } catch (error) {
    void logSystemError({ source: "api.auth.first_access", error, request });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao definir senha." }, { status: 500 });
  }
}
