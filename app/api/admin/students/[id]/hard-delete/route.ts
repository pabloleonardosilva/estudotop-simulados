import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { verifyAdminPassword } from "@/lib/server/verifyAdminPassword";
import { logActivity } from "@/lib/logging/activity-log";
import { logSecurityEvent } from "@/app/lib/server/auditLogger";
import { logSystemError } from "@/lib/logging/error-log";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mesmo inventário usado pela exclusão normal (app/api/admin/students/[id]/route.ts),
// aqui apenas para compor o resumo de auditoria — não bloqueia a operação.
const HISTORY_CHECKS: Array<{ type: string; table: string }> = [
  { type: "jornadas", table: "student_jornadas" },
  { type: "tentativas", table: "simulado_attempts" },
  { type: "resultados", table: "simulado_results" },
  { type: "avaliacoes", table: "simulado_feedbacks" },
  { type: "anotacoes", table: "student_simulado_notes" },
  { type: "topcoins", table: "topcoin_earnings" },
  { type: "eventos", table: "simulado_event_participants" },
  { type: "tentativas_legado", table: "attempts" },
  { type: "simulados_legado", table: "student_simulados" },
];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;

  try {
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json({ ok: false, message: "Identificador de aluno inválido." }, { status: 400 });
    }

    const body = await request.json().catch(() => null) as { password?: unknown; confirmation?: unknown } | null;
    const password = typeof body?.password === "string" ? body.password : "";
    const confirmation = typeof body?.confirmation === "string" ? body.confirmation.trim() : "";

    if (confirmation !== "EXCLUIR") {
      return NextResponse.json({ ok: false, message: "Digite EXCLUIR para confirmar a exclusão definitiva." }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ ok: false, message: "Informe sua senha de administrador." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: student } = await supabase.from("students").select("id, name, email").eq("id", id).maybeSingle();
    const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", id).maybeSingle();
    const { data: authLookup } = await supabase.auth.admin.getUserById(id);
    const authUser = authLookup?.user ?? null;

    if (!student && !profile && !authUser) {
      return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
    }
    if (profile && profile.role !== "student") {
      return NextResponse.json({ ok: false, message: "Somente contas de aluno podem ser excluídas definitivamente." }, { status: 403 });
    }

    if (!admin.email) {
      return NextResponse.json({ ok: false, message: "Não foi possível validar sua identidade de administrador." }, { status: 500 });
    }

    const passwordValid = await verifyAdminPassword(admin.email, password);
    if (!passwordValid) {
      void logSecurityEvent({
        event: "admin.hard_delete_wrong_password",
        actorType: "admin",
        actorId: admin.id,
        actorEmail: admin.email,
        request,
        metadata: { target_student_id: id },
      });
      return NextResponse.json({ ok: false, message: "Senha de administrador incorreta. Nenhum dado foi excluído." }, { status: 401 });
    }

    // Resumo de auditoria (não bloqueia — esta rota existe justamente para o caso com histórico).
    const dependencies: Array<{ type: string; count: number }> = [];
    for (const check of HISTORY_CHECKS) {
      const { count, error } = await supabase.from(check.table).select("id", { count: "exact", head: true }).eq("student_id", id);
      if (!error && (count ?? 0) > 0) dependencies.push({ type: check.type, count: count ?? 0 });
    }

    const studentEmail = (student?.email || authUser?.email || "").trim().toLowerCase() || null;

    // Ordem determinada pelas FKs reais do banco (mapeadas via pg_constraint,
    // não por suposição). Dois grupos distintos de tabelas:
    //
    // 1) simulado_attempts, simulado_results, simulado_feedbacks,
    //    topcoin_earnings e student_registration_confirmations têm FK direta
    //    para auth.users(id) ON DELETE CASCADE — cairiam sozinhas quando o
    //    usuário do Auth for removido mais abaixo. Ainda assim são apagadas
    //    aqui explicitamente (idempotente, sem erro se já vazias) para que a
    //    exclusão seja determinística e auditável, em vez de depender
    //    silenciosamente de cascade (simulado_answers cai junto via
    //    attempt_id CASCADE ao apagar simulado_attempts).
    // 2) simulado_event_participants.student_id e student_jornadas.student_id
    //    referenciam public.students(id) com RESTRICT/NO ACTION — essas NÃO
    //    cascateiam do Auth e PRECISAM ser removidas manualmente antes de
    //    excluir o usuário, senão a exclusão do Auth (que cascateia para
    //    students) falha por violação de FK. simulado_attempts precisa ser
    //    limpo antes de simulado_event_participants porque
    //    simulado_attempts.event_participant_id também é RESTRICT.
    // attempts e student_simulados (tabelas legadas) não têm nenhuma FK
    // declarada — nunca cascateiam e ficariam órfãs se não fossem limpas aqui.
    const cleanupSteps: Array<{ table: string; column: string }> = [
      { table: "simulado_feedbacks", column: "student_id" },
      { table: "simulado_attempts", column: "student_id" },
      { table: "attempts", column: "student_id" },
      { table: "topcoin_earnings", column: "student_id" },
      { table: "simulado_event_participants", column: "student_id" },
      { table: "student_jornadas", column: "student_id" },
      { table: "student_simulados", column: "student_id" },
      { table: "student_correction_video_progress", column: "student_id" },
      { table: "student_simulado_notes", column: "student_id" },
    ];

    for (const step of cleanupSteps) {
      const { error } = await supabase.from(step.table).delete().eq(step.column, id);
      if (error) {
        await logSystemError({
          request,
          source: "student_hard_delete_api",
          actorType: "admin",
          errorMessage: `Falha ao limpar ${step.table}: ${error.message}`,
          safeDetails: { studentId: id, step: step.table },
          severity: "error",
        });
        return NextResponse.json({
          ok: false,
          message: `Exclusão interrompida ao limpar dados de "${step.table}". Nenhuma camada de identidade (Auth/aluno/perfil) foi removida ainda — repita a operação após verificar o problema.`,
        }, { status: 500 });
      }
    }

    // Confirmações de cadastro pendentes (mesma limpeza da exclusão normal).
    await supabase.from("student_registration_confirmations").delete().eq("user_id", id);
    if (studentEmail) {
      await supabase.from("student_registration_confirmations").delete().eq("email", studentEmail);
    }

    // Auth primeiro: se falhar aqui, students/profiles permanecem intactos e
    // visíveis no Admin — nunca produz conta invisível.
    if (authUser) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
      if (authDeleteError && !/not[\s_-]*found/i.test(authDeleteError.message || "")) {
        await logSystemError({
          request,
          source: "student_hard_delete_api",
          actorType: "admin",
          errorMessage: `Falha ao excluir usuário no Supabase Auth: ${authDeleteError.message}`,
          safeDetails: { studentId: id },
          severity: "error",
        });
        return NextResponse.json({ ok: false, message: "Falha ao remover a conta de autenticação. O histórico já foi limpo; repita a operação para concluir." }, { status: 500 });
      }
    }

    if (student) {
      const { error: studentDeleteError } = await supabase.from("students").delete().eq("id", id);
      if (studentDeleteError) {
        await logSystemError({
          request,
          source: "student_hard_delete_api",
          actorType: "admin",
          errorMessage: `Auth removido, mas falha ao excluir students: ${studentDeleteError.message}`,
          safeDetails: { studentId: id },
          severity: "error",
        });
        return NextResponse.json({ ok: false, message: "Exclusão incompleta: o registro do aluno permanece. Repita a exclusão para concluir a limpeza." }, { status: 500 });
      }
    }

    if (profile) {
      const { error: profileDeleteError } = await supabase.from("profiles").delete().eq("id", id);
      if (profileDeleteError) {
        await logSystemError({
          request,
          source: "student_hard_delete_api",
          actorType: "admin",
          errorMessage: `Auth e students removidos, mas falha ao excluir profiles: ${profileDeleteError.message}`,
          safeDetails: { studentId: id },
          severity: "error",
        });
        return NextResponse.json({ ok: false, message: "Exclusão incompleta: o perfil do aluno permanece. Repita a exclusão para concluir a limpeza." }, { status: 500 });
      }
    }

    const { data: studentCheck } = await supabase.from("students").select("id").eq("id", id).maybeSingle();
    const { data: profileCheck } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
    const { data: authCheck } = await supabase.auth.admin.getUserById(id);

    if (studentCheck || profileCheck || authCheck?.user) {
      await logSystemError({
        request,
        source: "student_hard_delete_api",
        actorType: "admin",
        errorMessage: "Reverificação pós-exclusão definitiva encontrou camadas remanescentes.",
        safeDetails: {
          studentId: id,
          remaining: { students: Boolean(studentCheck), profiles: Boolean(profileCheck), auth: Boolean(authCheck?.user) },
        },
        severity: "error",
      });
      return NextResponse.json({ ok: false, message: "Exclusão incompleta. Repita a exclusão para concluir a limpeza." }, { status: 500 });
    }

    await logActivity({
      request,
      actorType: "admin",
      actorId: admin.id,
      actorName: admin.full_name || "Admin",
      action: "student_hard_deleted",
      entityType: "student",
      entityId: id,
      metadata: { email: studentEmail, name: student?.name ?? null, had_history: dependencies },
    });

    return NextResponse.json({ ok: true, message: "Aluno e histórico excluídos definitivamente." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    await logSystemError({
      request,
      source: "student_hard_delete_api",
      actorType: "admin",
      errorMessage: message,
      safeDetails: { studentId: id },
      severity: "error",
    });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao excluir aluno definitivamente." }, { status: 500 });
  }
}
