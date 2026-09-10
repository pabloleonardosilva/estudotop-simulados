import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { hashEmailActionToken } from "@/lib/security/registrationTokens";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";
import { ensureStudentRecordForExistingIdentity } from "@/lib/server/studentAccountService";
import { logSecurityEvent } from "@/app/lib/server/auditLogger";

export async function POST(request: Request) {
  const supabase = createSupabaseAdminClient();
  let student = await getStudentFromRequest(request);

  // Identidade autenticada sem `students` ainda (ex.: professor existente
  // que também quer participar como aluno) — nunca a partir de um e-mail
  // informado anonimamente, sempre do token Bearer já validado pelo próprio
  // Supabase Auth nesta requisição. Escopo desta Sprint: só profiles.role =
  // "professor" (ver docs/Sprint-cadastro-alunos.md); admin não é elegível
  // aqui sem decisão de produto adicional (ver seção "Extensão para
  // admin").
  let extendedIdentity: { userId: string; email: string; fullName: string | null } | null = null;
  if (!student) {
    const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) return NextResponse.json({ ok: false, message: "Autentique-se para confirmar a participação." }, { status: 401 });
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData.user) return NextResponse.json({ ok: false, message: "Autentique-se para confirmar a participação." }, { status: 401 });
    // profiles.is_active é hoje um bloqueio GLOBAL da identidade — app/login/
    // page.tsx recusa o login inteiro (qualquer papel) quando is_active é
    // false, antes mesmo de chegar em qualquer lógica de Evento. Exigir o
    // mesmo aqui é consistência, não uma escolha nova: uma identidade que o
    // próprio login já recusa nunca deveria ganhar uma capacidade nova por
    // uma rota diferente. Reinterpretar is_active como "só bloqueia funções
    // profissionais" exigiria decisão arquitetural própria, fora do escopo
    // desta Sprint (ver docs/Sprint-cadastro-alunos.md).
    const { data: profile } = await supabase.from("profiles").select("id, full_name, role, is_active").eq("id", userData.user.id).maybeSingle();
    if (!profile || profile.role !== "professor" || !profile.is_active) {
      return NextResponse.json({ ok: false, message: "Autentique-se para confirmar a participação." }, { status: 401 });
    }
    const { data: professorRow } = await supabase.from("professors").select("status").eq("id", userData.user.id).maybeSingle();
    if (professorRow?.status !== "active") {
      return NextResponse.json({ ok: false, message: "Autentique-se para confirmar a participação." }, { status: 401 });
    }
    extendedIdentity = { userId: userData.user.id, email: (userData.user.email || "").trim().toLowerCase(), fullName: profile.full_name };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get("estudotop_event_intent")?.value;
  if (!token) return NextResponse.json({ ok: false, message: "Intenção de ingresso ausente ou expirada." }, { status: 400 });
  const { data: intent } = await supabase.from("simulado_event_join_intents").select("*,simulado_events:event_id(*)").eq("token_hash", hashEmailActionToken(token)).is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  const event = intent?.simulado_events as Record<string, string> | null;
  const identityEmail = (student?.email || extendedIdentity?.email || "").toLowerCase();
  if (!intent || !event || intent.email.toLowerCase() !== identityEmail) return NextResponse.json({ ok: false, message: "Não foi possível validar o ingresso para esta conta." }, { status: 403 });
  const status = effectiveEventStatus(event as { status: string; starts_at: string; ends_at: string; started_at?: string | null });
  if (status === "closed" || status === "archived") return NextResponse.json({ ok: false, message: "Este Evento já foi encerrado." }, { status: 409 });

  // Só depois de validar posse do e-mail (linha acima) e do Evento aceitar
  // participação é que a condição de aluno é concedida — nunca antes.
  if (!student && extendedIdentity) {
    const ensured = await ensureStudentRecordForExistingIdentity(supabase, {
      userId: extendedIdentity.userId,
      email: extendedIdentity.email,
      fullName: extendedIdentity.fullName,
      eventId: intent.event_id,
    });
    if (!ensured.ok) return NextResponse.json({ ok: false, message: "Não foi possível confirmar sua participação." }, { status: 500 });
    if (!ensured.alreadyExisted) {
      void logSecurityEvent({
        event: "student_identity_extended",
        actorType: "professor",
        actorId: extendedIdentity.userId,
        request,
        severity: "info",
        metadata: { event_id: intent.event_id },
      });
    }
    student = { id: extendedIdentity.userId, email: extendedIdentity.email, name: extendedIdentity.fullName, status: "active" };
  }
  if (!student) return NextResponse.json({ ok: false, message: "Autentique-se para confirmar a participação." }, { status: 401 });

  const { data: participant, error } = await supabase.from("simulado_event_participants").upsert({ event_id: intent.event_id, student_id: student.id, source: "public_link" }, { onConflict: "event_id,student_id", ignoreDuplicates: true }).select("id,event_id").maybeSingle();
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível confirmar sua participação." }, { status: 500 });
  await supabase.from("simulado_event_join_intents").update({ consumed_at: new Date().toISOString() }).eq("id", intent.id);
  const response = NextResponse.json({ ok: true, message: "Participação confirmada.", participant, event_id: intent.event_id });
  response.cookies.delete("estudotop_event_intent");
  return response;
}
