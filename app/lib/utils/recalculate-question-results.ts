import type { SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, any>;

type RecalculateParams = {
  supabase: SupabaseClient;
  questionId: string;
  questionCode?: string | null;
  previousCorrectLabel?: string | null;
  newCorrectLabel?: string | null;
  adminId?: string | null;
  adminName?: string | null;
  reason?: string;
};

function norm(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function scoreEntry(entry: JsonRecord, newCorrectLabel?: string | null, scoringModel?: string) {
  const points = Number(entry.points || 0);
  const selectedLabel = entry.selected_alternative_label || null;
  const selectedId = entry.selected_alternative_id || null;
  const isBlank = !selectedId && !selectedLabel;

  if (entry.status === "annulled") {
    return { ...entry, is_correct: true, score_delta: points };
  }

  if (isBlank) {
    return {
      ...entry,
      is_correct: null,
      correct_alternative_label: newCorrectLabel || null,
      score_delta: 0,
    };
  }

  const isCorrect = Boolean(newCorrectLabel && norm(selectedLabel) === norm(newCorrectLabel));
  let scoreDelta = 0;
  if (isCorrect) scoreDelta = points;
  else if (scoringModel === "cebraspe") scoreDelta = -points;

  return {
    ...entry,
    is_correct: isCorrect,
    correct_alternative_label: newCorrectLabel || null,
    score_delta: scoreDelta,
  };
}

function summarize(entries: JsonRecord[], scoringModel?: string) {
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let annulledCount = 0;
  let answeredQuestions = 0;

  for (const entry of entries) {
    const points = Number(entry.points || 0);
    maxScore += points;
    score += Number(entry.score_delta || 0);

    const selectedLabel = entry.selected_alternative_label || null;
    const selectedId = entry.selected_alternative_id || null;
    const isBlank = !selectedId && !selectedLabel;

    if (entry.status === "annulled") {
      annulledCount += 1;
      continue;
    }

    if (isBlank) {
      blankCount += 1;
      continue;
    }

    answeredQuestions += 1;
    if (entry.is_correct) correctCount += 1;
    else wrongCount += 1;
  }

  const displayScore = Math.max(score, 0);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const displayPercentage = Math.max(0, Math.min(100, percentage));

  return {
    total_questions: entries.length,
    answered_questions: answeredQuestions,
    correct_count: correctCount,
    wrong_count: wrongCount,
    blank_count: blankCount,
    annulled_count: annulledCount,
    score: round2(score),
    display_score: round2(displayScore),
    max_score: round2(maxScore),
    percentage: round2(percentage),
    display_percentage: round2(displayPercentage),
    scoring_model: scoringModel || "traditional",
  };
}

async function safeInsertResultChangeLog(supabase: SupabaseClient, payload: JsonRecord) {
  try {
    await supabase.from("simulado_result_change_logs").insert(payload);
  } catch {
    // A tabela é criada por SQL separado. Não bloqueia o recálculo caso ainda não exista.
  }
}

export async function recalculateResultsForQuestionGabaritoChange({
  supabase,
  questionId,
  questionCode,
  previousCorrectLabel,
  newCorrectLabel,
  adminId,
  adminName,
  reason,
}: RecalculateParams) {
  if (!questionId || norm(previousCorrectLabel) === norm(newCorrectLabel)) {
    return { affected_results: 0, changed_results: 0 };
  }

  const { data: simuladoQuestions, error: sqError } = await supabase
    .from("simulado_questions")
    .select("id, simulado_id, question_id")
    .eq("question_id", questionId);

  if (sqError) throw new Error(sqError.message);

  const sqRows = (simuladoQuestions || []) as Array<{ id: string; simulado_id: string; question_id: string }>;
  if (sqRows.length === 0) return { affected_results: 0, changed_results: 0 };

  const sqIds = sqRows.map((row) => row.id);
  const simuladoIds = Array.from(new Set(sqRows.map((row) => row.simulado_id)));

  const { data: results, error: resultsError } = await supabase
    .from("simulado_results")
    .select("*")
    .in("simulado_id", simuladoIds);

  if (resultsError) throw new Error(resultsError.message);

  let affectedResults = 0;
  let changedResults = 0;

  for (const result of (results || []) as JsonRecord[]) {
    const snapshot = (result.result_snapshot || {}) as JsonRecord;
    const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
    const hasQuestion = entries.some((entry: JsonRecord) => sqIds.includes(entry.simulado_question_id) || entry.question_id === questionId);
    if (!hasQuestion) continue;

    affectedResults += 1;
    const oldScore = Number(result.display_score ?? result.score ?? 0);

    const nextEntries = entries.map((entry: JsonRecord) => {
      const belongsToQuestion = sqIds.includes(entry.simulado_question_id) || entry.question_id === questionId;
      return belongsToQuestion ? scoreEntry(entry, newCorrectLabel, result.scoring_model) : entry;
    });

    const summary = summarize(nextEntries, result.scoring_model);
    const scoreChanged = round2(oldScore) !== round2(summary.display_score);

    const { error: updateError } = await supabase
      .from("simulado_results")
      .update({
        ...summary,
        result_snapshot: { ...snapshot, entries: nextEntries },
      })
      .eq("id", result.id);

    if (updateError) throw new Error(updateError.message);

    if (scoreChanged) {
      changedResults += 1;
      await safeInsertResultChangeLog(supabase, {
        student_id: result.student_id,
        simulado_id: result.simulado_id,
        attempt_id: result.attempt_id,
        question_id: questionId,
        question_code: questionCode || null,
        old_score: round2(oldScore),
        new_score: summary.display_score,
        score_delta: round2(summary.display_score - oldScore),
        reason: reason || `Gabarito da questão ${questionCode || questionId} corrigido pela equipe EstudoTOP.`,
        previous_correct_label: previousCorrectLabel || null,
        new_correct_label: newCorrectLabel || null,
        changed_by: adminId || null,
        changed_by_name: adminName || null,
        visible_to_student: true,
        created_at: new Date().toISOString(),
      });
    }
  }

  return { affected_results: affectedResults, changed_results: changedResults };
}
