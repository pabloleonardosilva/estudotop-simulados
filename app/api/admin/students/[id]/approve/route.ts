import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sendStudentWelcomeEmail } from "@/app/lib/server/sendStudentWelcomeEmail";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/lib/logging/error-log";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Aprovação inicial do cadastro (pending → active). Evento explícito e
// idempotente: é ele — e não a mudança genérica de status — que dispara o
// e-mail de boas-vindas. A falha do e-mail NÃO desfaz a aprovação.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;

  try {
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ ok: false, message: "Identificador de aluno inválido." }, { status: 400 });
    }

    // URL pública canônica: resolvida ANTES da aprovação — se não estiver
    // configurada, nada é alterado e nenhum link localhost chega ao aluno.
    let loginUrl: string;
    try {
      loginUrl = `${getPublicAppUrl()}/login`;
    } catch (configError) {
      const message = configError instanceof Error ? configError.message : "URL pública não configurada.";
      return NextResponse.json({ ok: false, message }, { status: 500 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", id)
      .maybeSingle();

    if (profile && profile.role !== "student") {
      return NextResponse.json(
        { ok: false, message: "Somente cadastros de aluno podem ser aprovados." },
        { status: 403 }
      );
    }

    // Idempotência/concorrência: o update só afeta a linha se ela ainda estiver
    // pendente e sem aprovação. Duas requisições simultâneas: apenas uma
    // encontra a linha; a outra recebe STUDENT_ALREADY_APPROVED.
    const { data: approvedRows, error: approveError } = await supabase
      .from("students")
      .update({ status: "active", approved_at: new Date().toISOString(), approved_by: admin.id })
      .eq("id", id)
      .eq("status", "pending")
      .is("approved_at", null)
      .select("id, name, email");

    if (approveError) {
      await logSystemError({
        request,
        source: "student_approve_api",
        actorType: "admin",
        errorMessage: approveError.message,
        safeDetails: { studentId: id },
        severity: "error",
      });
      return NextResponse.json({ ok: false, message: "Não foi possível aprovar o cadastro." }, { status: 500 });
    }

    if (!approvedRows || approvedRows.length === 0) {
      const { data: current } = await supabase
        .from("students")
        .select("id, status, approved_at")
        .eq("id", id)
        .maybeSingle();

      if (!current) {
        return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
      }

      return NextResponse.json(
        {
          ok: false,
          code: "STUDENT_ALREADY_APPROVED",
          message: "Este cadastro já foi aprovado anteriormente.",
        },
        { status: 409 }
      );
    }

    const student = approvedRows[0];

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ is_active: true })
      .eq("id", id);

    if (profileUpdateError) {
      await logSystemError({
        request,
        source: "student_approve_api",
        actorType: "admin",
        errorMessage: `Aprovado, mas falha ao ativar profile: ${profileUpdateError.message}`,
        safeDetails: { studentId: id },
        severity: "error",
      });
    }

    await supabase.from("student_activity_log").insert({
      student_id: id,
      event_type: "registration_approved",
      description: "Cadastro aprovado pelo administrador. Acesso ativado.",
      details: { approved_by: admin.id, approved_by_name: admin.full_name || "Admin" },
      performed_by_name: admin.full_name || "Admin",
    });

    await logActivity({
      request,
      actorType: "admin",
      actorName: admin.full_name || "Admin",
      action: "student_registration_approved",
      entityType: "student",
      entityId: id,
      metadata: { email: student.email },
    });

    const emailResult = await sendStudentWelcomeEmail({
      studentId: id,
      source: "approval",
      loginUrl,
      performedByName: admin.full_name || "Admin",
    });

    if (!emailResult.sent) {
      await logSystemError({
        request,
        source: "student_approve_api",
        actorType: "admin",
        errorMessage: `Aprovado, mas e-mail de boas-vindas falhou: ${emailResult.error}`,
        safeDetails: { studentId: id },
        severity: "warning",
      });
      return NextResponse.json({
        ok: true,
        approved: true,
        email_sent: false,
        code: "STUDENT_APPROVED_EMAIL_FAILED",
        message: "Cadastro aprovado, mas o e-mail de boas-vindas não pôde ser enviado. Use o reenvio manual.",
      });
    }

    return NextResponse.json({
      ok: true,
      approved: true,
      email_sent: true,
      message: "Cadastro aprovado e e-mail de boas-vindas enviado.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    await logSystemError({
      request,
      source: "student_approve_api",
      actorType: "admin",
      errorMessage: message,
      safeDetails: { studentId: id },
      severity: "error",
    });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao aprovar cadastro." }, { status: 500 });
  }
}
