import { after, NextResponse } from "next/server";
import { Resend } from "resend";
import { requireAdmin } from "@/lib/server/authGuard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { studentWelcomePlainText, studentWelcomeTemplate } from "@/app/lib/email/studentWelcomeTemplate";
import { getPublicAppUrl } from "@/lib/server/publicAppUrl";
import { findAuthUserByEmail } from "@/lib/server/studentAccountRepair";
import { logSystemError } from "@/app/lib/server/auditLogger";

export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("professors").select("*,simulado_event_professors(event_id,simulado_events:event_id(id,name,status))").order("name");
  if (error) return NextResponse.json({ ok: false, message: "Não foi possível carregar os professores." }, { status: 500 });
  return NextResponse.json({ ok: true, message: "Professores carregados.", professors: data || [] });
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const body = await request.json().catch(() => null) as { name?: unknown; email?: unknown; phone?: unknown; status?: unknown; event_ids?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;
  const status = body?.status === "inactive" ? "inactive" : "active";
  if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, message: "Informe nome e e-mail válidos." }, { status: 400 });
  if (body?.event_ids !== undefined && !Array.isArray(body.event_ids)) return NextResponse.json({ ok: false, message: "Seleção de Eventos inválida." }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const eventIds = Array.isArray(body?.event_ids) ? [...new Set(body.event_ids.filter((id): id is string => typeof id === "string"))] : [];
  if (eventIds.length) {
    const { data: validEvents, error: eventsError } = await supabase.from("simulado_events").select("id").in("id", eventIds);
    if (eventsError || (validEvents || []).length !== eventIds.length) return NextResponse.json({ ok: false, message: "Um ou mais Eventos selecionados são inválidos." }, { status: 400 });
  }

  const [{ data: professorByEmail }, { data: studentByEmail }, existingAuth] = await Promise.all([
    supabase.from("professors").select("id").ilike("email", email).maybeSingle(),
    supabase.from("students").select("id").ilike("email", email).maybeSingle(),
    findAuthUserByEmail(supabase, email),
  ]);
  if (studentByEmail) return NextResponse.json({ ok: false, message: "Este e-mail já pertence a um aluno." }, { status: 409 });

  const temporaryPassword = generateTemporaryPassword();
  let authUser = existingAuth;
  let createdAuth = false;
  if (existingAuth) {
    const [{ data: profile }, { data: professor }] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", existingAuth.id).maybeSingle(),
      supabase.from("professors").select("id").eq("id", existingAuth.id).maybeSingle(),
    ]);
    const pending = existingAuth.user_metadata?.professor_creation_pending === true;
    if ((profile && profile.role !== "professor") || (professor && !pending) || (professorByEmail && professorByEmail.id !== existingAuth.id)) return NextResponse.json({ ok: false, message: "Este e-mail já possui uma conta." }, { status: 409 });
    const { error } = await supabase.auth.admin.updateUserById(existingAuth.id, { password: temporaryPassword, email_confirm: true, user_metadata: { ...(existingAuth.user_metadata || {}), full_name: name, professor_creation_pending: true } });
    if (error) return NextResponse.json({ ok: false, message: "Não foi possível recuperar o cadastro incompleto do professor." }, { status: 500 });
  } else {
    if (professorByEmail) return NextResponse.json({ ok: false, message: "Este e-mail já possui uma conta de professor." }, { status: 409 });
    const { data, error } = await supabase.auth.admin.createUser({ email, password: temporaryPassword, email_confirm: true, user_metadata: { full_name: name, professor_creation_pending: true } });
    if (error || !data.user) return NextResponse.json({ ok: false, message: "Não foi possível criar a identidade do professor." }, { status: 500 });
    authUser = data.user;
    createdAuth = true;
  }
  if (!authUser) return NextResponse.json({ ok: false, message: "Não foi possível preparar a identidade do professor." }, { status: 500 });
  const userId = authUser.id;

  const compensate = async (reason: unknown) => {
    const failures: string[] = [];
    const assignments = await supabase.from("simulado_event_professors").delete().eq("professor_id", userId); if (assignments.error) failures.push(`assignments: ${assignments.error.message}`);
    const professor = await supabase.from("professors").delete().eq("id", userId); if (professor.error) failures.push(`professor: ${professor.error.message}`);
    const profile = await supabase.from("profiles").delete().eq("id", userId); if (profile.error) failures.push(`profile: ${profile.error.message}`);
    if (createdAuth) { const auth = await supabase.auth.admin.deleteUser(userId); if (auth.error) failures.push(`auth: ${auth.error.message}`); }
    void logSystemError({ source: "api.admin.professors.create", error: reason, request, severity: failures.length ? "critical" : "error", metadata: { professor_id: userId, compensation_failures: failures } });
    return failures;
  };
  const failureResponse = async (error: unknown) => {
    const failures = await compensate(error);
    return NextResponse.json({ ok: false, message: failures.length ? "Cadastro interrompido e a compensação exige verificação administrativa." : "Não foi possível concluir o cadastro; nenhuma conta utilizável foi mantida." }, { status: 500 });
  };

  const { data: currentProfile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (currentProfile?.role && currentProfile.role !== "professor") return failureResponse(new Error("Perfil existente possui outro papel."));
  const profileResult = currentProfile
    ? await supabase.from("profiles").update({ full_name: name, is_active: false, must_change_password: true }).eq("id", userId)
    : await supabase.from("profiles").insert({ id: userId, full_name: name, role: "professor", is_active: false, must_change_password: true });
  if (profileResult.error) return failureResponse(profileResult.error);

  const professorResult = await supabase.from("professors").upsert({ id: userId, name, email, phone, status }, { onConflict: "id" });
  if (professorResult.error) return failureResponse(professorResult.error);
  if (eventIds.length) {
    const assignments = await supabase.from("simulado_event_professors").insert(eventIds.map((eventId) => ({ event_id: eventId, professor_id: userId })));
    if (assignments.error) return failureResponse(assignments.error);
  }
  const activation = await supabase.from("profiles").update({ is_active: status === "active" }).eq("id", userId);
  if (activation.error) return failureResponse(activation.error);
  const metadataUpdate = await supabase.auth.admin.updateUserById(userId, { user_metadata: { ...(authUser.user_metadata || {}), full_name: name, professor_creation_pending: false } });
  if (metadataUpdate.error) void logSystemError({ source: "api.admin.professors.metadata", error: metadataUpdate.error, request, metadata: { professor_id: userId } });

  after(async () => {
    if (!process.env.RESEND_API_KEY) return;
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: "EstudoTOP <estudotop@estudotop.com.br>", replyTo: "estudotop@estudotop.com.br", to: email, subject: "Seu acesso de professor ao EstudoTOP", html: studentWelcomeTemplate({ studentName: name, studentEmail: email, temporaryPassword, loginUrl: `${getPublicAppUrl()}/login` }), text: studentWelcomePlainText(name, email, temporaryPassword, `${getPublicAppUrl()}/login`) });
  });
  return NextResponse.json({ ok: true, message: "Professor cadastrado. O acesso inicial foi enviado por e-mail.", professor_id: userId }, { status: 201 });
}
