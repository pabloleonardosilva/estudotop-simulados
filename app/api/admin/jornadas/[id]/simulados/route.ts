import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isWithinFinalExamWindow(startedAtRaw: string, examDateRaw: string | null): boolean {
  if (!examDateRaw) return false;
  const startedAt = new Date(startedAtRaw + "T00:00:00");
  const effectiveEnd = new Date(examDateRaw + "T00:00:00");
  effectiveEnd.setDate(effectiveEnd.getDate() - 7);
  startedAt.setHours(0, 0, 0, 0);
  effectiveEnd.setHours(0, 0, 0, 0);
  return startedAt >= effectiveEnd;
}

function calcScheduledRelease(
  startedAtRaw: string,
  orderNumber: number,
  plannedSimuladosCount: number,
  durationDays: number,
  examDateRaw: string | null,
): string {
  const startedAt = new Date(startedAtRaw + "T00:00:00");

  if (plannedSimuladosCount <= 0 || orderNumber <= 1 || isWithinFinalExamWindow(startedAtRaw, examDateRaw)) {
    return startedAtRaw;
  }

  let intervalDays: number;

  if (examDateRaw) {
    const effectiveEnd = new Date(examDateRaw + "T00:00:00");
    effectiveEnd.setDate(effectiveEnd.getDate() - 7);
    const availableDays = Math.round(
      (effectiveEnd.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    intervalDays = availableDays > 0 ? availableDays / plannedSimuladosCount : 0;
  } else {
    intervalDays = durationDays / plannedSimuladosCount;
  }

  const ms = startedAt.getTime() + Math.floor((orderNumber - 1) * intervalDays) * 24 * 60 * 60 * 1000;
  return toDateString(new Date(ms));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("jornada_simulados")
      .select(`
        id,
        simulado_id,
        order_number,
        created_at,
        simulados:simulado_id(id, title, status, question_count)
      `)
      .eq("jornada_id", id)
      .order("order_number", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ ok: true, simulados: data || [], message: "" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro ao listar simulados." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const body = await request.json();
    const simuladoId = String(body.simulado_id || "").trim();

    if (!simuladoId) {
      return NextResponse.json({ ok: false, message: "Informe o simulado." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: existing } = await supabase
      .from("jornada_simulados")
      .select("id")
      .eq("jornada_id", id)
      .eq("simulado_id", simuladoId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { ok: false, message: "Este simulado já está vinculado a esta jornada." },
        { status: 409 },
      );
    }

    const { data: jornada, error: jornadaErr } = await supabase
      .from("jornadas")
      .select("id, duration_days, duration_months, exam_date, planned_simulados_count")
      .eq("id", id)
      .single();

    if (jornadaErr || !jornada) {
      return NextResponse.json({ ok: false, message: "Jornada não encontrada." }, { status: 404 });
    }

    const { data: maxRow } = await supabase
      .from("jornada_simulados")
      .select("order_number")
      .eq("jornada_id", id)
      .order("order_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxRow?.order_number || 0) + 1;
    const plannedSimuladosCount = jornada.planned_simulados_count || nextOrder;

    if (nextOrder > plannedSimuladosCount) {
      return NextResponse.json(
        { ok: false, message: `Esta Jornada foi configurada para ${plannedSimuladosCount} simulado(s). Aumente a quantidade planejada antes de adicionar mais simulados.` },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("jornada_simulados")
      .insert({ jornada_id: id, simulado_id: simuladoId, order_number: nextOrder })
      .select("id, simulado_id, order_number, simulados:simulado_id(id, title, status, question_count)")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { ok: false, message: error?.message || "Erro ao vincular simulado." },
        { status: 400 },
      );
    }

    const { data: enrollments } = await supabase
      .from("student_jornadas")
      .select("id, started_at, status")
      .eq("jornada_id", id)
      .in("status", ["active", "paused"]);

    const records = (enrollments || []).map((enrollment) => {
      const releaseAll = isWithinFinalExamWindow(enrollment.started_at, jornada.exam_date);
      const shouldReleaseNow = releaseAll || nextOrder === 1;
      return {
        student_jornada_id: enrollment.id,
        jornada_simulado_id: data.id,
        simulado_id: simuladoId,
        order_number: nextOrder,
        scheduled_release_at: calcScheduledRelease(
          enrollment.started_at,
          nextOrder,
          plannedSimuladosCount,
          Number(jornada.duration_days || jornada.duration_months * 30),
          jornada.exam_date,
        ),
        status: shouldReleaseNow ? "available" : "locked",
        released_at: shouldReleaseNow ? new Date().toISOString() : null,
      };
    });

    if (records.length > 0) {
      const { error: sjsErr } = await supabase.from("student_jornada_simulados").insert(records);
      if (sjsErr) {
        await supabase.from("jornada_simulados").delete().eq("id", data.id);
        return NextResponse.json({ ok: false, message: sjsErr.message }, { status: 400 });
      }
    }

    return NextResponse.json(
      { ok: true, jornada_simulado: data, message: "Simulado vinculado com sucesso." },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  try {
    const body = await request.json();
    const jornadaSimuladoId = String(body.jornada_simulado_id || "").trim();

    if (!jornadaSimuladoId) {
      return NextResponse.json({ ok: false, message: "Informe o ID do vínculo." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();

    const { data: blocking } = await supabase
      .from("student_jornada_simulados")
      .select("id")
      .eq("jornada_simulado_id", jornadaSimuladoId)
      .in("status", ["in_progress", "completed"]);

    if (blocking && blocking.length > 0) {
      return NextResponse.json(
        { ok: false, message: "Não é possível remover um simulado que alunos já estão realizando ou concluíram." },
        { status: 400 },
      );
    }

    await supabase.from("student_jornada_simulados").delete().eq("jornada_simulado_id", jornadaSimuladoId);

    const { error } = await supabase
      .from("jornada_simulados")
      .delete()
      .eq("id", jornadaSimuladoId)
      .eq("jornada_id", id);

    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    }

    const { data: remaining } = await supabase
      .from("jornada_simulados")
      .select("id, order_number")
      .eq("jornada_id", id)
      .order("order_number", { ascending: true });

    if (remaining && remaining.length > 0) {
      await Promise.all(
        remaining.flatMap((r, i) => [
          supabase.from("jornada_simulados").update({ order_number: i + 1 }).eq("id", r.id),
          supabase.from("student_jornada_simulados").update({ order_number: i + 1 }).eq("jornada_simulado_id", r.id),
        ]),
      );
    }

    return NextResponse.json({ ok: true, message: "Simulado removido com sucesso." });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro inesperado." },
      { status: 500 },
    );
  }
}
