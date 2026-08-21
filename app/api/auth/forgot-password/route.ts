import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { getApprovedStudentForPasswordRecovery } from "@/lib/server/passwordRecoveryEligibility";
import { logSystemError } from "@/app/lib/server/auditLogger";

const PUBLIC_MESSAGE = "Se este e-mail pertencer a uma conta ativa, você receberá um link para redefinir sua senha.";

export async function POST(request: Request) {
  try {
    const { email: rawEmail } = (await request.json()) as { email?: string };
    const email = rawEmail?.trim().toLowerCase() || "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ ok: false, code: "EMAIL_INVALID", message: "Informe um e-mail válido.", field: "email" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const student = await getApprovedStudentForPasswordRecovery(supabase, { email });
    const { data: professor } = student ? { data: null } : await supabase.from("professors").select("id,email,status").eq("email", email).eq("status", "active").maybeSingle();
    if (professor) {
      const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", professor.id).maybeSingle();
      if (profile?.role !== "professor" || !profile.is_active) return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
    }
    const account = student || professor;
    if (!account) return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });

    const redirectTo = `${getPublicAppUrl()}/redefinir-senha`;
    const { error } = await supabase.auth.resetPasswordForEmail(account.email, { redirectTo });
    if (error) {
      void logSystemError({ source: "api.auth.forgot_password", error, request, metadata: { account_id: account.id } });
    }

    return NextResponse.json({ ok: true, message: PUBLIC_MESSAGE });
  } catch (error) {
    void logSystemError({ source: "api.auth.forgot_password", error, request });
    return NextResponse.json({ ok: false, code: "PASSWORD_RESET_REQUEST_FAILED", message: "Não foi possível processar a solicitação agora. Tente novamente." }, { status: 500 });
  }
}
