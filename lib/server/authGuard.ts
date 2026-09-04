import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { createSupabaseBrowserServerClient } from "@/lib/supabase/server";
import { logSecurityEvent } from "@/app/lib/server/auditLogger";

export type AuthAdmin = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type AuthProfessor = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type AuthenticatedStudentPage = {
  id: string;
  email: string | null;
  name: string | null;
  status: string | null;
};

export async function requireAdmin(request: Request): Promise<AuthAdmin | NextResponse> {
  const authHeader =
    request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    void logSecurityEvent({ event: "auth.unauthorized", actorType: "admin", request, metadata: { reason: "missing_token" } });
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    void logSecurityEvent({ event: "auth.unauthorized", actorType: "admin", request, metadata: { reason: "invalid_token" } });
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin" || !profile.is_active) {
    void logSecurityEvent({
      event: "admin.forbidden",
      actorType: "admin",
      actorId: userData.user.id,
      actorEmail: userData.user.email,
      request,
      metadata: { reason: !profile ? "profile_missing" : profile.role !== "admin" ? "wrong_role" : "inactive" },
    });
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }

  return {
    id: profile.id as string,
    full_name: profile.full_name as string | null,
    email: userData.user.email ?? null,
  };
}

export async function requireProfessor(request: Request): Promise<AuthProfessor | NextResponse> {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data: userData } = await supabase.auth.getUser(token);
  if (!userData.user) return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 401 });

  const [{ data: profile }, { data: professor }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, is_active").eq("id", userData.user.id).maybeSingle(),
    supabase.from("professors").select("id, email, status").eq("id", userData.user.id).maybeSingle(),
  ]);
  if (!profile || profile.role !== "professor" || !profile.is_active || professor?.status !== "active") {
    return NextResponse.json({ ok: false, message: "Acesso negado." }, { status: 403 });
  }
  return { id: profile.id, full_name: profile.full_name, email: professor.email || userData.user.email || null };
}

export async function requireEventManager(request: Request, eventId: string) {
  const admin = await requireAdmin(request);
  if (!(admin instanceof NextResponse)) return { actor: admin, role: "admin" as const };
  if (admin.status !== 403) return admin;

  const professor = await requireProfessor(request);
  if (professor instanceof NextResponse) return professor;
  const supabase = createSupabaseAdminClient();
  const { data: assignment } = await supabase
    .from("simulado_event_professors")
    .select("id")
    .eq("event_id", eventId)
    .eq("professor_id", professor.id)
    .maybeSingle();
  if (!assignment) return NextResponse.json({ ok: false, message: "Acesso negado a este Evento." }, { status: 403 });
  return { actor: professor, role: "professor" as const };
}

export async function requireStudentPage(): Promise<AuthenticatedStudentPage> {
  const browserSupabase = await createSupabaseBrowserServerClient();
  const {
    data: { user },
  } = await browserSupabase.auth.getUser();

  if (!user) {
    void logSecurityEvent({ event: "auth.unauthorized", actorType: "student", metadata: { source: "requireStudentPage" } });
    redirect("/login");
  }

  const supabase = createSupabaseAdminClient();
  const { data: studentRow } = await supabase
    .from("students")
    .select("id, email, name, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!studentRow || studentRow.status === "blocked" || studentRow.status === "inactive") {
    void logSecurityEvent({
      event: studentRow?.status === "blocked" ? "student.blocked_access" : "student.forbidden",
      actorType: "student",
      actorId: user.id,
      actorEmail: user.email,
      metadata: { source: "requireStudentPage" },
    });
    redirect("/login");
  }

  return {
    id: studentRow.id,
    email: studentRow.email ?? user.email ?? null,
    name: studentRow.name ?? null,
    status: studentRow.status ?? null,
  };
}

export async function requireAdminPage(): Promise<void> {
  const browserSupabase = await createSupabaseBrowserServerClient();
  const {
    data: { user },
  } = await browserSupabase.auth.getUser();

  if (!user) {
    void logSecurityEvent({ event: "auth.unauthorized", actorType: "admin", metadata: { source: "requireAdminPage" } });
    redirect("/login");
  }

  const supabase = createSupabaseAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin" || !profile.is_active) {
    void logSecurityEvent({
      event: "admin.forbidden",
      actorType: "admin",
      actorId: user.id,
      actorEmail: user.email,
      metadata: { source: "requireAdminPage" },
    });
    redirect("/login");
  }
}

export async function requireProfessorPage(): Promise<{ id: string }> {
  const browserSupabase = await createSupabaseBrowserServerClient();
  const { data: { user } } = await browserSupabase.auth.getUser();
  if (!user) redirect("/login");
  const supabase = createSupabaseAdminClient();
  const [{ data: profile }, { data: professor }] = await Promise.all([
    supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle(),
    supabase.from("professors").select("status").eq("id", user.id).maybeSingle(),
  ]);
  if (!profile || profile.role !== "professor" || !profile.is_active || professor?.status !== "active") redirect("/login");
  return { id: user.id };
}

// Guard de página para o painel operacional do Evento (mesma dashboard usada
// por /professor/eventos/[id] e sua preview): Admin acompanha qualquer
// Evento sem precisar estar em simulado_event_professors; professor só entra
// se estiver atribuído a ESTE Evento. Espelha requireEventManager (rotas de
// API), que os dados desta página já consultam com o próprio token da
// sessão — nenhuma dashboard nova é criada, só a permissão de acesso à rota.
export async function requireEventManagerPage(eventId: string): Promise<{ id: string; role: "admin" | "professor" }> {
  const browserSupabase = await createSupabaseBrowserServerClient();
  const { data: { user } } = await browserSupabase.auth.getUser();
  if (!user) redirect("/login");
  const supabase = createSupabaseAdminClient();
  const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (profile?.role === "admin" && profile.is_active) return { id: user.id, role: "admin" };

  const { data: professor } = await supabase.from("professors").select("status").eq("id", user.id).maybeSingle();
  if (!profile || profile.role !== "professor" || !profile.is_active || professor?.status !== "active") redirect("/login");
  const { data: assignment } = await supabase.from("simulado_event_professors").select("id").eq("event_id", eventId).eq("professor_id", user.id).maybeSingle();
  if (!assignment) redirect("/login");
  return { id: user.id, role: "professor" };
}
