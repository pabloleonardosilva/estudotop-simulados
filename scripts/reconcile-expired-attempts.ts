// Script administrativo ONE-SHOT — Sprint "Reconciliação controlada de
// attempts históricas expiradas" (2026-09-10). NÃO é rota HTTP, NÃO é cron,
// NÃO fica registrado em vercel.json. Executa localmente contra o Supabase
// remoto (mesmas credenciais de .env.local), chamando SEMPRE a mesma engine
// canônica de conclusão (lib/server/simuladoAttemptCompletion.ts) — nunca
// UPDATE manual de status, nunca INSERT manual de simulado_results, nunca
// resposta fictícia.
//
// Uso:
//   npx tsx scripts/reconcile-expired-attempts.ts
//     → modo dry-run (padrão, somente leitura): reconsulta as tentativas
//       vencidas, recalcula o resultado esperado via lib/simuladoScoring.ts
//       (sem gravar nada) e imprime um relatório de elegibilidade.
//
//   npx tsx scripts/reconcile-expired-attempts.ts --execute --ids=<id1>,<id2>,...
//     → modo execução: processa SOMENTE os attempt_id explicitamente
//       listados (whitelist obrigatória — nunca reprocessa toda a tabela),
//       um de cada vez, na ordem em que aparecem na lista, revalidando o
//       estado da tentativa imediatamente antes de cada chamada.
//
// origin: "historical_reconciliation" (ver lib/server/simuladoAttemptCompletion.ts)
// distingue esta execução administrativa de um submit real do aluno no log
// de auditoria — nunca finge que o aluno clicou "Finalizar" hoje.

import { readFileSync } from "node:fs";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { completeSimuladoAttempt } from "@/lib/server/simuladoAttemptCompletion";
import { computeSimuladoAttemptResult, type AnswerForScoring, type SimuladoQuestionForScoring } from "@/lib/simuladoScoring";

