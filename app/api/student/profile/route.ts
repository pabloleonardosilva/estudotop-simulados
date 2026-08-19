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

function interestId(prefix: "catalog" | "custom", name: string) {
  return `${prefix}:${encodeURIComponent(name)}`;
}

function decodeInterestId(id: string, prefix: "catalog" | "custom") {
  try {
    return decodeURIComponent(id.slice(prefix.length + 1));
  } catch {
    return null;
  }
}

function normalizeInterestName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

async function getQuestionInterestCatalog(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const names = new Map<string, string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("questions")
      .select("orgao")
      .not("orgao", "is", null)
      .range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    for (const row of data || []) {
      const name = normalizeInterestName(row.orgao || "");
      if (name) names.set(name.toLocaleLowerCase("pt-BR"), name);
    }
    if ((data || []).length < pageSize) break;
  }

  return {
    data: [...names.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })),
    error: null,
  };
}

export async function GET(request: Request) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const [studentResult, profileResult, catalogResult, attemptsResult, jornadasResult] = await Promise.all([
    supabase.from("students").select("name,email,phone,cpf,avatar_url,desired_contests,last_login_at,created_at").eq("id", student.id).single(),
    supabase.from("profiles").select("avatar_url").eq("id", student.id).single(),
    getQuestionInterestCatalog(supabase),
    supabase.from("simulado_attempts").select("simulado_id,answered_count,status,counts_toward_limit").eq("student_id", student.id),
    supabase.from("student_jornadas").select("status,expires_at").eq("student_id", student.id).neq("status", "cancelled"),
  ]);

  if (studentResult.error || !studentResult.data) {
    void logSystemError({ source: "api.student.profile.load", error: studentResult.error, request });
    return NextResponse.json({ ok: false, message: "Não foi possível carregar seu perfil." }, { status: 500 });
  }

  if (profileResult.error) {
    void logSystemError({ source: "api.student.profile.avatar_fallback", error: profileResult.error, request });
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
  const catalogNames = catalogResult.error ? [] : catalogResult.data || [];
  const savedNames = splitSavedInterests(studentResult.data.desired_contests);
  const catalogKeys = new Set(catalogNames.map((name) => name.toLocaleLowerCase("pt-BR")));
  const catalog = catalogNames.map((name) => ({ id: interestId("catalog", name), name }));
  const customInterests = savedNames
    .filter((name) => !catalogKeys.has(name.toLocaleLowerCase("pt-BR")))
    .map((name) => ({ id: interestId("custom", name), name }));
  const catalogByKey = new Map(catalogNames.map((name) => [name.toLocaleLowerCase("pt-BR"), name]));
  const selectedContestIds = savedNames.map((name) => {
    const catalogName = catalogByKey.get(name.toLocaleLowerCase("pt-BR"));
    return interestId(catalogName ? "catalog" : "custom", catalogName || name);
  });

  return NextResponse.json({
    ok: true,
    profile: { ...studentResult.data, avatar_url: profileResult.data?.avatar_url || studentResult.data.avatar_url || null },
    interests: { saved_names: savedNames, selected_contest_ids: selectedContestIds, catalog: [...customInterests, ...catalog] },
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
    if (uniqueIds.some((id) => !id.startsWith("catalog:") && !id.startsWith("custom:"))) {
      return NextResponse.json({ ok: false, message: "Um dos interesses selecionados é inválido." }, { status: 400 });
    }
    const catalogResult = await getQuestionInterestCatalog(supabase);
    if (catalogResult.error) return NextResponse.json({ ok: false, message: "Não foi possível validar seus interesses." }, { status: 500 });
    const availableNames = new Map((catalogResult.data || []).map((name) => [name.toLocaleLowerCase("pt-BR"), name]));
    const names: string[] = [];
    for (const id of uniqueIds) {
      const prefix = id.startsWith("catalog:") ? "catalog" : "custom";
      const decoded = decodeInterestId(id, prefix);
      const name = decoded ? normalizeInterestName(decoded) : "";
      if (name.length < 2 || name.length > 100 || /[,;\n\r]/.test(name)) {
        return NextResponse.json({ ok: false, message: "Um dos interesses selecionados é inválido." }, { status: 400 });
      }
      if (prefix === "catalog") {
        const catalogName = availableNames.get(name.toLocaleLowerCase("pt-BR"));
        if (!catalogName) return NextResponse.json({ ok: false, message: "Um dos interesses selecionados não está disponível." }, { status: 400 });
        names.push(catalogName);
      } else {
        names.push(name);
      }
    }
    const uniqueNames = [...new Map(names.map((name) => [name.toLocaleLowerCase("pt-BR"), name])).values()];
    updates.desired_contests = uniqueNames.join(", ") || null;
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
