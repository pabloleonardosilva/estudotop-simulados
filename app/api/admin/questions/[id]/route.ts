import { NextResponse } from "next/server";
import { normalizeSubjectIds, primarySubjectId, syncQuestionSubjects } from "@/lib/questions/question-subjects";
import { EVALUATED_TOPICS_REQUIRED_MESSAGE, normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { richTextToPlainText } from "@/lib/utils/rich-text";
import { questionFingerprint } from "@/lib/utils/textSimilarity";
import { recalculateResultsForQuestionGabaritoChange } from "../../../../lib/utils/recalculate-question-results";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

type AlternativeInput = {
  label?: string | null;
  text?: string | null;
  image_url?: string | null;
  is_correct?: boolean | null;
};

function clean(value?: string | null) {
  return (value || "").trim();
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeAlternativeText(value?: string | null) {
  // Strips HTML and normalises whitespace/accents for duplicate comparison.
  // Does NOT strip "a)" / "b)" patterns \u2014 those belong to statement normalisation,
  // not alternative text, and removing them here causes false duplicate positives.
  return stripHtml(clean(value))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "e")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lightNormalizeAlternativeText(value?: string | null) {
  // Light normalization: removes accents and lowercases but keeps special chars.
  // Used as secondary pass to avoid false-positive duplicate detection when
  // alternatives differ only in special characters (e.g. = * # ! ()).
  return stripHtml(clean(value))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseValidYear(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);

  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return null;
  }

  return year;
}

function parseValidDifficulty(value: unknown) {
  const difficulty = Number(value);
  return Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : null;
}

function parseValidStatus(value: unknown) {
  const status = clean(typeof value === "string" ? value : "");
  return ["draft", "pending_review", "ready_to_publish", "published", "active", "archived", "annulled"].includes(status) ? status : null;
}

function normalizeAlternativeForUpdate(alternative: AlternativeInput, index: number) {
  return {
    label: clean(alternative.label).toUpperCase(),
    text: clean(alternative.text),
    image_url: clean(alternative.image_url) || null,
    is_correct: Boolean(alternative.is_correct),
    order_number: index + 1,
  };
}

function getDuplicateAlternativeLabelGroups(alternatives: Array<{ label: string; text: string }>) {
  const byText = new Map<string, Array<{ label: string; lightNorm: string; rawHtml: string }>>();

  for (const alternative of alternatives) {
    const normalized = normalizeAlternativeText(alternative.text);
    if (!normalized) continue;
    const lightNorm = lightNormalizeAlternativeText(alternative.text);
    // Preserve inline HTML formatting in the comparison key: alternatives with the
    // same plain text but different formatting (bold, italic, underline etc.) are
    // intentionally distinct and must NOT be flagged as duplicates.
    const rawHtml = (alternative.text || "").replace(/\s+/g, " ").trim();
    const existing = byText.get(normalized) || [];
    byText.set(normalized, [...existing, { label: alternative.label, lightNorm, rawHtml }]);
  }

  const result: string[][] = [];
  for (const entries of byText.values()) {
    if (entries.length <= 1) continue;
    // Sub-group by lightNorm + rawHtml. Both must be identical for a duplicate.
    const byKey = new Map<string, string[]>();
    for (const entry of entries) {
      const key = `${entry.lightNorm}__${entry.rawHtml}`;
      byKey.set(key, [...(byKey.get(key) || []), entry.label]);
    }
    for (const labels of byKey.values()) {
      if (labels.length > 1) result.push(labels);
    }
  }
  return result;
}

function formatDuplicateAlternativeMessage(groups: string[][]) {
  const details = groups.map((labels) => labels.join(" e ")).join("; ");
  return `As alternativas ${details} estão com o mesmo texto. Ajuste antes de salvar.`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("questions")
    .select(`
      id,
      code,
      statement,
      year,
      orgao,
      status,
      question_type,
      difficulty_level,
      evaluated_topics,
      image_url,
      explanation_text,
      subject_id,
      exam_board_id,
      exam_boards:exam_board_id (
        id,
        name
      ),
      subjects:subject_id (
        id,
        name,
        discipline_id,
        disciplines:discipline_id (
          id,
          name
        )
      ),
      question_subjects (
        subjects (
          id,
          name,
          discipline_id,
          disciplines:discipline_id (
            id,
            name
          )
        )
      ),
      question_alternatives (
        id,
        label,
        text,
        image_url,
        is_correct,
        order_number
      ),
      simulado_questions (
        id,
        simulados:simulado_id (
          id,
          title,
          status
        )
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 404 });
  }

  return NextResponse.json({ ok: true, question: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const statement = clean(body.statement);
    const alternatives: AlternativeInput[] = Array.isArray(body.alternatives) ? body.alternatives : [];
    const subjectIds = normalizeSubjectIds(body);
    const mainSubjectId = primarySubjectId(subjectIds);
    const year = parseValidYear(body.year);
    const difficulty = parseValidDifficulty(body.difficulty_level);
    const requestedStatus = parseValidStatus(body.status);
    let status = requestedStatus;
    const evaluatedTopics = normalizeEvaluatedTopics(body.evaluated_topics);

    if (!mainSubjectId) {
      return NextResponse.json(
        { ok: false, message: "Selecione pelo menos um assunto da questão." },
        { status: 400 },
      );
    }

    if (!body.exam_board_id) {
      return NextResponse.json(
        { ok: false, message: "Selecione a banca organizadora." },
        { status: 400 },
      );
    }

    // Year and difficulty are only mandatory for published/active questions.
    // Saving to pending_review or ready_to_publish must never be blocked by them.
    const requireFullValidation = status === "published" || status === "active";

    if (requireFullValidation && !year) {
      return NextResponse.json(
        { ok: false, message: "Informe o ano da questão." },
        { status: 400 },
      );
    }

    if (requireFullValidation && !difficulty) {
      return NextResponse.json(
        { ok: false, message: "Defina a dificuldade da questão." },
        { status: 400 },
      );
    }

    if (!status) {
      return NextResponse.json(
        { ok: false, message: "Selecione o status da questão." },
        { status: 400 },
      );
    }

    if (evaluatedTopics.length === 0) {
      return NextResponse.json(
        { ok: false, message: EVALUATED_TOPICS_REQUIRED_MESSAGE },
        { status: 400 },
      );
    }

    if (richTextToPlainText(statement).length < 10) {
      return NextResponse.json(
        { ok: false, message: "Informe um enunciado válido." },
        { status: 400 },
      );
    }

    const validAlternatives = alternatives
      .map((alternative: AlternativeInput, index: number) => normalizeAlternativeForUpdate(alternative, index))
      .filter((alternative) => alternative.label && (alternative.text || alternative.image_url));

    const minimumAlternatives = body.question_type === "true_false" ? 2 : 4;

    if (validAlternatives.length !== alternatives.length || validAlternatives.length < minimumAlternatives) {
      return NextResponse.json(
        { ok: false, message: body.question_type === "true_false" ? "Preencha todas as assertivas." : "Cadastre pelo menos 4 alternativas." },
        { status: 400 },
      );
    }

    const duplicateAlternativeGroups = getDuplicateAlternativeLabelGroups(validAlternatives);

    if (duplicateAlternativeGroups.length > 0) {
      return NextResponse.json(
        { ok: false, message: formatDuplicateAlternativeMessage(duplicateAlternativeGroups), duplicateAlternatives: duplicateAlternativeGroups },
        { status: 400 },
      );
    }

    const correct = validAlternatives.filter((alternative) => alternative.is_correct);

    if (correct.length > 1) {
      validAlternatives.forEach((alternative) => { alternative.is_correct = false; });
      status = "pending_review";
    }

    if ((status === "published" || status === "active" || status === "ready_to_publish") && validAlternatives.filter((alternative) => alternative.is_correct).length !== 1) {
      return NextResponse.json(
        { ok: false, message: "Marque exatamente uma resposta correta antes de publicar ou enviar para a fila." },
        { status: 400 },
      );
    }

    const finalCorrect = validAlternatives.find((alternative) => alternative.is_correct);

    const supabase = createSupabaseAdminClient();

    const { data: previousQuestion } = await supabase
      .from("questions")
      .select("id, code, correct_alternative_label")
      .eq("id", id)
      .single();

    const previousCorrectLabel = previousQuestion?.correct_alternative_label || null;

    const { error: questionError } = await supabase
      .from("questions")
      .update({
        subject_id: mainSubjectId,
        exam_board_id: body.exam_board_id,
        statement,
        year,
        orgao: clean(body.orgao) || null,
        evaluated_topics: evaluatedTopics,
        image_url: clean(body.image_url) || null,
        explanation_text: clean(body.explanation_text) || null,
        difficulty_level: difficulty,
        status,
        question_type: body.question_type || "multiple_choice",
        correct_alternative_label: finalCorrect?.label || null,
        question_fingerprint: questionFingerprint(statement),
      })
      .eq("id", id);

    if (questionError) {
      return NextResponse.json({ ok: false, message: questionError.message }, { status: 400 });
    }

    await syncQuestionSubjects({ supabase, questionId: id, subjectIds });
    await supabase.from("question_alternatives").delete().eq("question_id", id);

    const { error: alternativesError } = await supabase
      .from("question_alternatives")
      .insert(validAlternatives.map((alternative) => ({ question_id: id, ...alternative })));

    if (alternativesError) {
      return NextResponse.json({ ok: false, message: alternativesError.message }, { status: 400 });
    }

    if (previousCorrectLabel !== (finalCorrect?.label || null)) {
      await recalculateResultsForQuestionGabaritoChange({
        supabase,
        questionId: id,
        questionCode: previousQuestion?.code || null,
        previousCorrectLabel,
        newCorrectLabel: finalCorrect?.label || null,
        reason: `Gabarito da questão ${previousQuestion?.code || id} corrigido pela equipe EstudoTOP.`,
      });
    }

    void logAdminAction({ adminUserId: admin.id, action: "admin.question.updated", entityType: "question", entityId: id, request, metadata: { status: body.status ?? null } });
    return NextResponse.json({ ok: true, message: "Questão atualizada com sucesso." });
  } catch (error) {
    void logSystemError({ source: "api.admin.questions.update", error, request });
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao editar questão.",
      },
      { status: 500 },
    );
  }
}
