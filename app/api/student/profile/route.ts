import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import { logSystemError } from "@/app/lib/server/auditLogger";

type ProfilePatch = {
  name?: unknown;
  phone?: unknown;
  contest_ids?: unknown;
};

function splitSavedInterests(value: string | null) {
  return (value || "").split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
}

function legacyInterestId(name: string) {
  return `legacy:${encodeURIComponent(name)}`;
}

function decodeLegacyInterestId(id: string) {
  try {
    return decodeURIComponent(id.slice(7));
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const [studentResult, profileResult, contestsResult, attemptsResult, jornadasResult] = await Promise.all([
    supabase.from("students").select("name,email,phone,cpf,desired_contests,last_login_at,created_at").eq("id", student.id).single(),
    supabase.from("profiles").select("avatar_url").eq("id", student.id).single(),
    supabase.from("exam_contests").select("id,name").eq("is_active", true).order("name"),
    supabase.from("simulado_attempts").select("simulado_id,answered_count,status,counts_toward_limit").eq("student_id", student.id),
    supabase.from("student_jornadas").select("status,expires_at").eq("student_id", student.id).neq("status", "cancelled"),
  ]);

  if (studentResult.error || !studentResult.data || profileResult.error) {
    void logSystemError({ source: "api.student.profile.load", error: studentResult.error || profileResult.error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seu perfil." }, { status: 500 });
  }

  const attempts = attemptsResult.error ? null : attemptsResult.data || [];
  const jornadas = jornadasResult.error ? null : jornadasResult.data || [];
  const completedSimulados = attempts
    ? new Set(attempts.filter((attempt) => attempt.status === "completed" && attempt.counts_toward_limit).map((attempt) => attempt.simulado_id)).size
    : null;
  const answeredQuestions = attempts
    ? attempts.reduce((total, attempt) => total + Number(attempt.answered_count || 0), 0)
    : null;
  const today = new Date().toISOString().slice(0, 10);
  const completedJornadas = jornadas
    ? jornadas.filter((jornada) => jornada.status === "completed" || (jornada.expires_at && jornada.expires_at < today)).length
    : null;
  const activeJornadas = jornadas
    ? jornadas.filter((jornada) => jornada.status === "active" && (!jornada.expires_at || jornada.expires_at >= today)).length
    : null;
  const contests = contestsResult.error ? [] : contestsResult.data || [];
  const savedNames = splitSavedInterests(studentResult.data.desired_contests);
  const activeNames = new Set(contests.map((contest) => contest.name.toLocaleLowerCase("pt-BR")));
  const legacyInterests = savedNames
    .filter((name) => !activeNames.has(name.toLocaleLowerCase("pt-BR")))
    .map((name) => ({ id: legacyInterestId(name), name }));
  const selectedContestIds = [
    ...contests.filter((contest) => savedNames.some((name) => name.localeCompare(contest.name, "pt-BR", { sensitivity: "base" }) === 0)).map((contest) => contest.id),
    ...legacyInterests.map((interest) => interest.id),
  ];

  return NextResponse.json({
    ok: true,
    profile: { ...studentResult.data, avatar_url: profileResult.data?.avatar_url || null },
    interests: { saved_names: savedNames, selected_contest_ids: selectedContestIds, catalog: [...legacyInterests, ...contests] },
    trajectory: { completed_simulados: completedSimulados, answered_questions: answeredQuestions },
    journeys: { active: activeJornadas, completed: completedJornadas },
  });
}

export async function PATCH(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  let body: ProfilePatch;
  try {
    body = await request.json() as ProfilePatch;
  } catch {
    return NextResponse.json({ ok: false, message: "Dados inválidos." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const updates: { name?: string; phone?: string | null; desired_contests?: string | null } = {};

  if (body.name !== undefined || body.phone !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (name.length < 3 || name.length > 120) return NextResponse.json({ ok: false, message: "Informe um nome válido." }, { status: 400 });
    if (phone && (!/^[\d()+\-\s.]{10,25}$/.test(phone) || phone.replace(/\D/g, "").length < 10)) {
      return NextResponse.json({ ok: false, message: "Informe um telefone válido." }, { status: 400 });
    }
    updates.name = name;
    updates.phone = phone || null;
  }

  if (body.contest_ids !== undefined) {
    if (!Array.isArray(body.contest_ids) || body.contest_ids.some((id) => typeof id !== "string") || body.contest_ids.length > 30) {
      return NextResponse.json({ ok: false, message: "Seleção de interesses inválida." }, { status: 400 });
    }
    const uniqueIds = [...new Set(body.contest_ids as string[])];
    const activeIds = uniqueIds.filter((id) => !id.startsWith("legacy:"));
    const decodedLegacyNames = uniqueIds.filter((id) => id.startsWith("legacy:")).map(decodeLegacyInterestId);
    if (decodedLegacyNames.some((name) => name === null)) return NextResponse.json({ ok: false, message: "Um dos interesses históricos é inválido." }, { status: 400 });
    const requestedLegacyNames = decodedLegacyNames.filter((name): name is string => name !== null);
    const { data: currentStudent, error: currentStudentError } = await supabase.from("students").select("desired_contests").eq("id", student.id).single();
    if (currentStudentError || !currentStudent) return NextResponse.json({ ok: false, message: "Não foi possível validar seus interesses." }, { status: 500 });
    const currentSavedNames = splitSavedInterests(currentStudent.desired_contests);
    const { data: allActiveContests, error: catalogError } = await supabase.from("exam_contests").select("id,name").eq("is_active", true);
    if (catalogError) return NextResponse.json({ ok: false, message: "Não foi possível validar seus interesses." }, { status: 500 });
    const activeCatalogNames = new Set((allActiveContests || []).map((contest) => contest.name.toLocaleLowerCase("pt-BR")));
    const validLegacyNames = currentSavedNames.filter((name) => !activeCatalogNames.has(name.toLocaleLowerCase("pt-BR")));
    if (requestedLegacyNames.some((name) => !validLegacyNames.includes(name))) {
      return NextResponse.json({ ok: false, message: "Um dos interesses históricos é inválido." }, { status: 400 });
    }
    const { data: contests, error } = activeIds.length
      ? await supabase.from("exam_contests").select("id,name").eq("is_active", true).in("id", activeIds).order("name")
      : { data: [], error: null };
    if (error || (contests || []).length !== activeIds.length) return NextResponse.json({ ok: false, message: "Um dos interesses selecionados não está disponível." }, { status: 400 });
    updates.desired_contests = [...requestedLegacyNames, ...(contests || []).map((contest) => contest.name)].join(", ") || null;
  }

  if (!Object.keys(updates).length) return NextResponse.json({ ok: false, message: "Nenhuma alteração válida foi informada." }, { status: 400 });

  let previousFullName: string | null = null;
  if (updates.name) {
    const { data: currentProfile, error: profileLoadError } = await supabase.from("profiles").select("full_name").eq("id", student.id).single();
    if (profileLoadError || !currentProfile) return NextResponse.json({ ok: false, message: "Não foi possível salvar suas alterações." }, { status: 500 });
    previousFullName = currentProfile.full_name;
    const { error: profileError } = await supabase.from("profiles").update({ full_name: updates.name }).eq("id", student.id);
    if (profileError) return NextResponse.json({ ok: false, message: "Não foi possível salvar suas alterações." }, { status: 500 });
  }

  const { error } = await supabase.from("students").update(updates).eq("id", student.id);
  if (error) {
    if (updates.name) await supabase.from("profiles").update({ full_name: previousFullName }).eq("id", student.id);
    void logSystemError({ source: "api.student.profile.update", error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível salvar suas alterações." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Dados atualizados com sucesso.", profile: updates });
}
