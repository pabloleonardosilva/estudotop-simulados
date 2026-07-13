import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { hashRegistrationValue } from "@/lib/security/registrationTokens";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { authUserExists } from "@/lib/server/studentAccountRepair";
import { createStudentAccount, studentAccountErrorResponse } from "@/lib/server/studentAccountService";

type ConfirmPayload = {
  email: string;
  code: string;
};

export async function POST(request: Request) {
  try {
    const { email: rawEmail, code: rawCode } = (await request.json()) as ConfirmPayload;
    const email = rawEmail?.trim().toLowerCase();
    const code = rawCode?.trim();

    if (!email || !code) {
      return NextResponse.json(
        { ok: false, message: "E-mail e código são obrigatórios." },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: confirmation, error: confirmationError } = await supabase
      .from("student_registration_confirmations")
      .select("*")
      .eq("email", email)
      .eq("purpose", "public_signup")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (confirmationError || !confirmation) {
      return NextResponse.json(
        { ok: false, message: "Código expirado ou cadastro não encontrado. Solicite um novo código." },
        { status: 400 }
      );
    }

    if (confirmation.code_hash !== hashRegistrationValue(code)) {
      return NextResponse.json({ ok: false, message: "Código inválido." }, { status: 400 });
    }

    const { data: existingStudent } = await supabase
      .from("students")
      .select("id, email, cpf")
      .or(confirmation.cpf ? `email.eq.${email},cpf.eq.${confirmation.cpf}` : `email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existingStudent) {
      await supabase
        .from("student_registration_confirmations")
        .update({ used_at: new Date().toISOString() })
        .eq("id", confirmation.id);

      // Cenário E — students existe sem conta Auth correspondente: inconsistência
      // operacional; o Auth Admin API não permite recriar usuário com o mesmo UUID.
      if (!(await authUserExists(supabase, existingStudent.id))) {
        void logSystemError({
          source: "api.auth.confirm_registration.inconsistent_account",
          error: new Error(`students sem auth.users: ${existingStudent.id}`),
          request,
        });
        return NextResponse.json(
          { ok: false, code: "ACCOUNT_INCONSISTENT", message: "Este cadastro apresenta uma inconsistência e precisa de correção administrativa. Entre em contato com o suporte." },
          { status: 409 }
        );
      }

      const cpfDuplicado = confirmation.cpf && existingStudent.cpf === confirmation.cpf;
      return NextResponse.json({ ok: false, message: cpfDuplicado ? "Este CPF já está vinculado a outro cadastro." : "Este e-mail já foi confirmado anteriormente." }, { status: 409 });
    }

    const temporaryPassword = generateTemporaryPassword();
    let userId: string;
    try {
      const account = await createStudentAccount(supabase, {
        fullName: confirmation.full_name,
        email,
        cpf: confirmation.cpf || null,
        phone: confirmation.phone || null,
        desiredContests: confirmation.desired_contests || null,
        temporaryPassword,
        status: "pending",
        extraStudentFields: { email_confirmed_at: new Date().toISOString() },
      });
      userId = account.userId;
    } catch (error) {
      void logSystemError({ source: "api.auth.confirm_registration.account", error, request });
      return NextResponse.json(studentAccountErrorResponse(error, true), { status: 409 });
    }

    await supabase
      .from("student_registration_confirmations")
      .update({ used_at: new Date().toISOString(), user_id: userId })
      .eq("id", confirmation.id);

    return NextResponse.json({
      ok: true,
      message: "E-mail confirmado. Seu cadastro foi efetivado e ficará em análise para liberação.",
    });
  } catch (error) {
    void logSystemError({ source: "api.auth.confirm_registration", error, request });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao confirmar cadastro." }, { status: 500 });
  }
}
