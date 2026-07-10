import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { logActivity } from "@/lib/logging/activity-log";
import { logSystemError } from "@/lib/logging/error-log";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; studentId: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id: jornadaId, studentId } = await params;
  try {
    const body = await request.json();
    const action = String(body.action || "").trim();

    const supabase = createSupabaseAdminClient();

    const { data: sj, error: sjErr } = await supabase
      .from("student_jornadas")
      .select("id, status, expires_at, student_id")
      .eq("jornada_id", jornadaId)
      .eq("student_id", studentId)
      .single();

    if (sjErr || !sj) {
      return NextResponse.json({ ok: false, message: "Matrícula não encontrada." }, { status: 404 });
    }

    const { data: jornada } = await supabase
      .from("jornadas")
      .select("id, title")
      .eq("id", jornadaId)
      .single();

    const jornadaTitle = jornada?.title ?? jornadaId;

    if (action === "cancel") {
      if (sj.status === "cancelled") {
        return NextResponse.json({ ok: false, message: "Matrícula já está cancelada." }, { status: 400 });
      }

      await supabase.from("student_jornadas").update({ status: "cancelled" }).eq("id", sj.id);

      const { count } = await supabase
        .from("student_jornadas")
        .select("id", { count: "exact", head: true })
        .eq("student_id", sj.student_id)
        .eq("status", "active");

      if (!count || count === 0) {
        await supabase.from("students").update({ status: "inactive" }).eq("id", sj.student_id);
      }

      await supabase.from("student_activity_log").insert({
        student_id: sj.student_id,
        event_type: "jornada_cancelled",
        description: `Matrícula cancelada na jornada "${jornadaTitle}"`,
        details: { jornada_id: jornadaId, jornada_title: jornadaTitle },
        performed_by_name: "Admin",
      });

      await logActivity({
        request,
        actorType: "admin",
        actorName: "Admin",
        action: "jornada_cancelled",
        entityType: "student_jornada",
        entityId: sj.id,
        metadata: { student_id: sj.student_id, jornada_id: jornadaId, jornada_title: jornadaTitle, previous_status: sj.status },
      });

      return NextResponse.json({ ok: true, message: "Matrícula cancelada com sucesso." });
    }

    if (action === "pause") {
      if (sj.status === "cancelled") {
        return NextResponse.json({ ok: false, message: "Matrícula cancelada não pode ser pausada." }, { status: 400 });
      }
      if (sj.status === "paused") {
        return NextResponse.json({ ok: false, message: "Matrícula já está pausada." }, { status: 400 });
      }

      await supabase.from("student_jornadas").update({ status: "paused" }).eq("id", sj.id);

      await supabase.from("student_activity_log").insert({
        student_id: sj.student_id,
        event_type: "jornada_paused",
        description: `Matrícula pausada na jornada "${jornadaTitle}"`,
        details: { jornada_id: jornadaId, jornada_title: jornadaTitle, previous_status: sj.status },
        performed_by_name: "Admin",
      });

      await logActivity({
        request,
        actorType: "admin",
        actorName: "Admin",
        action: "jornada_paused",
        entityType: "student_jornada",
        entityId: sj.id,
        metadata: { student_id: sj.student_id, jornada_id: jornadaId, jornada_title: jornadaTitle, previous_status: sj.status },
      });

      return NextResponse.json({ ok: true, message: "Matrícula pausada com sucesso." });
    }

    if (action === "resume") {
      if (sj.status !== "paused") {
        return NextResponse.json({ ok: false, message: "Apenas matrículas pausadas podem ser reativadas." }, { status: 400 });
      }

      await supabase.from("student_jornadas").update({ status: "active" }).eq("id", sj.id);
      await supabase.from("students").update({ status: "active" }).eq("id", sj.student_id);

      await supabase.from("student_activity_log").insert({
        student_id: sj.student_id,
        event_type: "jornada_resumed",
        description: `Matrícula reativada na jornada "${jornadaTitle}"`,
        details: { jornada_id: jornadaId, jornada_title: jornadaTitle },
        performed_by_name: "Admin",
      });

      await logActivity({
        request,
        actorType: "admin",
        actorName: "Admin",
        action: "jornada_resumed",
        entityType: "student_jornada",
        entityId: sj.id,
        metadata: { student_id: sj.student_id, jornada_id: jornadaId, jornada_title: jornadaTitle, previous_status: sj.status },
      });

      return NextResponse.json({ ok: true, message: "Matrícula reativada com sucesso." });
    }

    if (action === "add_days") {
      const days = Number(body.days);
      if (!Number.isInteger(days) || days <= 0) {
        return NextResponse.json(
          { ok: false, message: "Informe um número de dias válido (inteiro positivo)." },
          { status: 400 },
        );
      }

      const currentExpires = new Date(sj.expires_at + "T00:00:00");
      const oldExpiresAt = sj.expires_at;
      currentExpires.setDate(currentExpires.getDate() + days);
      const newExpiresAt = currentExpires.toISOString().slice(0, 10);

      const updates: Record<string, string> = { expires_at: newExpiresAt };
      if (sj.status === "expired") {
        updates.status = "active";
      }

      await supabase.from("student_jornadas").update(updates).eq("id", sj.id);

      await supabase.from("student_activity_log").insert({
        student_id: sj.student_id,
        event_type: "access_extended",
        description: `Prazo de acesso estendido em ${days} dia(s) na jornada "${jornadaTitle}"`,
        details: {
          jornada_id: jornadaId,
          jornada_title: jornadaTitle,
          days_added: days,
          old_expires_at: oldExpiresAt,
          new_expires_at: newExpiresAt,
        },
        performed_by_name: "Admin",
      });

      await logActivity({
        request,
        actorType: "admin",
        actorName: "Admin",
        action: "jornada_access_extended",
        entityType: "student_jornada",
        entityId: sj.id,
        metadata: { student_id: sj.student_id, jornada_id: jornadaId, jornada_title: jornadaTitle, days_added: days, old_expires_at: oldExpiresAt, new_expires_at: newExpiresAt },
      });

      return NextResponse.json({
        ok: true,
        expires_at: newExpiresAt,
        message: `Acesso estendido até ${new Intl.DateTimeFormat("pt-BR").format(new Date(newExpiresAt + "T00:00:00"))}.`,
      });
    }

    return NextResponse.json({ ok: false, message: "Ação inválida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    await logSystemError({
      request,
      source: "jornada_student_action_api",
      actorType: "admin",
      errorMessage: message,
      safeDetails: { jornadaId, studentId },
      severity: "error",
    });
    return NextResponse.json(
      { ok: false, message },
      { status: 500 },
    );
  }
}
