import { NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { studentWelcomePlainText, studentWelcomeTemplate } from "@/app/lib/email/studentWelcomeTemplate";
import { isValidCpf, onlyDigits } from "@/lib/utils/cpf";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/lib/logging/error-log";

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

function getAppUrl(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

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

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (authError || !authData.user) {
      const message = authError?.message || "Falha ao criar usuário no Supabase Auth.";
      return NextResponse.json(
        {
          ok: false,
          message: message.includes("already been registered")
            ? "Este e-mail já está cadastrado no sistema."
            : message,
        },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      full_name: fullName,
      role: "student",
      is_active: false,
      must_change_password: true,
    });

    if (profileError) {
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json({ ok: false, message: profileError.message }, { status: 400 });
    }

    const { error: studentError } = await supabase.from("students").insert({
      id: userId,
      name: fullName,
      email,
      cpf: cpf || null,
      phone,
      status: "pending",
      desired_contests: desiredContests,
      origin,
      notes,
      welcome_email_status: "sending",
      welcome_email_error: null,
    });

    if (studentError) {
      await supabase.from("profiles").delete().eq("id", userId);
      await supabase.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { ok: false, message: studentError.message || "Falha ao criar registro do aluno." },
        { status: 400 }
      );
    }

    const loginUrl = `${getAppUrl(request)}/login`;

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
