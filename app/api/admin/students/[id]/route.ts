import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/lib/logging/error-log";

const STATUS_LABELS: Record<string, string> = {
  pending: "Em análise",
  active: "Ativo",
  blocked: "Bloqueado",
  inactive: "Inativo",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  cpf: "CPF",
  notes: "Observações",
  desired_contests: "Concursos de interesse",
};

function isActiveProfile(status: string): boolean {
  return status === "active";
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body = await request.json();
    const { id } = await params;
    const supabase = createSupabaseAdminClient();

    // ── Status change ──────────────────────────────────────────────────────────
    if (body.status !== undefined) {
      const status = body.status as string;
      const validStatuses = ["pending", "active", "blocked", "inactive"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { ok: false, message: "Status inválido. Use: pending, active, blocked ou inactive." },
          { status: 400 }
        );
      }

      const { data: current } = await supabase
        .from("students")
        .select("status, approved_at")
        .eq("id", id)
        .single();

      // A aprovação inicial (pending → active) é um evento explícito com envio
      // de boas-vindas — nunca acontece por PATCH genérico de status.
      if (status === "active" && current?.status === "pending" && !current?.approved_at) {
        return NextResponse.json(
          {
            ok: false,
            code: "USE_APPROVAL_ACTION",
            message: "Este cadastro aguarda aprovação. Use a ação \"Aprovar cadastro\" para ativar este aluno.",
          },
          { status: 409 }
        );
      }

      const { error: studentError } = await supabase
        .from("students")
        .update({ status })
        .eq("id", id);

      if (studentError) {
        return NextResponse.json({ ok: false, message: studentError.message }, { status: 400 });
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ is_active: isActiveProfile(status) })
        .eq("id", id);

      if (profileError) {
        return NextResponse.json({ ok: false, message: profileError.message }, { status: 400 });
      }

      const isReactivation = status === "active" && current?.status === "inactive";

      await supabase.from("student_activity_log").insert({
        student_id: id,
        event_type: isReactivation ? "student_reactivated" : "status_change",
        description: status === "inactive"
          ? `Conta desativada pelo administrador (status: "${STATUS_LABELS[current?.status || ""] || current?.status}" → "Inativo"). Histórico preservado.`
          : isReactivation
            ? "Aluno reativado pelo administrador. Aprovação original preservada; nenhum e-mail de boas-vindas enviado."
            : `Status alterado: "${STATUS_LABELS[current?.status || ""] || current?.status}" → "${STATUS_LABELS[status] || status}"`,
        details: { from: current?.status ?? null, to: status },
        performed_by_name: "Admin",
      });

      await logActivity({
        request,
        actorType: "admin",
        actorName: "Admin",
        action: isReactivation ? "student_reactivated" : "student_status_changed",
        entityType: "student",
        entityId: id,
        metadata: { from: current?.status ?? null, to: status },
      });

      // Mudança genérica de status NUNCA envia e-mail de boas-vindas: o envio
      // pertence exclusivamente à aprovação inicial (rota /approve) e ao
      // reenvio manual. Reativação restabelece o acesso sem contato com o Resend.
      return NextResponse.json({
        ok: true,
        message: isReactivation ? "Aluno reativado com sucesso." : "Status atualizado com sucesso.",
      });
    }

    // ── Field updates ──────────────────────────────────────────────────────────
    const updatableFields = ["name", "phone", "cpf", "notes", "desired_contests"] as const;

    const { data: current, error: fetchError } = await supabase
      .from("students")
      .select([...updatableFields, "email"].join(", "))
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
    }

    const updates: Record<string, string | null> = {};
    const changes: Array<{ field: string; from: string | null; to: string | null }> = [];

    for (const field of updatableFields) {
      if (!(field in body)) continue;
      const newVal = body[field] ? String(body[field]).trim() || null : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldVal = (current as any)[field] ?? null;
      if (newVal !== oldVal) {
        updates[field] = newVal;
        changes.push({ field, from: oldVal, to: newVal });
      }
    }

    if ("email" in body) {
      const newEmail = body.email ? String(body.email).trim().toLowerCase() : null;
      if (!newEmail) {
        return NextResponse.json({ ok: false, message: "E-mail não pode ser vazio." }, { status: 400 });
      }
      if (!isValidEmail(newEmail)) {
        return NextResponse.json({ ok: false, message: "Informe um e-mail válido." }, { status: 400 });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldEmail = (current as any).email ?? null;
      if (newEmail !== oldEmail) {
        const { data: emailConflict } = await supabase
          .from("students")
          .select("id")
          .eq("email", newEmail)
          .neq("id", id)
          .maybeSingle();

        if (emailConflict) {
          return NextResponse.json(
            { ok: false, message: "Este e-mail já está em uso por outro aluno." },
            { status: 409 }
          );
        }

        updates.email = newEmail;
        changes.push({ field: "email", from: oldEmail, to: newEmail });
      }
    }

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhuma alteração detectada." });
    }

    if ("name" in updates && !updates.name) {
      return NextResponse.json({ ok: false, message: "Nome não pode ser vazio." }, { status: 400 });
    }

    const currentStudent = current as unknown as { email?: unknown };
    const oldEmail = typeof currentStudent.email === "string"
      ? currentStudent.email
      : null;

    if (updates.email) {
      const { error: authError } = await supabase.auth.admin.updateUserById(id, {
        email: updates.email,
        email_confirm: true,
      });
      if (authError) {
        return NextResponse.json(
          { ok: false, message: `Falha ao atualizar e-mail: ${authError.message}` },
          { status: 400 }
        );
      }
    }

    const { error: updateError } = await supabase
      .from("students")
      .update(updates)
      .eq("id", id);

    if (updateError) {
      if (updates.email && oldEmail) {
        await supabase.auth.admin.updateUserById(id, {
          email: oldEmail,
          email_confirm: true,
        });
      }
      return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 });
    }

    if (updates.name) {
      await supabase.from("profiles").update({ full_name: updates.name }).eq("id", id);
    }

    const logRows = changes.map((c) => ({
      student_id: id,
      event_type: "field_update",
      description: `Campo "${FIELD_LABELS[c.field] || c.field}" atualizado`,
      details: { field: c.field, from: c.from, to: c.to },
      performed_by_name: "Admin",
    }));

    await supabase.from("student_activity_log").insert(logRows);

    await logActivity({
      request,
      actorType: "admin",
      actorName: "Admin",
      action: "student_fields_updated",
      entityType: "student",
      entityId: id,
      metadata: { changes },
    });

    return NextResponse.json({ ok: true, message: "Dados atualizados com sucesso." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    await logSystemError({
      request,
      source: "student_update_api",
      actorType: "admin",
      errorMessage: message,
      safeDetails: { studentId: (await params).id },
      severity: "error",
    });
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tabelas com vínculo acadêmico/histórico que impedem a exclusão definitiva.
// student_activity_log e simulado_result_change_logs (CASCADE) são metadados da
// própria conta; simulado_answers depende de simulado_attempts.
const HISTORY_CHECKS: Array<{ type: string; table: string }> = [
  { type: "jornadas", table: "student_jornadas" },
  { type: "tentativas", table: "simulado_attempts" },
  { type: "resultados", table: "simulado_results" },
  { type: "avaliacoes", table: "simulado_feedbacks" },
  { type: "anotacoes", table: "student_simulado_notes" },
  { type: "topcoins", table: "topcoin_earnings" },
  { type: "tentativas_legado", table: "attempts" },
  { type: "simulados_legado", table: "student_simulados" },
];

export async function DELETE(
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

    const supabase = createSupabaseAdminClient();

    const { data: student } = await supabase
      .from("students")
      .select("id, name, email")
      .eq("id", id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", id)
      .maybeSingle();

    const { data: authLookup } = await supabase.auth.admin.getUserById(id);
    const authUser = authLookup?.user ?? null;

    if (!student && !profile && !authUser) {
      return NextResponse.json({ ok: false, message: "Aluno não encontrado." }, { status: 404 });
    }

    if (profile && profile.role !== "student") {
      return NextResponse.json(
        { ok: false, message: "Somente contas de aluno podem ser excluídas definitivamente." },
        { status: 403 }
      );
    }

    const dependencies: Array<{ type: string; count: number }> = [];
    for (const check of HISTORY_CHECKS) {
      const { count, error } = await supabase
        .from(check.table)
        .select("id", { count: "exact", head: true })
        .eq("student_id", id);

      if (error) {
        await logSystemError({
          request,
          source: "student_delete_api",
          actorType: "admin",
          errorMessage: `Falha ao verificar vínculos em ${check.table}: ${error.message}`,
          safeDetails: { studentId: id },
          severity: "error",
        });
        return NextResponse.json(
          { ok: false, message: "Não foi possível verificar os vínculos do aluno. Nada foi excluído." },
          { status: 500 }
        );
      }

      if ((count ?? 0) > 0) {
        dependencies.push({ type: check.type, count: count ?? 0 });
      }
    }

    if (dependencies.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          code: "STUDENT_HAS_HISTORY",
          message: "Este aluno possui histórico e não pode ser excluído definitivamente. Desative a conta para preservar os dados.",
          dependencies,
        },
        { status: 409 }
      );
    }

    const studentEmail = (student?.email || authUser?.email || "").trim().toLowerCase() || null;

    // 1. Registros temporários de confirmação (por user_id e por e-mail).
    const { error: confirmByUserError } = await supabase
      .from("student_registration_confirmations")
      .delete()
      .eq("user_id", id);
    if (confirmByUserError) {
      return NextResponse.json(
        { ok: false, message: "Falha ao limpar confirmações de cadastro. Nada essencial foi excluído." },
        { status: 500 }
      );
    }
    if (studentEmail) {
      await supabase.from("student_registration_confirmations").delete().eq("email", studentEmail);
    }

    // 2. Supabase Auth primeiro: se falhar, students/profiles permanecem intactos
    //    e visíveis no Admin (nunca produz conta invisível). Repetir a operação
    //    é seguro: cada camada trata "já não existe" como etapa concluída.
    if (authUser) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
      if (authDeleteError && !/not[\s_-]*found/i.test(authDeleteError.message || "")) {
        await logSystemError({
          request,
          source: "student_delete_api",
          actorType: "admin",
          errorMessage: `Falha ao excluir usuário no Supabase Auth: ${authDeleteError.message}`,
          safeDetails: { studentId: id },
          severity: "error",
        });
        return NextResponse.json(
          { ok: false, message: "Falha ao remover a conta de autenticação. Nenhum dado do aluno foi excluído." },
          { status: 500 }
        );
      }
    }

    // 3. students (student_activity_log, notas e ajustes seguem por CASCADE — aqui já validados como vazios/administrativos).
    if (student) {
      const { error: studentDeleteError } = await supabase.from("students").delete().eq("id", id);
      if (studentDeleteError) {
        await logSystemError({
          request,
          source: "student_delete_api",
          actorType: "admin",
          errorMessage: `Auth removido, mas falha ao excluir students: ${studentDeleteError.message}`,
          safeDetails: { studentId: id },
          severity: "error",
        });
        return NextResponse.json(
          { ok: false, message: "Exclusão incompleta: o registro do aluno permanece. Repita a exclusão para concluir a limpeza." },
          { status: 500 }
        );
      }
    }

    // 4. profiles.
    if (profile) {
      const { error: profileDeleteError } = await supabase.from("profiles").delete().eq("id", id);
      if (profileDeleteError) {
        await logSystemError({
          request,
          source: "student_delete_api",
          actorType: "admin",
          errorMessage: `Auth e students removidos, mas falha ao excluir profiles: ${profileDeleteError.message}`,
          safeDetails: { studentId: id },
          severity: "error",
        });
        return NextResponse.json(
          { ok: false, message: "Exclusão incompleta: o perfil do aluno permanece. Repita a exclusão para concluir a limpeza." },
          { status: 500 }
        );
      }
    }

    // 5. Reverificação final: sucesso somente com as três camadas ausentes.
    const { data: studentCheck } = await supabase.from("students").select("id").eq("id", id).maybeSingle();
    const { data: profileCheck } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
    const { data: authCheck } = await supabase.auth.admin.getUserById(id);

    if (studentCheck || profileCheck || authCheck?.user) {
      await logSystemError({
        request,
        source: "student_delete_api",
        actorType: "admin",
        errorMessage: "Reverificação pós-exclusão encontrou camadas remanescentes.",
        safeDetails: {
          studentId: id,
          remaining: {
            students: Boolean(studentCheck),
            profiles: Boolean(profileCheck),
            auth: Boolean(authCheck?.user),
          },
        },
        severity: "error",
      });
      return NextResponse.json(
        { ok: false, message: "Exclusão incompleta. Repita a exclusão para concluir a limpeza." },
        { status: 500 }
      );
    }

    await logActivity({
      request,
      actorType: "admin",
      actorName: "Admin",
      action: "student_deleted",
      entityType: "student",
      entityId: id,
      metadata: { email: studentEmail, name: student?.name ?? null },
    });

    return NextResponse.json({ ok: true, message: "Aluno excluído definitivamente." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    await logSystemError({
      request,
      source: "student_delete_api",
      actorType: "admin",
      errorMessage: message,
      safeDetails: { studentId: id },
      severity: "error",
    });
    return NextResponse.json({ ok: false, message: "Erro inesperado ao excluir aluno." }, { status: 500 });
  }
}
