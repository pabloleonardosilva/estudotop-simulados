import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isValidCpf, onlyDigits } from "@/lib/utils/cpf";
import { publicRegistrationCodeTemplate } from "@/lib/email/studentRegistrationTemplates";
import { addMinutes, generateNumericCode, hashRegistrationValue } from "@/lib/security/registrationTokens";
import { logSystemError } from "@/app/lib/server/auditLogger";
import { authUserExists } from "@/lib/server/studentAccountRepair";

const FROM_EMAIL = "EstudoTOP <estudotop@estudotop.com.br>";
const REPLY_TO_EMAIL = "estudotop@estudotop.com.br";
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

    const missingFields = [
      !name ? "fullName" : null,
      !phone ? "whatsapp" : null,
      !email ? "email" : null,
      !cpf ? "cpf" : null,
      !desiredContests ? "desiredContests" : null,
    ].filter((field): field is "fullName" | "whatsapp" | "email" | "cpf" | "desiredContests" => field !== null);

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          code: missingFields.length === 1 && missingFields[0] === "fullName"
            ? "STUDENT_NAME_REQUIRED"
            : missingFields.length === 1 && missingFields[0] === "email"
              ? "STUDENT_EMAIL_REQUIRED"
              : "STUDENT_REGISTRATION_FAILED",
          message: "Preencha todos os campos obrigatórios destacados para concluir o cadastro.",
          field: missingFields.length === 1 ? missingFields[0] : undefined,
          fields: missingFields,
        },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { ok: false, code: "STUDENT_EMAIL_INVALID", message: "O e-mail informado não é válido.", field: "email", fields: ["email"] },
        { status: 400 },
      );
    }

    if (!cpf || !isValidCpf(cpf)) {
      return NextResponse.json(
        { ok: false, code: "STUDENT_CPF_INVALID", message: "O CPF informado não é válido.", field: "cpf" },
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

    const [{ data: emailMatches }, { data: cpfMatches }] = await Promise.all([
      supabase.from("students").select("id, email, cpf").eq("email", email),
      supabase.from("students").select("id, email, cpf").eq("cpf", cpf),
    ]);
    const existingStudents = Array.from(
      new Map([...(emailMatches || []), ...(cpfMatches || [])].map((student) => [student.id, student])).values(),
    );

    if (existingStudents && existingStudents.length > 0) {
      // Cenário E — students existe sem conta Auth correspondente: inconsistência
      // operacional registrada para correção administrativa.
      const inconsistentStudent = (await Promise.all(existingStudents.map(async (student) => ({
        id: student.id,
        hasAuthUser: await authUserExists(supabase, student.id),
      })))).find((student) => !student.hasAuthUser);

      if (inconsistentStudent) {
        void logSystemError({
          source: "api.auth.register.inconsistent_account",
          error: new Error(`students sem auth.users: ${inconsistentStudent.id}`),
          request,
        });
        return NextResponse.json(
          { ok: false, code: "ACCOUNT_INCONSISTENT", message: "Este cadastro apresenta uma inconsistência e precisa de correção administrativa. Entre em contato com o suporte." },
          { status: 409 }
        );
      }

      const emailDuplicado = existingStudents.some((student) => student.email?.trim().toLowerCase() === email);
      const cpfDuplicado = existingStudents.some((student) => student.cpf === cpf);
      const duplicateFields = [emailDuplicado ? "email" : null, cpfDuplicado ? "cpf" : null].filter((field): field is "email" | "cpf" => Boolean(field));
      const message = emailDuplicado && cpfDuplicado
        ? "O e-mail e o CPF informados já estão vinculados a uma conta. Tente entrar ou recuperar o acesso."
        : emailDuplicado
          ? "O e-mail informado já está vinculado a uma conta. Tente entrar ou recuperar o acesso."
          : "O CPF informado já está vinculado a uma conta. Tente entrar ou recuperar o acesso.";

      return NextResponse.json(
        {
          ok: false,
          code: emailDuplicado ? "STUDENT_EMAIL_ALREADY_EXISTS" : "STUDENT_CPF_ALREADY_EXISTS",
          message,
          field: duplicateFields.length === 1 ? duplicateFields[0] : undefined,
          duplicate_fields: duplicateFields,
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
      replyTo: REPLY_TO_EMAIL,
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
