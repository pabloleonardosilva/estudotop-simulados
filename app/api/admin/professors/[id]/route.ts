import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/lib/logging/error-log";

type Payload = { name?: unknown; phone?: unknown; status?: unknown; email?: unknown };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  const body = await request.json().catch(() => null) as Payload | null;
  if (!body) return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data: professor } = await supabase.from("professors").select("*").eq("id", id).maybeSingle();
  if (!professor) return NextResponse.json({ ok: false, message: "Professor não encontrado." }, { status: 404 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!profile || profile.role !== "professor") return NextResponse.json({ ok: false, message: "Este cadastro não é uma conta de professor." }, { status: 409 });

  const updates: { name?: string; phone?: string | null; status?: string } = {};
  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 3) return NextResponse.json({ ok: false, message: "Informe um nome válido." }, { status: 400 });
    updates.name = name;
  }
  if (body.phone !== undefined) {
    updates.phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
  }
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "inactive") return NextResponse.json({ ok: false, message: "Status inválido." }, { status: 400 });
    updates.status = body.status;
  }

  // Troca de e-mail exige o mesmo padrão já usado para aluno
  // (updateStudentAccountEmail, lib/server/studentAccountService.ts):
  // auth.users primeiro, com rollback se a tabela de domínio falhar depois —
  // nunca um UPDATE isolado em uma única tabela.
  if (body.email !== undefined) {
    const newEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return NextResponse.json({ ok: false, message: "Informe um e-mail válido." }, { status: 400 });
    if (newEmail !== professor.email.toLowerCase()) {
      const [{ data: professorConflict }, { data: studentConflict }] = await Promise.all([
        supabase.from("professors").select("id").ilike("email", newEmail).neq("id", id).maybeSingle(),
        supabase.from("students").select("id").ilike("email", newEmail).maybeSingle(),
      ]);
      if (professorConflict || studentConflict) return NextResponse.json({ ok: false, message: "Este e-mail já está em uso por outra conta." }, { status: 409 });

      const oldEmail = professor.email;
      const { error: authError } = await supabase.auth.admin.updateUserById(id, { email: newEmail, email_confirm: true, user_metadata: { email: newEmail } });
      if (authError) return NextResponse.json({ ok: false, message: "Não foi possível atualizar o e-mail de acesso." }, { status: 500 });
      const { error: professorEmailError } = await supabase.from("professors").update({ email: newEmail }).eq("id", id);
      if (professorEmailError) {
        const { error: rollbackError } = await supabase.auth.admin.updateUserById(id, { email: oldEmail, email_confirm: true, user_metadata: { email: oldEmail } });
        if (rollbackError) {
          void logSystemError({ request, source: "professor_update_email_rollback", actorType: "admin", errorMessage: rollbackError.message, safeDetails: { professorId: id }, severity: "critical" });
          return NextResponse.json({ ok: false, message: "Não foi possível concluir a atualização com segurança. Verifique a conta manualmente." }, { status: 500 });
        }
        return NextResponse.json({ ok: false, message: "Não foi possível atualizar o e-mail. Os dados anteriores foram preservados." }, { status: 500 });
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error: professorUpdateError } = await supabase.from("professors").update(updates).eq("id", id);
    if (professorUpdateError) return NextResponse.json({ ok: false, message: "Não foi possível atualizar o professor." }, { status: 500 });

    // profiles.role nunca é tocado aqui — só full_name/is_active seguem em
    // sincronia com o cadastro do professor, igual ao POST de criação.
    const profileUpdates: { full_name?: string; is_active?: boolean } = {};
    if (updates.name !== undefined) profileUpdates.full_name = updates.name;
    if (updates.status !== undefined) profileUpdates.is_active = updates.status === "active";
    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileUpdateError } = await supabase.from("profiles").update(profileUpdates).eq("id", id);
      if (profileUpdateError) {
        void logSystemError({ request, source: "professor_update_profile_sync", actorType: "admin", errorMessage: profileUpdateError.message, safeDetails: { professorId: id }, severity: "error" });
        return NextResponse.json({ ok: false, message: "Professor atualizado, mas o perfil não pôde ser sincronizado. Verifique manualmente." }, { status: 500 });
      }
    }
  }

  await logActivity({ request, actorType: "admin", actorId: admin.id, actorName: admin.full_name || "Admin", action: "professor_updated", entityType: "professor", entityId: id, metadata: { fields: Object.keys(body) } });
  return NextResponse.json({ ok: true, message: "Professor atualizado com sucesso." });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { data: professor } = await supabase.from("professors").select("id, name, email").eq("id", id).maybeSingle();
  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", id).maybeSingle();
  if (!professor && !profile) return NextResponse.json({ ok: false, message: "Professor não encontrado." }, { status: 404 });
  if (profile && profile.role !== "professor") return NextResponse.json({ ok: false, message: "Somente contas de professor podem ser excluídas por aqui." }, { status: 403 });

  // simulado_event_professors.professor_id references professors(id) ON
  // DELETE RESTRICT — o próprio banco já impede a exclusão enquanto houver
  // vínculo. Verificamos antes para devolver uma mensagem clara em vez de
  // deixar a query estourar em erro de FK.
  const { count: assignmentCount, error: assignmentsError } = await supabase
    .from("simulado_event_professors")
    .select("id", { count: "exact", head: true })
    .eq("professor_id", id);
  if (assignmentsError) return NextResponse.json({ ok: false, message: "Não foi possível verificar os vínculos do professor. Nada foi excluído." }, { status: 500 });
  if ((assignmentCount ?? 0) > 0) {
    return NextResponse.json({
      ok: false,
      code: "PROFESSOR_HAS_EVENTS",
      message: `Este professor está vinculado a ${assignmentCount} Evento(s) e não pode ser excluído definitivamente. Desative o acesso em vez disso.`,
      event_count: assignmentCount,
    }, { status: 409 });
  }

  // Ordem inversa da exclusão de aluno: aqui professors.id -> auth.users(id)
  // é ON DELETE RESTRICT (não CASCADE), então a linha de professors precisa
  // sair primeiro; só depois profiles e por último auth.users.
  if (professor) {
    const { error: professorDeleteError } = await supabase.from("professors").delete().eq("id", id);
    if (professorDeleteError) {
      void logSystemError({ request, source: "professor_delete_api", actorType: "admin", errorMessage: professorDeleteError.message, safeDetails: { professorId: id }, severity: "error" });
      return NextResponse.json({ ok: false, message: "Não foi possível excluir o cadastro do professor. Nada foi alterado." }, { status: 500 });
    }
  }
  if (profile) {
    const { error: profileDeleteError } = await supabase.from("profiles").delete().eq("id", id);
    if (profileDeleteError) {
      void logSystemError({ request, source: "professor_delete_api", actorType: "admin", errorMessage: profileDeleteError.message, safeDetails: { professorId: id }, severity: "error" });
      return NextResponse.json({ ok: false, message: "Cadastro do professor removido, mas o perfil permanece. Repita a exclusão para concluir a limpeza." }, { status: 500 });
    }
  }
  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
  if (authDeleteError && !/not[\s_-]*found/i.test(authDeleteError.message || "")) {
    void logSystemError({ request, source: "professor_delete_api", actorType: "admin", errorMessage: authDeleteError.message, safeDetails: { professorId: id }, severity: "error" });
    return NextResponse.json({ ok: false, message: "Professor e perfil removidos, mas a conta de acesso permanece. Repita a exclusão para concluir a limpeza." }, { status: 500 });
  }

  const { data: professorCheck } = await supabase.from("professors").select("id").eq("id", id).maybeSingle();
  const { data: profileCheck } = await supabase.from("profiles").select("id").eq("id", id).maybeSingle();
  const { data: authCheck } = await supabase.auth.admin.getUserById(id);
  if (professorCheck || profileCheck || authCheck?.user) {
    void logSystemError({ request, source: "professor_delete_api", errorMessage: "Reverificação pós-exclusão encontrou camadas remanescentes.", actorType: "admin", safeDetails: { professorId: id, remaining: { professor: Boolean(professorCheck), profile: Boolean(profileCheck), auth: Boolean(authCheck?.user) } }, severity: "error" });
    return NextResponse.json({ ok: false, message: "Exclusão incompleta. Repita a exclusão para concluir a limpeza." }, { status: 500 });
  }

  await logActivity({ request, actorType: "admin", actorId: admin.id, actorName: admin.full_name || "Admin", action: "professor_deleted", entityType: "professor", entityId: id, metadata: { email: professor?.email ?? null, name: professor?.name ?? null } });
  return NextResponse.json({ ok: true, message: "Professor excluído definitivamente." });
}
