import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sendFirstAccessEmail } from "@/lib/server/sendFirstAccessEmail";
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
  return status === "active" || status === "inactive";
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
        .select("status")
        .eq("id", id)
        .single();

      const { error: studentError } = await supabase
        .from("students")
        .update({ status })
        .eq("id", id);

      if (studentError) {
        return NextResponse.json({ ok: false, message: studentError.message }, { status: 400 });
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .update({ is_active: isActiveProfile(status) })
        .eq("id", id)
        .select("id, must_change_password")
        .maybeSingle();

      if (profileError) {
        return NextResponse.json({ ok: false, message: profileError.message }, { status: 400 });
      }

      await supabase.from("student_activity_log").insert({
        student_id: id,
        event_type: "status_change",
        description: `Status alterado: "${STATUS_LABELS[current?.status || ""] || current?.status}" → "${STATUS_LABELS[status] || status}"`,
        details: { from: current?.status ?? null, to: status },
        performed_by_name: "Admin",
      });

      await logActivity({
        request,
        actorType: "admin",
        actorName: "Admin",
        action: "student_status_changed",
        entityType: "student",
        entityId: id,
        metadata: { from: current?.status ?? null, to: status },
      });

      if (status === "active" && profileData?.must_change_password) {
        try {
          await supabase
            .from("students")
            .update({ welcome_email_status: "sending", welcome_email_error: null })
            .eq("id", id);
          await sendFirstAccessEmail(id, request);
          return NextResponse.json({
            ok: true,
            message: "Status atualizado. Link de primeiro acesso enviado ao aluno por e-mail.",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha ao enviar link de primeiro acesso.";
          await supabase
            .from("students")
            .update({ welcome_email_status: "failed", welcome_email_error: message })
            .eq("id", id);
          await logSystemError({
            request,
            source: "student_first_access_email",
            actorType: "admin",
            errorMessage: message,
            safeDetails: { studentId: id },
            severity: "warning",
          });
          return NextResponse.json({
            ok: true,
            emailSent: false,
            message: `Status atualizado, mas o e-mail de primeiro acesso não foi enviado: ${message}`,
          });
        }
      }

      return NextResponse.json({ ok: true, message: "Status atualizado com sucesso." });
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
