import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { addHours, generateSecureToken, hashEmailActionToken } from "@/lib/security/registrationTokens";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";
import { logSecurityEvent } from "@/app/lib/server/auditLogger";

const COOKIE = "estudotop_event_intent";
const FIRST_ACCESS_EXPIRATION_HOURS = 72;
const RECOVERY_FALLBACK_MESSAGE = "Não foi possível retomar seu cadastro automaticamente. Solicite a redefinição de senha.";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    void logSecurityEvent({ event: "event_join_confirmation_rejected", actorType: "system", severity: "warning", metadata: { reason: "malformed", slug } });
    return NextResponse.json({ ok: false, message: "Link de confirmação inválido ou expirado." }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();
  const { data: intent } = await supabase.from("simulado_event_join_intents").select("id,email,event_id,expires_at,consumed_at,simulado_events:event_id(id,public_slug,status,starts_at,ends_at,started_at,simulado_id)").eq("token_hash", hashEmailActionToken(token)).maybeSingle();
  const event = intent?.simulado_events as unknown as { id: string; public_slug: string; status: string; starts_at: string; ends_at: string; started_at: string | null; simulado_id: string | null } | null;
  const rejectionReason = !intent
    ? "not_found"
    : intent.consumed_at
      ? "consumed"
      : new Date(intent.expires_at).getTime() <= Date.now()
        ? "expired"
        : !event
          ? "event_missing"
          : event.public_slug !== slug
            ? "slug_mismatch"
            : null;
  if (rejectionReason) {
    void logSecurityEvent({ event: "event_join_confirmation_rejected", actorType: "system", severity: "warning", resourceType: "simulado_event_join_intents", resourceId: intent?.id, metadata: { reason: rejectionReason, event_id: intent?.event_id, slug } });
    return NextResponse.json({ ok: false, message: "Link de confirmação inválido ou expirado." }, { status: 400 });
  }
  if (!intent || !event) return NextResponse.json({ ok: false, message: "Link de confirmação inválido ou expirado." }, { status: 400 });
  const status = effectiveEventStatus(event);
  if (status === "closed" || status === "archived") return NextResponse.json({ ok: false, message: "Este Evento não aceita novas participações." }, { status: 409 });

  // O token deste link já comprova posse de intent.email (hash comparado,
  // uso único, expiração). "Existe em students" sozinho NÃO prova que a
  // conta está pronta para /login — só profiles.must_change_password=false
  // prova isso (só vira false depois que o aluno efetivamente define a
  // própria senha em POST /api/auth/first-access).
  const { data: student } = await supabase.from("students").select("id,name,email").eq("email", intent.email).maybeSingle();

  let next = `/cadastro?event=${encodeURIComponent(slug)}&email=${encodeURIComponent(intent.email)}`;
  let message = "E-mail confirmado. Continue seu cadastro.";

  if (student) {
    const { data: profile } = await supabase.from("profiles").select("role,must_change_password").eq("id", student.id).maybeSingle();

    if (profile?.role === "student" && profile.must_change_password === false) {
      // CASO B: conta efetivamente concluída — senha própria já definida.
      next = `/login?event=${encodeURIComponent(slug)}`;
      message = "Já existe uma conta EstudoTOP para este e-mail.";
    } else if (profile?.role === "student" && profile.must_change_password === true) {
      // CASO C: conta existe, mas o aluno nunca concluiu a definição da
      // própria senha (ex.: abandonou depois do código, antes de "Crie sua
      // senha"). O link do Evento que acabou de ser validado já é prova
      // suficiente de posse deste mesmo e-mail — retomamos direto a
      // definição de senha com um NOVO first_access. Nunca reaproveita o
      // token bruto anterior (só o hash é persistido); o anterior é
      // invalidado pelo mesmo padrão já usado por sendFirstAccessEmail e
      // pelo cadastro por Evento.
      const { error: invalidateError } = await supabase
        .from("student_registration_confirmations")
        .update({ used_at: new Date().toISOString() })
        .eq("user_id", student.id)
        .eq("purpose", "first_access")
        .is("used_at", null);

      if (invalidateError) {
        // CASO D: não é seguro emitir um novo first_access sem garantir que
        // o anterior foi invalidado — cai no fallback de recuperação.
        next = `/esqueci-senha?email=${encodeURIComponent(intent.email)}`;
        message = RECOVERY_FALLBACK_MESSAGE;
      } else {
        const newToken = generateSecureToken();
        const { error: insertError } = await supabase.from("student_registration_confirmations").insert({
          purpose: "first_access",
          user_id: student.id,
          full_name: student.name,
          email: student.email,
          token_hash: hashEmailActionToken(newToken),
          expires_at: addHours(FIRST_ACCESS_EXPIRATION_HOURS),
          metadata: { source: "event_join_resume", event_id: intent.event_id },
        });

        if (insertError) {
          // CASO D: emissão do novo first_access falhou.
          next = `/esqueci-senha?email=${encodeURIComponent(intent.email)}`;
          message = RECOVERY_FALLBACK_MESSAGE;
        } else {
          next = `/primeiro-acesso?token=${encodeURIComponent(newToken)}`;
          message = "Conta encontrada. Finalize a definição da sua senha para continuar.";
        }
      }
    } else {
      // CASO D: students existe mas o profile de aluno não pôde ser
      // determinado com segurança (inconsistência) — fallback de recuperação.
      next = `/esqueci-senha?email=${encodeURIComponent(intent.email)}`;
      message = RECOVERY_FALLBACK_MESSAGE;
    }
  }

  const response = NextResponse.json({ ok: true, message, account_exists: Boolean(student), next, email: intent.email });
  response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 86400 });
  return response;
}
