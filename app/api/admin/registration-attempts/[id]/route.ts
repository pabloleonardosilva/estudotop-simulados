import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ["contact", "ignore", "reopen", "note"] as const;
type Action = (typeof ACTIONS)[number];

// PATCH permite SOMENTE campos administrativos (status de contato, nota,
// ignorar/reabrir) — nunca e-mail, nome, telefone ou etapa técnica, que
// pertencem ao fluxo real de cadastro e não podem ser editados por aqui.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { action?: string; note?: string } | null;
  const action = body?.action as Action | undefined;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ ok: false, message: "Ação inválida." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  try {
    const { data: current, error: currentError } = await supabase
      .from("student_registration_attempts")
      .select("id, status, admin_notes")
      .eq("id", id)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) {
      return NextResponse.json({ ok: false, message: "Tentativa de cadastro não encontrada." }, { status: 404 });
    }
    if (current.status === "completed") {
      return NextResponse.json({ ok: false, message: "Esta tentativa já foi concluída e não pode ser alterada." }, { status: 409 });
    }

    const updates: Record<string, unknown> = {};
    let auditAction = "";

    if (action === "contact") {
      updates.status = "contacted";
      updates.admin_contacted_at = new Date().toISOString();
      updates.admin_contacted_by = admin.id;
      if (typeof body?.note === "string" && body.note.trim()) updates.admin_notes = body.note.trim().slice(0, 2000);
      auditAction = "registration_attempt.contacted";
    } else if (action === "ignore") {
      updates.status = "ignored";
      updates.ignored_at = new Date().toISOString();
      auditAction = "registration_attempt.ignored";
    } else if (action === "reopen") {
      updates.status = "open";
      updates.ignored_at = null;
      auditAction = "registration_attempt.reopened";
    } else if (action === "note") {
      const note = typeof body?.note === "string" ? body.note.trim().slice(0, 2000) : "";
      updates.admin_notes = note || null;
      auditAction = "registration_attempt.note_updated";
    }

    const { data: updated, error: updateError } = await supabase
      .from("student_registration_attempts")
      .update(updates)
      .eq("id", id)
      .eq("status", current.status)
      .select("*")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      return NextResponse.json({ ok: false, message: "A tentativa mudou de estado. Recarregue e tente novamente." }, { status: 409 });
    }

    void logAdminAction({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: auditAction,
      entityType: "student_registration_attempt",
      entityId: id,
      request,
    });

    return NextResponse.json({ ok: true, message: "Tentativa atualizada.", data: updated });
  } catch (error) {
    void logSystemError({ source: "api.admin.registration_attempts.patch", error, request, metadata: { attempt_id: id } });
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar a tentativa de cadastro." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, message: "Identificador inválido." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  try {
    // Exclui SOMENTE o registro de acompanhamento — nunca auth.users,
    // profiles, students ou student_registration_confirmations.
    const { data: deleted, error } = await supabase
      .from("student_registration_attempts")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!deleted) {
      return NextResponse.json({ ok: false, message: "Tentativa de cadastro não encontrada." }, { status: 404 });
    }

    void logAdminAction({
      adminUserId: admin.id,
      adminEmail: admin.email,
      action: "registration_attempt.deleted",
      entityType: "student_registration_attempt",
      entityId: id,
      request,
    });

    return NextResponse.json({ ok: true, message: "Registro de acompanhamento excluído." });
  } catch (error) {
    void logSystemError({ source: "api.admin.registration_attempts.delete", error, request, metadata: { attempt_id: id } });
    return NextResponse.json({ ok: false, message: "Não foi possível excluir a tentativa de cadastro." }, { status: 500 });
  }
}