// ─── Carrega .env.local manualmente (script roda fora do Next.js, que faz
// isso automaticamente em dev/build) ────────────────────────────────────
function loadEnvLocal() {
  const content = readFileSync(".env.local", "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const EXECUTE = process.argv.includes("--execute");
const idsArg = process.argv.find((a) => a.startsWith("--ids="));
const whitelist = idsArg ? idsArg.slice("--ids=".length).split(",").map((s) => s.trim()).filter(Boolean) : [];

type SimuladoQuestionRow = {
  id: string;
  question_id: string;
  order_number: number;
  points: number;
  status: string;
  questions: {
    id: string;
    correct_alternative_label: string | null;
    question_alternatives: { id: string; label: string; is_correct: boolean }[];
  } | null;
};

type AnswerRow = {
  simulado_question_id: string;
  selected_alternative_id: string | null;
  selected_alternative_label: string | null;
  is_correct: boolean | null;
};

type CandidateRow = {
  id: string;
  student_id: string;
  simulado_id: string;
  event_id: string | null;
  event_participant_id: string | null;
  student_jornada_simulado_id: string | null;
  attempt_context: string;
  status: string;
  expires_at: string;
  updated_at: string;
  counts_toward_limit: boolean;
  total_questions: number;
  started_at: string;
  settings_snapshot: unknown;
};

async function main() {
  const supabase = createSupabaseAdminClient();

  // ─── Reconsulta as tentativas vencidas — não confia no inventário
  // anterior. Mesmos critérios já usados na auditoria/cron (status,
  // expires_at, preview/professor_preview), SEM o marco de ativação do
  // cron normal (esta é a rotina administrativa explícita para o
  // backlog — o cron continua ignorando essas linhas). Ordenação
  // determinística: expires_at asc, id asc. ──────────────────────────────
  const { data: candidates, error } = await supabase
    .from("simulado_attempts")
    .select(
      "id,student_id,simulado_id,event_id,event_participant_id,student_jornada_simulado_id,attempt_context,status,expires_at,updated_at,counts_toward_limit,total_questions,started_at,settings_snapshot",
    )
    .eq("status", "in_progress")
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString())
    .eq("is_preview", false)
    .neq("attempt_context", "professor_preview")
    .order("expires_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(`Falha ao consultar candidatos: ${error.message}`);
  const rows = (candidates || []) as CandidateRow[];

  console.log(`\n=== ${rows.length} tentativa(s) vencida(s) encontrada(s) (revalidado agora) ===\n`);

  type ReportRow = {
    id: string;
    context: string;
    simulado_id: string;
    expires_at: string;
    counts_toward_limit: boolean;
    total_questions: number;
    answered: number | null;
    blank: number | null;
    annulled: number | null;
    correct: number | null;
    wrong: number | null;
    score: number | null;
    percentage: number | null;
    has_result: boolean;
    eligible: boolean;
    reason: string;
  };
  const report: ReportRow[] = [];

  for (const row of rows) {
    const base: ReportRow = {
      id: row.id,
      context: row.attempt_context,
      simulado_id: row.simulado_id,
      expires_at: row.expires_at,
      counts_toward_limit: row.counts_toward_limit,
      total_questions: row.total_questions,
      answered: null,
      blank: null,
      annulled: null,
      correct: null,
      wrong: null,
      score: null,
      percentage: null,
      has_result: false,
      eligible: true,
      reason: "",
    };

    const { data: existingResult } = await supabase.from("simulado_results").select("id").eq("attempt_id", row.id).maybeSingle();
    if (existingResult) {
      base.has_result = true;
      base.eligible = false;
      base.reason = "já possui simulado_result — nunca sobrescrever/duplicar";
      report.push(base);
      continue;
    }

    const { data: simuladoQuestions, error: sqError } = await supabase
      .from("simulado_questions")
      .select(
        "id,question_id,order_number,points,status,questions:question_id(id,correct_alternative_label,question_alternatives(id,label,is_correct))",
      )
      .eq("simulado_id", row.simulado_id);
    if (sqError || !simuladoQuestions || simuladoQuestions.length === 0) {
      base.eligible = false;
      base.reason = `questões do simulado não puderam ser carregadas (${sqError?.message || "vazio"})`;
      report.push(base);
      continue;
    }
    const questionRows = simuladoQuestions as unknown as SimuladoQuestionRow[];

    const { data: answersData, error: answersError } = await supabase
      .from("simulado_answers")
      .select("simulado_question_id, selected_alternative_id, selected_alternative_label, is_correct")
      .eq("attempt_id", row.id);
    if (answersError) {
      base.eligible = false;
      base.reason = `respostas não puderam ser carregadas (${answersError.message})`;
      report.push(base);
      continue;
    }
    const answers = (answersData || []) as AnswerRow[];
    const answersBySQ = new Map<string, AnswerRow>();
    for (const ans of answers) answersBySQ.set(ans.simulado_question_id, ans);

    // Contexto: para attempts de Evento, confirma que o participant existe e
    // corresponde ao student_id/event_id da própria attempt — nunca assume.
    if (row.attempt_context === "event") {
      if (!row.event_id || !row.event_participant_id) {
        base.eligible = false;
        base.reason = "contexto event sem event_id/event_participant_id";
        report.push(base);
        continue;
      }
      const { data: participant, error: participantError } = await supabase
        .from("simulado_event_participants")
        .select("id,event_id,student_id")
        .eq("id", row.event_participant_id)
        .maybeSingle();
      if (participantError || !participant || participant.event_id !== row.event_id || participant.student_id !== row.student_id) {
        base.eligible = false;
        base.reason = "participant do Evento inconsistente/ausente";
        report.push(base);
        continue;
      }
    } else if (row.attempt_context === "standalone") {
      // Elegibilidade estrutural (engine roda sem erro) confirmada
      // separadamente na auditoria textual — aqui só marca o contexto para
      // a decisão de produto tomada fora deste script (ver relatório).
      base.reason = "standalone legado — decisão de processar fica fora deste script (ver relatório)";
    }

    // Preview do scoring — MESMA função canônica (lib/simuladoScoring.ts),
    // mesma montagem de dados que o engine real usa — só não grava nada.
    const scoringQuestions: SimuladoQuestionForScoring[] = questionRows.map((q) => {
      const correctAlt = (q.questions?.question_alternatives || []).find((alt) => alt.is_correct);
      return {
        simuladoQuestionId: q.id,
        questionId: q.question_id,
        points: Number(q.points || 0),
        status: q.status,
        correctAlternativeId: correctAlt?.id || null,
        correctAlternativeLabel: q.questions?.correct_alternative_label || correctAlt?.label || null,
      };
    });
    const scoringAnswers = new Map<string, AnswerForScoring>();
    for (const [sqId, ans] of answersBySQ.entries()) {
      scoringAnswers.set(sqId, { selectedAlternativeId: ans.selected_alternative_id, selectedAlternativeLabel: ans.selected_alternative_label });
    }
    const settings = (row.settings_snapshot || {}) as { scoring_model?: "traditional" | "cebraspe" };
    const scoringModel = settings.scoring_model || "traditional";
    const graded = computeSimuladoAttemptResult(scoringQuestions, scoringAnswers, scoringModel);

    base.answered = answers.filter((a) => a.selected_alternative_id).length;
    base.blank = graded.blankCount;
    base.annulled = graded.annulledCount;
    base.correct = graded.correctCount;
    base.wrong = graded.wrongCount;
    base.score = graded.displayScore;
    base.percentage = graded.displayPercentage;
    report.push(base);
  }

  console.table(
    report.map((r) => ({
      attempt_id: r.id,
      context: r.context,
      expires_at: r.expires_at,
      answered: r.answered,
      blank: r.blank,
      annulled: r.annulled,
      correct: r.correct,
      wrong: r.wrong,
      score: r.score,
      pct: r.percentage,
      has_result: r.has_result,
      eligible: r.eligible,
      reason: r.reason,
    })),
  );

  const eligibleEvent = report.filter((r) => r.eligible && r.context === "event");
  const eligibleStandalone = report.filter((r) => r.eligible && r.context === "standalone");
  const skipped = report.filter((r) => !r.eligible);
  console.log(`\nElegíveis (event): ${eligibleEvent.length} — ${eligibleEvent.map((r) => r.id).join(", ") || "nenhuma"}`);
  console.log(`Elegíveis (standalone, estruturalmente — decisão de processar é separada): ${eligibleStandalone.length} — ${eligibleStandalone.map((r) => r.id).join(", ") || "nenhuma"}`);
  console.log(`Skipped: ${skipped.length}`);
  for (const s of skipped) console.log(`  - ${s.id}: ${s.reason}`);

  if (!EXECUTE) {
    console.log("\n=== DRY-RUN — nenhuma escrita foi realizada. Rode novamente com --execute --ids=<whitelist> para processar. ===\n");
    return;
  }

  if (whitelist.length === 0) {
    console.error("\n--execute exige --ids=<whitelist explícita>. Abortando sem escrever nada.\n");
    process.exit(1);
  }

  console.log(`\n=== EXECUTANDO reconciliação para ${whitelist.length} attempt(s) na whitelist, uma por vez ===\n`);

  for (const attemptId of whitelist) {
    console.log(`\n--- Processando ${attemptId} ---`);

    // Revalida ESTADO FRESCO imediatamente antes de cada escrita — nunca usa
    // o snapshot do dry-run acima, que pode estar desatualizado.
    // `simulado_attempts.student_id` é FK para auth.users(id), não para
    // public.students(id) — um embed `students:student_id(...)` aqui não é
    // resolvível pelo PostgREST (mesma limitação já documentada em
    // app/api/admin/events/[id]/route.ts). Nome/e-mail buscados à parte.
    const { data: fresh, error: freshError } = await supabase
      .from("simulado_attempts")
      .select("*")
      .eq("id", attemptId)
      .maybeSingle();
    if (freshError || !fresh) {
      console.log(`SKIP ${attemptId}: não encontrada na revalidação (${freshError?.message || "not found"})`);
      continue;
    }
    if (fresh.status !== "in_progress") {
      console.log(`SKIP ${attemptId}: já não está mais in_progress (status atual: ${fresh.status}) — already_terminal, não é falha`);
      continue;
    }
    const { data: existingResult } = await supabase.from("simulado_results").select("id").eq("attempt_id", attemptId).maybeSingle();
    if (existingResult) {
      console.log(`SKIP ${attemptId}: já possui simulado_result (${existingResult.id}) — não sobrescrever`);
      continue;
    }

    const { data: studentRef } = await supabase.from("students").select("id,name,email").eq("id", fresh.student_id).maybeSingle();
    const timeSpentSeconds = Math.max(0, Math.floor((Date.now() - new Date(fresh.started_at).getTime()) / 1000));

    try {
      const result = await completeSimuladoAttempt(supabase, {
        attempt: fresh,
        studentId: fresh.student_id,
        studentName: studentRef?.name ?? null,
        studentEmail: studentRef?.email ?? null,
        simuladoId: fresh.simulado_id,
        timeSpentSeconds,
        origin: "historical_reconciliation",
        request: undefined,
      });
      console.log(`RESULT ${attemptId}:`, JSON.stringify(result));
    } catch (err) {
      console.error(`ERRO ao processar ${attemptId}:`, err);
      console.log("Interrompendo o lote (não continua cegamente após erro inesperado).");
      break;
    }
  }

  console.log("\n=== Execução concluída. ===\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
