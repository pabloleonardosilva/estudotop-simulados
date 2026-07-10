import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function POST(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("student_help_messages")
    .update({ student_seen_reply_at: new Date().toISOString() })
    .eq("student_id", student.id)
    .eq("status", "answered")
    .is("student_seen_reply_at", null);

  if (error) {
    void logSystemError({ source: "api.student.help_messages.mark_seen", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível atualizar suas mensagens." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Mensagens marcadas como vistas." });
}
