import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { findOrCreateEstudoTopBoard } from "@/lib/questions/estudo-top-board";
import { findBlockingDuplicate, type DuplicateCandidateCache } from "@/lib/questions/duplicate-service";
import { predictDifficultyAIBatch } from "@/lib/utils/question-difficulty-ai";
import {
  normalizeSubjectIds,
  primarySubjectId,
  syncQuestionSubjects,
} from "@/lib/questions/question-subjects";
import { EVALUATED_TOPICS_REQUIRED_MESSAGE, normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { normalizeBoardComparableName, normalizeBoardName } from "@/lib/utils/text";
import { questionFingerprint } from "@/lib/utils/textSimilarity";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

type ImportedAlternative = {
  label?: string | null;
  text?: string | null;
  image_url?: string | null;
  is_correct?: boolean | null;
};

type ImportedQuestion = {
  temp_id?: string | null;
  statement?: string | null;
  question_type?: "multiple_choice" | "true_false" | string | null;
  status_override?: string | null;

  board_name?: string | null;
  exam_board_id?: string | null;

  orgao?: string | null;
  agency_name?: string | null;

  year?: number | string | null;

  explanation_text?: string | null;
  difficulty_level?: number | string | null;

  source_origin?: string | null;

  alternatives?: ImportedAlternative[] | null;

  subject_id?: string | null;
  subject_ids?: string[] | null;
  evaluated_topics?: string[] | null;
  is_duplicate?: boolean | null;
  duplicate_of?: unknown;
};

type ImportSaveBody = {
  questions?: ImportedQuestion[];

  subject_id?: string | null;
  subject_ids?: unknown;

  year?: number | string | null;
};

const activeImportLocks = new Set<string>();
const PROVA_COMPLETA_SUBJECT_ID = "__prova_completa__";

function realSubjectIds(ids: string[]) {
  return Array.from(new Set(ids.filter((id) => Boolean(id && id !== PROVA_COMPLETA_SUBJECT_ID))));
}

function subjectIdsForQuestion(question: ImportedQuestion, fallbackSubjectIds: string[]) {
  const rawIds = Array.isArray(question.subject_ids) && question.subject_ids.length > 0
    ? question.subject_ids
    : question.subject_id
      ? [question.subject_id]
      : fallbackSubjectIds;

  return realSubjectIds(rawIds);
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireImportLock(lockKey: string) {
  const startedAt = Date.now();

  while (activeImportLocks.has(lockKey)) {
    if (Date.now() - startedAt > 10_000) {
      throw new Error("Tempo excedido aguardando validação de duplicidade.");
    }

    await wait(50);
  }

  activeImportLocks.add(lockKey);
}

function releaseImportLock(lockKey: string) {
  activeImportLocks.delete(lockKey);
}

function clean(value?: string | null) {
  return (value || "").trim();
}

function parseValidYear(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const year = Number(value);

  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return null;
  }

  return year;
}

function normalizeTrueFalseAlternativeLabel(alternative: ImportedAlternative, index: number) {
  const rawLabel = clean(alternative.label).toLowerCase();
  const rawText = clean(alternative.text).toLowerCase();

  if (rawLabel === "c" || rawLabel === "certo" || rawText === "certo") {
    return "C";
  }

  if (rawLabel === "e" || rawLabel === "errado" || rawText === "errado") {
    return "E";
  }

  return index === 0 ? "C" : "E";
}

function normalizeAlternativeForInsert(
  alternative: ImportedAlternative,
  index: number,
  questionType: string
) {
  const fallbackLabel =
    questionType === "true_false"
      ? index === 0
        ? "C"
        : "E"
      : String.fromCharCode(65 + index);

  const rawLabel = clean(alternative.label);
  const label =
    questionType === "true_false"
      ? normalizeTrueFalseAlternativeLabel(alternative, index)
      : rawLabel.toUpperCase() || fallbackLabel;

  const text =
    questionType === "true_false"
      ? label === "C"
        ? "Certo"
        : "Errado"
      : clean(alternative.text);

  return {
    label,
    text,
    image_url: clean(alternative.image_url) || null,
    is_correct: Boolean(alternative.is_correct),
    order_number: index + 1,
  };
}

async function findOrCreateBoard(
  supabase: SupabaseClient,
  boardName: string
) {
  const normalized =
    normalizeBoardName(boardName);

  if (!normalized) return null;

  const {
    data: existingBoards,
    error: existingError,
  } = await supabase
    .from("exam_boards")
    .select("id, name");

  if (existingError) {
    throw new Error(
      existingError.message
    );
  }

  const comparable = normalizeBoardComparableName(normalized);
  const existing = (existingBoards || []).find(
    (item) => normalizeBoardComparableName(item.name) === comparable,
  );

  if (existing?.id) {
    return {
      id: existing.id,
      name: existing.name,
      created: false,
    };
  }

  const { data, error } =
    await supabase
      .from("exam_boards")
      .insert({
        name: normalized,
        is_active: true,
      })
      .select("id, name")
      .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    id: data.id,
    name: data.name,
    created: true,
  };
}

