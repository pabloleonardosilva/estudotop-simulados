import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { richTextToPlainText } from "@/lib/utils/rich-text";
import { requireAdmin } from "@/lib/server/authGuard";

function extractJson(text: string) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  if (cleaned.startsWith("{")) return cleaned;
  return cleaned.match(/\{[\s\S]*\}/)?.[0] || cleaned;
}

type AlternativeRow = {
  label: string | null;
  text: string | null;
  is_correct: boolean | null;
};

type RelatedName = { name?: string | null };
type RelatedSubject = RelatedName & {
  disciplines?: RelatedName | RelatedName[] | null;
};
type DetectQuestionRow = {
  statement?: string | null;
  explanation_text?: string | null;
  subjects?: RelatedSubject | RelatedSubject[] | null;
  exam_boards?: RelatedName | RelatedName[] | null;
  question_alternatives?: AlternativeRow[] | null;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ ok: false, message: "OPENAI_API_KEY não foi configurada." }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const save = body.save !== false;
    const supabase = createSupabaseAdminClient();

    const { data: question, error } = await supabase
      .from("questions")
      .select(`
        id,
        code,
        statement,
        explanation_text,
        evaluated_topics,
        subjects:subject_id (
          name,
          disciplines:discipline_id (
            name
          )
        ),
        exam_boards:exam_board_id (
          name
        ),
        question_alternatives (
          label,
          text,
          is_correct,
          order_number
        )
      `)
      .eq("id", id)
      .single();

    if (error || !question) {
      return NextResponse.json({ ok: false, message: "Questão não encontrada." }, { status: 404 });
    }

    const questionRow = question as DetectQuestionRow;
    const statementText = richTextToPlainText(questionRow.statement || "");
    if (statementText.length < 10) {
      return NextResponse.json({ ok: false, message: "Questão sem enunciado suficiente para detectar tópicos." }, { status: 400 });
    }

    const alternatives = ((questionRow.question_alternatives || []) as AlternativeRow[])
      .map((alternative) => `${alternative.label || ""}) ${richTextToPlainText(alternative.text || "")}${alternative.is_correct ? " [correta]" : ""}`)
      .join("\n");
    const subjectName = Array.isArray(questionRow.subjects) ? questionRow.subjects[0]?.name : questionRow.subjects?.name;
    const disciplineData = Array.isArray(questionRow.subjects) ? questionRow.subjects[0]?.disciplines : questionRow.subjects?.disciplines;
    const disciplineName = Array.isArray(disciplineData) ? disciplineData[0]?.name : disciplineData?.name;
    const boardName = Array.isArray(questionRow.exam_boards) ? questionRow.exam_boards[0]?.name : questionRow.exam_boards?.name;

    const prompt = `Você é um especialista em questões de concursos públicos de Informática.

Analise a questão abaixo e identifique os tópicos específicos efetivamente avaliados.

Não retorne o assunto genérico se houver tópico mais específico.
Use nomes curtos, objetivos e úteis para revisão do aluno.
Retorne de 1 a 4 tópicos.
Não invente tópicos que não estejam diretamente relacionados ao enunciado.
Não explique. Retorne apenas JSON válido.

Exemplos:
Assunto Hardware: Memória RAM, Memória Cache, Placa-mãe, BIOS/UEFI, Barramentos, SSD x HD
Assunto Redes: TCP/IP, DNS, DHCP, Endereço IP, Máscara de sub-rede, Modelo OSI
Assunto Segurança: Malware, Phishing, Firewall, Criptografia, Backup, Engenharia Social
Assunto Windows: Gerenciamento de arquivos, Painel de Controle, Permissões, Atalhos do Windows
Assunto Excel: Fórmulas, Funções, Referências relativas e absolutas, Gráficos, Tabelas

Formato obrigatório:
{
  "evaluated_topics": ["Tópico 1", "Tópico 2"]
}

Disciplina: ${disciplineName || ""}
Assunto: ${subjectName || ""}
Banca: ${boardName || ""}
Enunciado:
${statementText}

Alternativas:
${alternatives || "Sem alternativas informadas."}

Comentário/explicação:
${richTextToPlainText(questionRow.explanation_text || "") || "Sem explicação."}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você identifica tópicos avaliados em questões e retorna somente JSON válido." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      return NextResponse.json({ ok: false, message: result?.error?.message || "Erro ao detectar tópicos com IA." }, { status: 400 });
    }

    const content = result?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(extractJson(content));
    const evaluatedTopics = normalizeEvaluatedTopics(parsed?.evaluated_topics);

    if (evaluatedTopics.length === 0) {
      return NextResponse.json({ ok: false, message: "Não foi possível detectar tópicos avaliados com segurança." }, { status: 400 });
    }

    if (save) {
      const { error: updateError } = await supabase
        .from("questions")
        .update({ evaluated_topics: evaluatedTopics })
        .eq("id", id);

      if (updateError) {
        return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 });
      }
    }

    return NextResponse.json({
      ok: true,
      message: save ? "Tópicos avaliados detectados e salvos." : "Tópicos avaliados detectados.",
      evaluated_topics: evaluatedTopics,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "Erro inesperado ao detectar tópicos avaliados.",
    }, { status: 500 });
  }
}
