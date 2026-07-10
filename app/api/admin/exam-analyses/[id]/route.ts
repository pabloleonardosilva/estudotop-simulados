import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";
import { logAdminAction, logSystemError } from "@/app/lib/server/auditLogger";

function extractJson(text: string) {
  const cleaned = text.trim();
  if (cleaned.startsWith("{")) return cleaned;
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match?.[0] || cleaned;
}

function buildManualConsolidation(aiSummary: string, teacherNotes: string, command: string) {
  const parts = [
    aiSummary ? `Resumo original da IA: ${aiSummary}` : "",
    teacherNotes ? `Considerações do professor: ${teacherNotes}` : "",
    command ? `Orientação editorial aplicada: ${command}` : "",
  ].filter(Boolean);

  return parts.join("\n\n") || "Resumo consolidado pendente. Adicione considerações ou gere uma nova análise.";
}

async function consolidateSummaryWithOpenAI({ aiSummary, teacherNotes, command, analysis }: {
  aiSummary: string;
  teacherNotes: string;
  command: string;
  analysis: Record<string, unknown>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return buildManualConsolidation(aiSummary, teacherNotes, command);

  const prompt = `Você é especialista em Informática/TI para concursos públicos e atua como assistente editorial do Professor Pablo Leonardo no módulo Raio-X de Provas.

Gere uma nova versão consolidada do resumo estratégico da prova, combinando:
1. o resumo original da IA;
2. as considerações do professor;
3. o comando editorial informado pelo professor, quando existir;
4. os dados gerais da análise.

Regras:
- Dê prioridade editorial às considerações do professor.
- Não invente dados que não estejam no material recebido.
- Seja estratégico, claro e útil para orientar aula, revisão ou diagnóstico da banca.
- Aprofunde a parte de Informática/TI: diga o que foi cobrado dentro de cada assunto, não apenas o nome do assunto.
- Se não houver dados confiáveis sobre data da prova, adiamento ou cancelamento, informe que isso não foi identificado no material analisado, sem inventar.
- Não use markdown pesado; pode usar parágrafos curtos.
- Responda SOMENTE JSON válido no formato: {"final_summary_text":"..."}.

Dados da análise:
- Concurso: ${analysis.contest_name || "-"}
- Cargo: ${analysis.position_name || "-"}
- Ano: ${analysis.exam_year || "-"}
- Banca: ${analysis.board_name || "-"}
- Disciplina: ${analysis.discipline_name || "-"}
- Dashboard: ${JSON.stringify(analysis.dashboard || {})}
- Mapa de cobrança: ${JSON.stringify(analysis.modules_summary || [])}

Resumo original da IA:
${aiSummary || "Não informado."}

Considerações do professor:
${teacherNotes || "Não informadas."}

Comando editorial do professor:
${command || "Não informado."}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Responda somente JSON válido. Não use markdown." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(extractJson(content));
  return String(parsed?.final_summary_text || "").trim() || buildManualConsolidation(aiSummary, teacherNotes, command);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = createSupabaseAdminClient();

    if (body?.action === "consolidate_summary") {
      const teacherNotes = String(body.teacher_notes || "").trim();
      const aiAdjustmentPrompt = String(body.ai_adjustment_prompt || "").trim();

      const { data: analysis, error: analysisError } = await supabase
        .from("exam_analyses")
        .select("*")
        .eq("id", id)
        .single();

      if (analysisError || !analysis) throw new Error(analysisError?.message || "Análise não encontrada.");

      const aiSummary = String(analysis.ai_summary_text || analysis.summary_text || "").trim();
      const finalSummary = await consolidateSummaryWithOpenAI({
        aiSummary,
        teacherNotes,
        command: aiAdjustmentPrompt,
        analysis,
      });

      const { error } = await supabase
        .from("exam_analyses")
        .update({
          teacher_notes: teacherNotes,
          ai_adjustment_prompt: aiAdjustmentPrompt,
          final_summary_text: finalSummary,
          summary_text: finalSummary,
        })
        .eq("id", id);

      if (error) throw new Error(error.message);
      void logAdminAction({ adminUserId: admin.id, action: "admin.raiox.summary_consolidated", entityType: "exam_analysis", entityId: id, request });
      return NextResponse.json({ ok: true, final_summary_text: finalSummary });
    }

    const allowed: Record<string, unknown> = {};

    for (const key of [
      "title",
      "contest_name",
      "position_name",
      "exam_year",
      "board_name",
      "discipline_id",
      "discipline_name",
      "summary_text",
      "ai_summary_text",
      "teacher_notes",
      "ai_adjustment_prompt",
      "final_summary_text",
      "status",
    ]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) allowed[key] = body[key];
    }

    if (!Object.keys(allowed).length) {
      return NextResponse.json({ ok: false, message: "Nenhum campo enviado para atualização." }, { status: 400 });
    }

    const { error } = await supabase.from("exam_analyses").update(allowed).eq("id", id);
    if (error) throw new Error(error.message);

    void logAdminAction({ adminUserId: admin.id, action: "admin.raiox.updated", entityType: "exam_analysis", entityId: id, request, metadata: { fields: Object.keys(allowed) } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    void logSystemError({ source: "api.admin.exam_analyses.update", error, request });
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro ao salvar análise." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ ok: false, message: "ID obrigatório." }, { status: 400 });

    const supabase = createSupabaseAdminClient();

    // Exclui questões analisadas primeiro (caso não haja cascade)
    await supabase.from("exam_analysis_questions").delete().eq("analysis_id", id);

    const { error } = await supabase.from("exam_analyses").delete().eq("id", id);
    if (error) throw new Error(error.message);

    void logAdminAction({ adminUserId: admin.id, action: "admin.raiox.deleted", entityType: "exam_analysis", entityId: id, severity: "warning", request });

    return NextResponse.json({ ok: true, message: "Análise excluída com sucesso." });
  } catch (error) {
    void logSystemError({ source: "api.admin.exam_analyses.delete", error, request });
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro ao excluir análise." }, { status: 500 });
  }
}
