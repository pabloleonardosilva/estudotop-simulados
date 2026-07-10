import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

const MAX_MESSAGE_LENGTH = 2000;

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("student_help_messages")
    .select("id, message, status, admin_reply, replied_at, student_seen_reply_at, created_at, updated_at")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false });

  if (error) {
    void logSystemError({ source: "api.student.help_messages.list", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar suas mensagens." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messages: data || [] });
}

export async function POST(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ ok: false, message: "Escreva uma mensagem antes de enviar." }, { status: 400 });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { ok: false, message: `A mensagem pode ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.` },
      { status: 400 },
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("student_help_messages")
    .insert({ student_id: student.id, message })
    .select("id, message, status, admin_reply, replied_at, student_seen_reply_at, created_at, updated_at")
    .single();

  if (error) {
    void logSystemError({ source: "api.student.help_messages.create", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível enviar sua mensagem." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Mensagem enviada com sucesso.", item: data });
}
