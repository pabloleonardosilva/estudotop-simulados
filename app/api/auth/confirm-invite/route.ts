import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { hashRegistrationValue } from "@/lib/security/registrationTokens";
import { sendFirstAccessEmail } from "@/lib/server/sendFirstAccessEmail";
import { logSystemError } from "@/app/lib/server/auditLogger";

type ConfirmInvitePayload = {
  token: string;
};

function profileActiveForStatus(status: string) {
  return status === "active";
}

export async function POST(request: Request) {
  try {
    const { token } = (await request.json()) as ConfirmInvitePayload;

    if (!token) {
      return NextResponse.json({ ok: false, message: "Token de confirmação ausente." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const tokenHash = hashRegistrationValue(token);

    const { data: confirmation, error } = await supabase
      .from("student_registration_confirmations")
      .select("*")
      .eq("purpose", "admin_invite")
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !confirmation) {
      return NextResponse.json(
        { ok: false, message: "Link inválido ou expirado. Solicite um novo envio à equipe EstudoTOP." },
        { status: 400 }
      );
    }

    const desiredStatus = confirmation.desired_status || "active";
    const now = new Date().toISOString();

    const { error: studentError } = await supabase
      .from("students")
      .update({
        status: desiredStatus,
        email_confirmed_at: now,
        welcome_email_status: "sent",
        welcome_email_sent_at: now,
        welcome_email_error: null,
      })
      .eq("id", confirmation.user_id);

    if (studentError) {
      void logSystemError({ source: "api.auth.confirm_invite", error: studentError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível confirmar o convite." }, { status: 400 });
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ is_active: profileActiveForStatus(desiredStatus) })
      .eq("id", confirmation.user_id);

    if (profileError) {
      void logSystemError({ source: "api.auth.confirm_invite", error: profileError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível confirmar o convite." }, { status: 400 });
    }

    await supabase
      .from("student_registration_confirmations")
      .update({ used_at: now })
      .eq("id", confirmation.id);

    let firstAccessUrl: string | null = null;
    if (desiredStatus === "active") {
      try {
        const sent = await sendFirstAccessEmail(confirmation.user_id);
        firstAccessUrl = sent.firstAccessUrl;
      } catch {
        firstAccessUrl = null;
      }
    }

    return NextResponse.json({
      ok: true,
      firstAccessUrl,
      message: desiredStatus === "active"
        ? "Cadastro confirmado. Agora defina sua senha para acessar a plataforma."
        : "Cadastro confirmado. Seu acesso foi registrado, mas ainda não está ativo.",
    });
  } catch (error) {
    void logSystemError({ source: "api.auth.confirm_invite", error, request });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao confirmar convite." }, { status: 500 });
  }
}
