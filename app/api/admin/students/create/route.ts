import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { studentWelcomePlainText, studentWelcomeTemplate } from "@/app/lib/email/studentWelcomeTemplate";
import { isValidCpf, onlyDigits } from "@/lib/utils/cpf";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/lib/logging/error-log";
import { authUserExists } from "@/lib/server/studentAccountRepair";
import { createStudentAccount, studentAccountErrorResponse } from "@/lib/server/studentAccountService";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

const FROM_EMAIL = "EstudoTOP <noreply@estudotop.com.br>";

type CreateStudentPayload = {
  fullName: string;
  email: string;
  cpf?: string;
  phone?: string;
  origin?: string;
  notes?: string;
  desiredContests?: string;
  isActive?: boolean;
};

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = (await request.json()) as CreateStudentPayload;

    const fullName = body.fullName?.trim();
    const email = body.email?.trim().toLowerCase();
    const cpf = body.cpf ? onlyDigits(body.cpf) : null;
    const phone = body.phone?.trim() || null;
    const origin = body.origin?.trim() || "Manual";
    const notes = body.notes?.trim() || null;
    const desiredContests = body.desiredContests?.trim() || null;
    if (!fullName || !email || !cpf) {
      return NextResponse.json(
        { ok: false, message: "Nome completo, e-mail e CPF são obrigatórios." },
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

    const { data: existing } = await supabase
      .from("students")
      .select("id, email, cpf, name")
      .or(cpf ? `email.eq.${email},cpf.eq.${cpf}` : `email.eq.${email}`)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Cenário E — students existe sem conta Auth: inconsistência operacional
      // que exige correção administrativa (o Auth não recria o mesmo UUID).
      if (!(await authUserExists(supabase, existing.id))) {
        await logSystemError({
          request,
          source: "student_create_api",
          actorType: "admin",
          errorMessage: `Cadastro inconsistente: students sem auth.users (${existing.id}).`,
          safeDetails: { studentId: existing.id },
          severity: "error",
        });
        return NextResponse.json(
          {
            ok: false,
            code: "ACCOUNT_INCONSISTENT",
            message: "Este cadastro existe sem conta de autenticação vinculada. Exclua definitivamente o registro do aluno e cadastre novamente.",
            existingStudent: { id: existing.id, fullName: existing.name || existing.email },
          },
          { status: 409 }
        );
      }

      const isCpfDuplicate = cpf && existing.cpf === cpf;
      return NextResponse.json(
        {
          ok: false,
          code: isCpfDuplicate ? "CPF_ALREADY_EXISTS" : "EMAIL_ALREADY_EXISTS",
          message: isCpfDuplicate
            ? "Este CPF já está cadastrado no sistema."
            : "Este e-mail já está cadastrado no sistema.",
          existingStudent: { id: existing.id, fullName: existing.name || existing.email },
        },
        { status: 409 }
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    let userId: string;
    try {
      const account = await createStudentAccount(supabase, {
        fullName,
        email,
        cpf: cpf || null,
        phone,
        desiredContests,
        temporaryPassword,
        status: "pending",
        extraStudentFields: { origin, notes, welcome_email_status: "sending", welcome_email_error: null },
      });
      userId = account.userId;
    } catch (error) {
      return NextResponse.json(studentAccountErrorResponse(error), { status: 409 });
    }

    const loginUrl = `${getPublicAppUrl()}/login`;

    try {
      const resend = new Resend(resendApiKey);
      await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject: "🦉 Você chegou ao EstudoTOP Simulados",
        html: studentWelcomeTemplate({
          studentName: fullName,
          studentEmail: email,
          temporaryPassword,
          loginUrl,
        }),
        text: studentWelcomePlainText(fullName, email, temporaryPassword, loginUrl),
      });

      await supabase
        .from("students")
        .update({
          welcome_email_status: "sent",
          welcome_email_sent_at: new Date().toISOString(),
          welcome_email_error: null,
        })
        .eq("id", userId);

      await logActivity({
        request,
        actorType: "admin",
        actorName: "Admin",
        action: "student_created",
        entityType: "student",
        entityId: userId,
        metadata: { email, origin, emailSent: true },
      });

      return NextResponse.json({
        ok: true,
        emailSent: true,
        message: "Aluno cadastrado. E-mail de boas-vindas com senha temporária enviado.",
        studentId: userId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha no envio do e-mail.";
      await supabase
        .from("students")
        .update({ welcome_email_status: "failed", welcome_email_error: message })
        .eq("id", userId);

      await logSystemError({
        request,
        source: "student_create_email",
        actorType: "admin",
        errorMessage: message,
        safeDetails: { studentId: userId, email },
        severity: "warning",
      });

      await logActivity({
        request,
        actorType: "admin",
        actorName: "Admin",
        action: "student_created",
        entityType: "student",
        entityId: userId,
        severity: "warning",
        metadata: { email, origin, emailSent: false },
      });

      return NextResponse.json({
        ok: true,
        emailSent: false,
        message: "Aluno cadastrado, mas houve falha no envio do e-mail de boas-vindas com senha temporária.",
        studentId: userId,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao cadastrar aluno.";
    await logSystemError({
      request,
      source: "student_create_api",
      actorType: "admin",
      errorMessage: message,
      severity: "error",
    });
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
