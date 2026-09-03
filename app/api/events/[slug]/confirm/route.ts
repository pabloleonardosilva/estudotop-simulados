import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { hashEmailActionToken } from "@/lib/security/registrationTokens";
import { effectiveEventStatus } from "@/lib/server/simuladoEvents";

const COOKIE = "estudotop_event_intent";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ ok: false, message: "Link de confirmação inválido ou expirado." }, { status: 400 });
  const supabase = createSupabaseAdminClient();
  const { data: intent } = await supabase.from("simulado_event_join_intents").select("id,email,event_id,simulado_events:event_id(id,public_slug,status,starts_at,ends_at,started_at,simulado_id)").eq("token_hash", hashEmailActionToken(token)).is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  const event = intent?.simulado_events as unknown as { id: string; public_slug: string; status: string; starts_at: string; ends_at: string; started_at: string | null; simulado_id: string | null } | null;
  if (!intent || !event || event.public_slug !== slug) return NextResponse.json({ ok: false, message: "Link de confirmação inválido ou expirado." }, { status: 400 });
  const status = effectiveEventStatus(event);
  if (status === "closed" || status === "archived") return NextResponse.json({ ok: false, message: "Este Evento não aceita novas participações." }, { status: 409 });
  const { data: student } = await supabase.from("students").select("id").eq("email", intent.email).maybeSingle();
  const next = student ? `/login?event=${encodeURIComponent(slug)}` : `/cadastro?event=${encodeURIComponent(slug)}&email=${encodeURIComponent(intent.email)}`;
  const response = NextResponse.json({ ok: true, message: student ? "Já existe uma conta EstudoTOP para este e-mail." : "E-mail confirmado. Continue seu cadastro.", account_exists: Boolean(student), next, email: intent.email });
  response.cookies.set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 86400 });
  return response;
}
