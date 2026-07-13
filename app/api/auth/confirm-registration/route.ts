import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { addMinutes, generateNumericCode, hashRegistrationValue } from "@/lib/security/registrationTokens";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { authUserExists } from "@/lib/server/studentAccountRepair";
import { createStudentAccount, studentAccountErrorResponse } from "@/lib/server/studentAccountService";
import { publicRegistrationCodeTemplate } from "@/lib/email/studentRegistrationTemplates";

const FROM_EMAIL = "EstudoTOP <noreply@estudotop.com.br>";
const PUBLIC_CODE_EXPIRATION_MINUTES = 30;
const INVALID_CODE_RESEND_COOLDOWN_SECONDS = 60;

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
      const lastAutomaticResendAt = confirmation.metadata?.source === "invalid_code_resend"
        ? new Date(confirmation.created_at).getTime()
        : 0;
      const resendCooldownActive = Date.now() - lastAutomaticResendAt < INVALID_CODE_RESEND_COOLDOWN_SECONDS * 1000;

      if (resendCooldownActive) {
        return NextResponse.json(
          {
            ok: false,
            code: "INVALID_CODE_RESEND_COOLDOWN",
            message: "Código incorreto. Um novo código já foi enviado recentemente. Use o código mais recente recebido no e-mail.",
            clear_code: true,
          },
          { status: 429 }
        );
      }

      const resendApiKey = process.env.RESEND_API_KEY;
      if (!resendApiKey) {
        void logSystemError({
          source: "api.auth.confirm_registration.resend",
          error: new Error("RESEND_API_KEY não configurada."),
          request,
        });
        return NextResponse.json(
          { ok: false, code: "INVALID_CODE_RESEND_FAILED", message: "Código incorreto. Não foi possível enviar um novo código agora." },
          { status: 500 }
        );
      }

      const newCode = generateNumericCode(6);
      const { data: replacement, error: replacementError } = await supabase
        .from("student_registration_confirmations")
        .insert({
          purpose: "public_signup",
          full_name: confirmation.full_name,
          email,
          phone: confirmation.phone,
          cpf: confirmation.cpf,
          desired_contests: confirmation.desired_contests,
          code_hash: hashRegistrationValue(newCode),
          expires_at: addMinutes(PUBLIC_CODE_EXPIRATION_MINUTES),
          metadata: { source: "invalid_code_resend" },
        })
        .select("id")
        .single();

      if (replacementError || !replacement) {
        void logSystemError({ source: "api.auth.confirm_registration.resend", error: replacementError, request });
        return NextResponse.json(
          { ok: false, code: "INVALID_CODE_RESEND_FAILED", message: "Código incorreto. Não foi possível gerar um novo código agora." },
          { status: 500 }
        );
      }

      const resend = new Resend(resendApiKey);
      let emailError: unknown = null;
      try {
        const result = await resend.emails.send({
          from: FROM_EMAIL,
          to: email,
          subject: "Novo código de confirmação — EstudoTOP Simulados",
          html: publicRegistrationCodeTemplate({
            studentName: confirmation.full_name,
            code: newCode,
            expiresInMinutes: PUBLIC_CODE_EXPIRATION_MINUTES,
          }),
        });
        emailError = result.error;
      } catch (error) {
        emailError = error;
      }

      if (emailError) {
        await supabase.from("student_registration_confirmations").delete().eq("id", replacement.id);
        void logSystemError({ source: "api.auth.confirm_registration.resend_email", error: emailError, request });
        return NextResponse.json(
          { ok: false, code: "INVALID_CODE_RESEND_FAILED", message: "Código incorreto. Não foi possível enviar um novo código agora." },
          { status: 500 }
        );
      }

      await supabase
        .from("student_registration_confirmations")
        .update({ used_at: new Date().toISOString() })
        .eq("id", confirmation.id);

      return NextResponse.json(
        {
          ok: false,
          code: "INVALID_CODE_NEW_CODE_SENT",
          message: "O código informado está incorreto.",
          resend_message: "Enviamos automaticamente um novo código para o seu e-mail. Digite o código mais recente recebido.",
          clear_code: true,
        },
        { status: 400 }
      );
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
