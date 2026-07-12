import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isValidCpf, onlyDigits } from "@/lib/utils/cpf";
import { publicRegistrationCodeTemplate } from "@/lib/email/studentRegistrationTemplates";
import { addMinutes, generateNumericCode, hashRegistrationValue } from "@/lib/security/registrationTokens";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { authUserExists } from "@/lib/server/studentAccountRepair";

const FROM_EMAIL = "EstudoTOP <noreply@estudotop.com.br>";
const PUBLIC_CODE_EXPIRATION_MINUTES = 30;

type RegisterPayload = {
  name?: string;
  fullName?: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  cpf?: string;
  desiredContests?: string;
  concursosDesejados?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterPayload;

    const name = (body.fullName || body.name || "").trim();
    const email = body.email?.trim().toLowerCase();
    const phone = (body.whatsapp || body.phone || "").trim();
    const cpf = body.cpf ? onlyDigits(body.cpf) : null;
    const desiredContests = (body.desiredContests || body.concursosDesejados || "").trim();

    if (!name || !email || !phone || !cpf || !desiredContests) {
      return NextResponse.json(
        { ok: false, message: "Nome completo, WhatsApp, melhor e-mail, CPF e concursos desejados são obrigatórios." },
        { status: 400 }
      );
    }

    if (!isValidCpf(cpf)) {
      return NextResponse.json(
        { ok: false, message: "CPF inválido. Verifique os dígitos informados." },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json(
        { ok: false, message: "RESEND_API_KEY não foi configurada no .env.local." },
        { status: 500 }
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: existingStudent } = await supabase
      .from("students")
      .select("id, email, cpf")
      .or(cpf ? `email.eq.${email},cpf.eq.${cpf}` : `email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existingStudent) {
      // Cenário E — students existe sem conta Auth correspondente: inconsistência
      // operacional registrada para correção administrativa.
      if (!(await authUserExists(supabase, existingStudent.id))) {
        void logSystemError({
          source: "api.auth.register.inconsistent_account",
          error: new Error(`students sem auth.users: ${existingStudent.id}`),
          request,
        });
        return NextResponse.json(
          { ok: false, code: "ACCOUNT_INCONSISTENT", message: "Este cadastro apresenta uma inconsistência e precisa de correção administrativa. Entre em contato com o suporte." },
          { status: 409 }
        );
      }

      const cpfDuplicado = cpf && existingStudent.cpf === cpf;
      return NextResponse.json(
        {
          ok: false,
          code: cpfDuplicado ? "CPF_ALREADY_EXISTS" : "EMAIL_ALREADY_EXISTS",
          message: cpfDuplicado ? "Este CPF já está cadastrado." : "Este e-mail já está cadastrado.",
        },
        { status: 409 }
      );
    }

    const code = generateNumericCode(6);
    const codeHash = hashRegistrationValue(code);

    await supabase
      .from("student_registration_confirmations")
      .update({ used_at: new Date().toISOString() })
      .eq("email", email)
      .eq("purpose", "public_signup")
      .is("used_at", null);

    const { error: insertError } = await supabase.from("student_registration_confirmations").insert({
      purpose: "public_signup",
      full_name: name,
      email,
      phone,
      cpf,
      desired_contests: desiredContests,
      code_hash: codeHash,
      expires_at: addMinutes(PUBLIC_CODE_EXPIRATION_MINUTES),
      metadata: { source: "public_signup" },
    });

    if (insertError) {
      void logSystemError({ source: "api.auth.register", error: insertError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível iniciar o cadastro." }, { status: 400 });
    }

    const resend = new Resend(resendApiKey);
    const { error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Código de confirmação — EstudoTOP Simulados",
      html: publicRegistrationCodeTemplate({
        studentName: name,
        code,
        expiresInMinutes: PUBLIC_CODE_EXPIRATION_MINUTES,
      }),
    });

    if (emailError) {
      void logSystemError({ source: "api.auth.register.email", error: emailError, request });
      return NextResponse.json({ ok: false, message: "Não foi possível enviar o código de confirmação." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Enviamos um código de confirmação para o seu e-mail. Informe o código para concluir o cadastro.",
      email,
    });
  } catch (error) {
    void logSystemError({ source: "api.auth.register", error, request });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao iniciar cadastro." }, { status: 500 });
  }
}