export async function POST(
  request: Request
) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const body =
      (await request.json()) as ImportSaveBody;

    const questions =
      Array.isArray(body.questions)
        ? body.questions
        : [];

    const subjectIds =
      realSubjectIds(normalizeSubjectIds(body));

    const defaultYear = parseValidYear(body.year);

    if (!questions.length) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nenhuma questÃ£o enviada.",
        },
        { status: 400 }
      );
    }

    const hasAtLeastOneQuestionWithSubject = questions.some(
      (question) => subjectIdsForQuestion(question, subjectIds).length > 0,
    );

    if (!hasAtLeastOneQuestionWithSubject) {
      return NextResponse.json(
        {
          ok: false,
          message: "Nenhuma questão com assunto real foi enviada. Redefina as questões marcadas como Prova completa.",
        },
        { status: 400 }
      );
    }

    const supabase =
      createSupabaseAdminClient();

    // Pre-compute difficulty levels in one batch call instead of one AI call per question
    const needsPrediction = questions.map((q) => !q.difficulty_level);
    const toPredict = questions
      .filter((_, i) => needsPrediction[i])
      .map((q) => ({
        statement: clean(q.statement || ""),
        alternatives: Array.isArray(q.alternatives) ? q.alternatives : [],
        question_type: q.question_type,
      }));
    const batchDifficulties = toPredict.length > 0 ? await predictDifficultyAIBatch(toPredict) : [];
    let batchDiffIdx = 0;
    const precomputedDifficulty: number[] = questions.map((q, i) =>
      needsPrediction[i] ? (batchDifficulties[batchDiffIdx++] ?? 3) : Number(q.difficulty_level),
    );

    const boardCache: DuplicateCandidateCache = new Map();

    let savedCount = 0;
    let ignoredCount = 0;

    const savedIds: string[] = [];
    const savedTempIds: string[] = [];
    const ignoredTempIds: string[] = [];
    const failedItems: Array<{ temp_id?: string | null; message: string }> = [];

    for (let qi = 0; qi < questions.length; qi++) {
      const question = questions[qi];
      const tempId = clean(question.temp_id || "") || null;

      try {
        if (question.is_duplicate) {
          ignoredCount++;
          if (tempId) ignoredTempIds.push(tempId);
          continue;
        }

        const questionSubjectIds = subjectIdsForQuestion(question, subjectIds);
        const questionSubjectId = primarySubjectId(questionSubjectIds);
        const evaluatedTopics = normalizeEvaluatedTopics(question.evaluated_topics);

        if (!questionSubjectId) {
          ignoredCount++;
          if (tempId) ignoredTempIds.push(tempId);
          continue;
        }

        if (evaluatedTopics.length === 0) {
          failedItems.push({
            temp_id: tempId,
            message: EVALUATED_TOPICS_REQUIRED_MESSAGE,
          });
          continue;
        }

        const statement = clean(
          question.statement
        );

        if (!statement) {
          ignoredCount++;
          if (tempId) ignoredTempIds.push(tempId);
          continue;
        }

        const sourceOrigin = clean(
          question.source_origin
        );

        const boardName =
          sourceOrigin ===
          "generate_ai"
            ? "Estudo TOP"
            : normalizeBoardName(
                question.board_name ||
                  ""
              );

        if (!boardName) {
          failedItems.push({
            temp_id: tempId,
            message: "Uma questão está sem banca.",
          });
          continue;
        }

        const board =
          sourceOrigin ===
          "generate_ai"
            ? await findOrCreateEstudoTopBoard(
                supabase
              )
            : await findOrCreateBoard(
                supabase,
                boardName
              );

        if (!board?.id) {
          failedItems.push({
            temp_id: tempId,
            message: "Não foi possível localizar a banca.",
          });
          continue;
        }

        const fingerprint = questionFingerprint(
          statement
        );
        const lockKey = `${board.id}:${fingerprint}`;

        const questionYear =
          parseValidYear(question.year) ??
          defaultYear;

        const orgao = clean(question.orgao || question.agency_name || "") || null;

        const alternatives =
          Array.isArray(
            question.alternatives
          )
            ? question.alternatives
            : [];

        const questionType =
          question.question_type ===
          "true_false"
            ? "true_false"
            : "multiple_choice";

        const validAlternatives =
          alternatives
            .map((alternative, index) =>
              normalizeAlternativeForInsert(
                alternative,
                index,
                questionType
              )
            )
            .filter(
              (alternative) =>
                alternative.text || alternative.image_url
            );

        const correctAlternative =
          validAlternatives.find(
            (alternative) =>
              alternative.is_correct
          );

        await acquireImportLock(lockKey);

        try {
          const blockingDuplicate =
            await findBlockingDuplicate({
              supabase,

              statement,

              alternatives:
                validAlternatives,

              examBoardId:
                board.id,

              boardCache,
            });

          if (blockingDuplicate) {
            ignoredCount++;
            if (tempId) ignoredTempIds.push(tempId);
            continue;
          }

          const {
            data: inserted,
            error,
          } = await supabase
            .from("questions")
            .insert({
              statement,

              subject_id:
                questionSubjectId,

              exam_board_id:
                board.id,

              year:
                questionYear,

              orgao,
              evaluated_topics: evaluatedTopics,

              question_type:
                questionType,

              difficulty_level:
                precomputedDifficulty[qi],

              explanation_text:
                clean(
                  question.explanation_text
                ),

              correct_alternative_label:
                correctAlternative?.label ||
                null,

              is_in_question_bank:
                true,

              question_fingerprint:
                fingerprint,

              source_origin:
                sourceOrigin ||
                "import_ai",

              status:
                question.status_override === "annulled" ? "annulled" : "pending_review",
            })
            .select("id")
            .single();

          if (error) {
            failedItems.push({
              temp_id: tempId,
              message: error.message,
            });
            continue;
          }

          if (inserted?.id) {
            savedIds.push(
              inserted.id
            );
            if (tempId) savedTempIds.push(tempId);

            await syncQuestionSubjects({
              supabase,
              questionId: inserted.id,
              subjectIds: questionSubjectIds,
            });

            if (validAlternatives.length) {
              const {
                error: alternativesError,
              } = await supabase
                .from(
                  "question_alternatives"
                )
                .insert(
                  validAlternatives.map(
                    (alternative) => ({
                      question_id:
                        inserted.id,
                      ...alternative,
                    })
                  )
                );

              if (alternativesError) {
                await supabase
                  .from("questions")
                  .delete()
                  .eq(
                    "id",
                    inserted.id
                  );

                savedIds.splice(savedIds.indexOf(inserted.id), 1);
                if (tempId) {
                  const tempIndex = savedTempIds.indexOf(tempId);
                  if (tempIndex >= 0) savedTempIds.splice(tempIndex, 1);
                }

                failedItems.push({
                  temp_id: tempId,
                  message: alternativesError.message,
                });
                continue;
              }
            }

            savedCount++;
          }
        } finally {
          releaseImportLock(lockKey);
        }
      } catch (error) {
        failedItems.push({
          temp_id: tempId,
          message:
            error instanceof Error
              ? error.message
              : "Erro ao salvar a questão.",
        });
      }
    }

    const failedCount = failedItems.length;
    const processedCount = savedCount + ignoredCount;

    void logAdminAction({ adminUserId: admin.id, action: "admin.question.imported", entityType: "question", request, metadata: { saved_count: savedCount, ignored_count: ignoredCount, failed_count: failedCount, question_ids: savedIds } });

    return NextResponse.json({
      ok: processedCount > 0 || failedCount === 0,

      message:
        failedCount > 0
          ? `${savedCount} questão(ões) enviada(s), ${ignoredCount} já estavam no banco/foram ignorada(s) e ${failedCount} ficaram com erro.`
          : `${savedCount} questão(ões) enviada(s) para revisão.${ignoredCount > 0 ? ` ${ignoredCount} questão(ões) já estavam no banco e foram removida(s) da prévia.` : ""}`,

      saved_count:
        savedCount,

      ignored_count:
        ignoredCount,

      failed_count:
        failedCount,

      ids: savedIds,

      saved_temp_ids: savedTempIds,

      ignored_temp_ids: ignoredTempIds,

      failed_items: failedItems,
    });
  } catch (error) {
    void logSystemError({ source: "api.admin.questions.import_save", error, request });
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro interno.",
      },
      { status: 500 }
    );
  }
}
