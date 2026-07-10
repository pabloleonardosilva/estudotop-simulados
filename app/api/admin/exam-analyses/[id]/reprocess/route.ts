import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireAdmin } from "@/lib/server/authGuard";

function extractJson(text: string) {
  const cleaned = text.trim();
  if (cleaned.startsWith("{")) return cleaned;
  const match = cleaned.match(/\{[\s\S]*\}/);
  return match?.[0] || cleaned;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function hasImage(html: string) {
  return /<img\b/i.test(html) || /imagem\s+associada\s+para\s+resolu/i.test(html) || /\.(png|jpe?g|webp|gif|bmp|svg)\b/i.test(html);
}


function normalizeVisualAnalysisStatus(value: unknown, hasQuestionImage: boolean) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!hasQuestionImage) return "none";
  if (["applied", "done", "visual_applied"].includes(normalized)) return "applied";
  if (["failed", "error"].includes(normalized)) return "failed";
  if (["review_required", "needs_review", "need_review", "pending_review"].includes(normalized)) return "review_required";
  if (["pending", "image_detected", "has_image"].includes(normalized)) return "pending";
  return "review_required";
}

function markImageHints(value: string): string {
  if (!value) return value;
  // Utilitário centralizado — vermelho #dc2626, 1.3em, negrito
  const style = "font-weight:700;color:#dc2626;font-size:1.3em;background:none;display:inline;line-height:1.4;";
  return String(value)
    .replace(/\r/g, "")
    .replace(/imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/gi, (m) => `<span data-image-marker="true" style="${style}">${m}</span>`)
    // Sem \s no grupo do nome — evita capturar texto multi-linha e colapsar parágrafos
    .replace(/\b([\w][\w.-]*\.(?:png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?)/gi, (m) => `<span data-image-marker="true" style="${style}">${m}</span>`);
}

function cleanArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function safeDifficulty(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function normalizeAlternatives(value: unknown, questionType: string) {
  if (!Array.isArray(value)) {
    return questionType === "true_false"
      ? [{ label: "C", text: "Certo", is_correct: false }, { label: "E", text: "Errado", is_correct: false }]
      : [];
  }
  return value.map((item, index) => {
    const alt = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { label: String(alt.label || String.fromCharCode(65 + index)).trim().toUpperCase().slice(0, 2), text: String(alt.text || "").trim(), is_correct: Boolean(alt.is_correct) };
  }).filter((alt) => alt.text || alt.label);
}

function fallbackParseQuestions(rawContent: string, analysis: any) {
  const plain = stripHtml(rawContent) || rawContent;
  const chunks = plain.split(/(?=\b(?:Quest[aã]o|Q\.)\s*\d+|^\s*\d+[\).\-]\s+)/gim).map((item) => item.trim()).filter((item) => item.length > 30);
  const sourceChunks = chunks.length ? chunks : [plain];
  return sourceChunks.map((chunk, index) => {
    const moduleGuess = /excel|planilha|c[eé]lula|f[oó]rmula/i.test(chunk) ? "Microsoft Excel" : /word|documento|par[aá]grafo|mala direta/i.test(chunk) ? "Microsoft Word" : /seguran|phishing|v[ií]rus|worm|malware|backup/i.test(chunk) ? "Segurança da Informação" : /windows|explorador|pasta|arquivo|atalho/i.test(chunk) ? "Microsoft Windows" : "Informática";
    return { original_number: String(index + 1), statement: chunk, question_type: "true_false", alternatives: [{ label: "C", text: "Certo", is_correct: false }, { label: "E", text: "Errado", is_correct: false }], answer_key: null, is_annulled: false, module_name: moduleGuess, subtopic_name: "Classificação pendente", knowledge_points: ["Conhecimento a revisar pelo professor"], difficulty_level: 3, difficulty_reason: "Classificação provisória.", charging_profile: "A revisar", explanation_text: "", teacher_opinion: "", has_image: hasImage(chunk), visual_analysis_status: hasImage(chunk) ? "review_required" : "none", ai_confidence: 0.35, board_name: analysis.board_name, year: analysis.exam_year, discipline_id: analysis.discipline_id, discipline_name: analysis.discipline_name };
  });
}

function calculateDashboard(questions: any[]) {
  const active = questions.filter((q) => q.status !== "discarded");
  const total = active.length;
  const modules = new Map<string, { count: number; diffSum: number; diffCount: number; subtopics: Map<string, Set<string>>; profiles: Map<string, number> }>();
  const difficulty = new Map<number, number>();
  const profiles = new Map<string, number>();
  for (const q of active) {
    const moduleName = q.module_name || "Não classificado";
    const current = modules.get(moduleName) || { count: 0, diffSum: 0, diffCount: 0, subtopics: new Map(), profiles: new Map() };
    current.count += 1;
    if (q.difficulty_level) { current.diffSum += q.difficulty_level; current.diffCount += 1; difficulty.set(q.difficulty_level, (difficulty.get(q.difficulty_level) || 0) + 1); }
    const points = current.subtopics.get(q.subtopic_name || "Geral") || new Set<string>();
    for (const point of q.knowledge_points || []) points.add(point);
    if (q.teacher_opinion) points.add(`Parecer: ${String(q.teacher_opinion).replace(/<[^>]+>/g, " ").slice(0, 160)}`);
    current.subtopics.set(q.subtopic_name || "Geral", points);
    const profile = q.charging_profile || "Não classificado";
    current.profiles.set(profile, (current.profiles.get(profile) || 0) + 1);
    profiles.set(profile, (profiles.get(profile) || 0) + 1);
    modules.set(moduleName, current);
  }
  const modulesSummary = Array.from(modules.entries()).map(([module, data]) => ({
    module,
    question_count: data.count,
    percentage: total ? Math.round((data.count / total) * 100) : 0,
    average_difficulty: data.diffCount ? Number((data.diffSum / data.diffCount).toFixed(1)) : null,
    charging_profile: Array.from(data.profiles.entries()).sort((a,b)=>b[1]-a[1])[0]?.[0] || "Não classificado",
    subtopics: Array.from(data.subtopics.entries()).map(([name, points]) => ({ name, knowledge_points: Array.from(points) })),
  })).sort((a,b)=>b.question_count-a.question_count || a.module.localeCompare(b.module));
  return { dashboard: { total_questions_detected: total, total_it_questions: total, ignored_questions: 0, total_images: active.filter((q)=>q.has_image).length, visual_analysis_applied: active.filter((q)=>q.has_image && q.visual_analysis_status === "applied").length, top_module: modulesSummary[0]?.module || null, average_difficulty: active.some((q)=>q.difficulty_level) ? Number((active.reduce((sum,q)=>sum+Number(q.difficulty_level||0),0) / active.filter((q)=>q.difficulty_level).length).toFixed(1)) : null, difficulty_distribution: Array.from(difficulty.entries()).map(([level,count])=>({ level, count })), charging_profile_distribution: Array.from(profiles.entries()).map(([profile,count])=>({ profile, count })) }, modulesSummary };
}

function buildFallbackHtml(analysis: any, modulesSummary: any[], teacherNotes: string): string {
  const total = modulesSummary.reduce((s: number, m: any) => s + (m.question_count || 0), 0);
  const avgDiff = modulesSummary.reduce((s: number, m: any) => s + (m.average_difficulty || 0), 0) / (modulesSummary.length || 1);
  const diffLabel = avgDiff < 2 ? "Fácil" : avgDiff < 3.5 ? "Média" : "Difícil";

  const topicRows = modulesSummary.map((m: any) => {
    const pct = total ? Math.round((m.question_count / total) * 100) : 0;
    const subtopics = (m.subtopics || []).map((s: any) => `<li style="margin:4px 0;color:#475569;">${s.name}${s.knowledge_points?.length ? ` — <em>${s.knowledge_points.slice(0, 4).join(", ")}</em>` : ""}</li>`).join("");
    return `<div style="margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong style="font-size:15px;color:#0f172a;">${m.module}</strong>
        <span style="font-size:13px;font-weight:700;color:#f97316;">${m.question_count} questão(ões) · ${pct}%</span>
      </div>
      <div style="height:6px;background:#e2e8f0;border-radius:4px;margin-bottom:10px;">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#f97316,#fbbf24);border-radius:4px;"></div>
      </div>
      ${subtopics ? `<ul style="margin:0;padding-left:18px;list-style:disc;">${subtopics}</ul>` : ""}
    </div>`;
  }).join("");

  return `<div style="font-family:'Inter',sans-serif;max-width:860px;color:#1e293b;line-height:1.7;">
  <h1 style="font-size:24px;font-weight:900;margin-bottom:4px;">Raio-X Estratégico da Prova</h1>
  <p style="color:#64748b;font-size:13px;margin-bottom:28px;">${analysis.contest_name} · ${analysis.position_name} · ${analysis.board_name} · ${analysis.exam_year}</p>

  <h2 style="font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#f97316;margin-bottom:14px;">1. Panorama Geral</h2>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px;">
    ${[["Banca",analysis.board_name],["Total de Questões",String(total)],["Dificuldade Média",diffLabel],["Concurso",analysis.contest_name],["Cargo",analysis.position_name],["Ano",String(analysis.exam_year)]].map(([l,v])=>`<div style="padding:14px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;"><p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 4px;">${l}</p><p style="font-size:16px;font-weight:800;color:#0f172a;margin:0;">${v||"—"}</p></div>`).join("")}
  </div>

  <h2 style="font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#f97316;margin-bottom:14px;">2. Análise por Tópico</h2>
  ${topicRows || `<p style="color:#94a3b8;">Nenhum tópico identificado.</p>`}

  <h2 style="font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#f97316;margin:28px 0 14px;">3. Conclusão e Recomendações</h2>
  <div style="padding:20px;background:#fff7ed;border-radius:12px;border:1px solid #fed7aa;">
    <p style="margin:0;color:#92400e;">${teacherNotes ? `<strong>Observações do professor:</strong> ${teacherNotes}` : "Adicione observações do professor para enriquecer a conclusão."}</p>
  </div>
</div>`;
}

async function generateSummary({ analysis, modulesSummary, teacherNotes, command }: { analysis: any; modulesSummary: any[]; teacherNotes: string; command: string }) {
  const apiKey = process.env.OPENAI_API_KEY;
  const total = modulesSummary.reduce((s: number, m: any) => s + (m.question_count || 0), 0);
  const avgDiff = (modulesSummary.reduce((s: number, m: any) => s + (m.average_difficulty || 0), 0) / (modulesSummary.length || 1)).toFixed(1);
  const topicsData = modulesSummary.map((m: any) => `${m.module} (${m.question_count} questões, ${Math.round((m.question_count/total)*100)}%): ${(m.subtopics||[]).map((s:any)=>`${s.name}${s.knowledge_points?.length?` [${s.knowledge_points.join(", ")}]`:""}`).join("; ")}`).join("\n");

  if (!apiKey) return buildFallbackHtml(analysis, modulesSummary, teacherNotes);

  const prompt = `Você é especialista em concursos públicos de Informática/TI. Gere um Raio-X estratégico completo em HTML puro (sem markdown, sem blocos de código, sem \`\`\`html). Use apenas elementos HTML com estilos inline — font-family Inter/sans-serif, paleta de cores neutras (brancos, cinzas, laranjas #f97316). NÃO invente dados externos.

Estrutura obrigatória:
1. Panorama Geral — grade com cards para Banca, Total de Questões, Dificuldade Média, Concurso, Cargo, Ano
2. Análise por Tópico — para CADA módulo: barra de progresso CSS (laranja), lista de subtópicos, descrição do que foi cobrado (Microsoft Word, Microsoft Excel, Microsoft Windows, etc.), nível de dificuldade
3. Conclusão e Recomendações — estratégia de estudo baseada nos dados

${command ? `Instrução editorial: ${command}.` : ""}${teacherNotes ? ` Considerações do professor: ${teacherNotes}.` : ""}

Dados da prova:
Concurso: ${analysis.contest_name} | Cargo: ${analysis.position_name} | Banca: ${analysis.board_name} | Ano: ${analysis.exam_year}
Total de questões de TI: ${total} | Dificuldade média: ${avgDiff}/5

Mapa de cobrança por módulo:
${topicsData}

Responda SOMENTE com o HTML (comece com <div e termine com </div>).`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini", temperature: 0.25, messages: [{ role: "system", content: "Responda SOMENTE com HTML puro com estilos inline. Nada de markdown ou blocos de código." }, { role: "user", content: prompt }] })
  });
  if (!response.ok) return buildFallbackHtml(analysis, modulesSummary, teacherNotes);
  const data = await response.json();
  const raw = String(data?.choices?.[0]?.message?.content || "").trim();
  // Remove markdown code fences if present
  const html = raw.replace(/^```(?:html)?\n?/i, "").replace(/\n?```$/i, "").trim();
  return html || buildFallbackHtml(analysis, modulesSummary, teacherNotes);
}

async function analyzeWithOpenAI(rawContent: string, analysis: any, teacherNotes: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const disciplineName = analysis.discipline_name || "Informática/TI";
  const contestName = analysis.contest_name || "";
  const positionName = analysis.position_name || "";
  const examYear = analysis.exam_year || "";
  const boardName = analysis.board_name || "";

  const prompt = `Você é especialista em Informática/TI para concursos públicos e trabalha no módulo Raio-X de Provas do EstudoTOP.

Analise o conteúdo colado pelo professor. Foque apenas em questões da disciplina selecionada: ${disciplineName}. Ignore questões de outras disciplinas.

Cabeçalho informado:
- Concurso: ${contestName}
- Cargo: ${positionName}
- Ano: ${examYear}
- Banca: ${boardName}
${teacherNotes ? `\nObservações do professor: ${teacherNotes}` : ""}

Tarefas:
1. Identifique TODAS as questões de ${disciplineName} presentes no texto — não omita nenhuma.
2. Separe enunciado e alternativas, preservando HTML e referências de imagem quando existirem.
3. Tente sugerir o gabarito. Se não tiver segurança, deixe answer_key null e alternativas com is_correct false.
4. Permita questão anulada usando is_annulled=true quando o texto indicar anulação.
5. Classifique por assunto principal, tópico de cobrança, conhecimentos cobrados, dificuldade 1-5 e perfil de cobrança.
6. Para imagens, marque has_image=true e visual_analysis_status="applied" quando a imagem tiver sido considerada, ou "needs_review" se depender de conferência.
7. Gere um resumo estratégico completo, mas objetivo. Se não houver informação sobre data da prova, adiamento ou cancelamento, diga que essa informação não foi identificada no material analisado, sem inventar.
8. Na parte de Informática/TI, seja profundo: para cada assunto principal, explique exatamente o que foi cobrado dentro dele.
9. Use a nomenclatura: assunto principal e tópico de cobrança. Internamente, retorne em module_name e subtopic_name.

Assuntos principais preferenciais: Microsoft Word, Microsoft Excel, Microsoft PowerPoint, Microsoft Windows, Linux, Internet, Navegadores, Correio Eletrônico, Segurança da Informação, Redes de Computadores, Banco de Dados, Google Workspace, Microsoft 365, Hardware, Software, Sistemas Operacionais, Inteligência Artificial, LGPD e Privacidade.

Retorne SOMENTE JSON válido neste formato:
{
  "summary_text": "...",
  "questions": [
    {
      "original_number": "1",
      "statement": "HTML do enunciado",
      "question_type": "multiple_choice",
      "alternatives": [{"label":"A","text":"...","is_correct":false}],
      "answer_key": "A",
      "is_annulled": false,
      "module_name": "Microsoft Word",
      "subtopic_name": "Atalhos de teclado",
      "knowledge_points": ["Ctrl+B", "negrito"],
      "difficulty_level": 2,
      "difficulty_reason": "...",
      "charging_profile": "Conceitual",
      "explanation_text": "comentário pedagógico curto, se possível",
      "has_image": false,
      "visual_analysis_status": "none",
      "ai_confidence": 0.84
    }
  ]
}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Responda somente JSON válido. Não use markdown." },
        { role: "user", content: `${prompt}\n\nCONTEÚDO DA PROVA:\n${rawContent}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return JSON.parse(extractJson(data?.choices?.[0]?.message?.content || "{}"));
}

function difficultyLabel(n: number | null | undefined): string {
  const v = Number(n || 0);
  if (!v) return "Não informada";
  if (v < 2) return "Fácil";
  if (v < 3.5) return "Média";
  return "Difícil";
}

/**
 * Constrói o payload para a IA usando os ASSUNTOS DO BANCO atribuídos pelo professor.
 * subjectMap: { [subject_id]: subject_name } — buscado das tabelas do banco.
 * Questões sem subject_id caem no fallback de module_name.
 */
function buildProvaData(analysis: any, modulesSummary: any[], questions: any[], teacherNotes: string, subjectMap: Record<string, string> = {}) {
  const active = questions.filter((q) => q.status !== "discarded");
  const total = active.length;
  const withImage = active.filter((q) => q.has_image).length;
  const avgDiff = total > 0 ? active.reduce((s, q) => s + (Number(q.difficulty_level) || 0), 0) / total : 0;

  // ── Agrupar por assunto do banco (subject_id) ou module_name como fallback ──
  const hasSubjectAssignments = active.some((q) => q.subject_id || q.subject_ids?.length);

  const groups: Record<string, any[]> = {};
  for (const q of active) {
    const primaryId = (q.subject_ids?.[0]) || q.subject_id || null;
    const groupName = (primaryId && subjectMap[primaryId])
      ? subjectMap[primaryId]
      : (q.module_name?.trim() || "Não classificado");
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(q);
  }

  const sorted = Object.entries(groups)
    .map(([name, qs]) => {
      const avgD = qs.reduce((s, q) => s + (Number(q.difficulty_level) || 0), 0) / (qs.length || 1);
      const tags = [...new Set(qs.flatMap((q) => q.knowledge_points || []))].filter(Boolean).slice(0, 10) as string[];
      const subtopics = [...new Set(qs.map((q) => q.subtopic_name).filter(Boolean))] as string[];
      const pareceres = qs.map((q) => String(q.teacher_opinion || "").trim()).filter(Boolean).join(" ").trim();
      const profiles = qs.map((q) => q.charging_profile).filter(Boolean);
      const topProfile = profiles.length ? (profiles.sort((a, b) => profiles.filter((x: string) => x === b).length - profiles.filter((x: string) => x === a).length)[0]) : null;
      return { name, qs, avgD, tags, subtopics, pareceres, topProfile };
    })
    .sort((a, b) => b.qs.length - a.qs.length);

  const topModule = sorted[0]?.name || null;

  // Se não há assuntos do banco, usa o modulesSummary original como fallback visual
  const baseLabel = hasSubjectAssignments
    ? "assuntos do banco de questões atribuídos pelo professor"
    : "módulos detectados automaticamente pela IA";

  return {
    prova: {
      titulo: "Raio-X da Prova",
      fonteDosAssuntos: baseLabel,
      ...(analysis.contest_name ? { concurso: analysis.contest_name } : {}),
      ...(analysis.board_name ? { banca: analysis.board_name } : {}),
      ...(analysis.exam_year ? { ano: String(analysis.exam_year) } : {}),
      ...(analysis.position_name ? { cargo: analysis.position_name } : {}),
      disciplina: analysis.discipline_name || "Informática/TI",
      totalQuestoesTI: total,
      dificuldadeMedia: Number(avgDiff.toFixed(1)),
      escalaDificuldade: 5,
      ...(topModule ? { assuntoDominante: topModule } : {}),
      questoesComImagem: withImage,
      ...(teacherNotes ? { observacoesDoProfe: teacherNotes } : {}),
    },
    assuntos: sorted.map(({ name, qs, avgD, tags, subtopics, pareceres, topProfile }) => {
      const pct = total > 0 ? Math.round((qs.length / total) * 100) : 0;
      return {
        nome: name,
        quantidade: qs.length,
        percentual: pct,
        ...(topProfile ? { tipoCobranca: topProfile } : {}),
        ...(avgD > 0 ? { dificuldade: difficultyLabel(avgD) } : {}),
        ...(name === topModule ? { destaque: "TOP" } : {}),
        ...(tags.length ? { tags } : {}),
        ...(subtopics.length ? { subtopicos: subtopics } : {}),
        ...(pareceres ? { parecer: pareceres } : {}),
      };
    }),
  };
}

function buildFallbackMarkdown(provaData: any): string {
  const p = provaData.prova;
  const assuntos: any[] = provaData.assuntos || [];
  const tableRows = assuntos.map((a: any) => `| ${a.nome} | ${a.quantidade} questão(ões) | ${a.percentual}% |`).join("\n");

  return `# RAIO-X DA PROVA — ${p.disciplina?.toUpperCase() || "INFORMÁTICA / TI"}

## 1. Visão geral dos dados da prova

A prova analisada apresentou **${p.totalQuestoesTI} questão(ões)** de ${p.disciplina || "Informática/TI"}.${p.dificuldadeMedia ? ` A dificuldade média foi de **${p.dificuldadeMedia}/5**.` : ""}${p.assuntoDominante ? ` O assunto dominante foi **${p.assuntoDominante}**.` : ""}${typeof p.questoesComImagem === "number" ? ` A prova teve **${p.questoesComImagem}** questão(ões) com imagem.` : ""}

## 2. Distribuição geral dos assuntos

| Assunto | Quantidade | Percentual |
|---------|------------|-----------|
${tableRows}

## 10. Conclusão técnica do raio-x

Relatório gerado automaticamente com base nos dados da prova. Clique em **Regerar Raio-X** para gerar a análise completa com IA.`;
}

async function generateDetailedReport(provaData: any, command: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return buildFallbackMarkdown(provaData);

  const prompt = `Você é um especialista em análise de provas de concursos públicos, com foco em Informática/TI.

Sua tarefa é gerar o "Raio-X da Prova" com base exclusivamente nos dados estruturados enviados pelo sistema.

═══════════════════════════════════════════════════════════
REGRAS ABSOLUTAS — leia com atenção antes de escrever:
═══════════════════════════════════════════════════════════

1. NÃO crie recomendações de estudo, plano de estudos, prioridades para próxima prova ou conselhos ao aluno.
2. NÃO invente dados. Se um campo não existir, não mencione.
3. NUNCA use as classificações genéricas "conceitual" ou "prático" como se fossem dimensões analíticas — toda questão de concurso de TI é textual por natureza; isso não agrega nenhuma informação ao aluno.
4. NUNCA escreva frases como "a natureza conceitual das questões indica..." ou "a predominância de questões práticas..." — isso é vazio e deve ser evitado.
5. Fale APENAS sobre o que a BANCA efetivamente cobrou: quais tópicos, como formulou as questões, quais conhecimentos específicos exigiu.

═══════════════════════════════════════════════════════════
COMO USAR TAGS E PARECER (INSTRUÇÃO CRÍTICA):
═══════════════════════════════════════════════════════════

Cada assunto tem dois campos complementares:
- "tags": palavras-chave dos conhecimentos cobrados (geradas pela IA)
- "parecer": observações do professor sobre a questão

REGRA: COMBINE os dois em uma narrativa analítica descritiva — nunca os mostre separados como listas.

ERRADO (nunca faça assim):
  Tags: referência cruzada, links no Microsoft Word
  Parecer: A questão exigiu conhecimento sobre referências cruzadas no Word.

CORRETO (assim deve ser):
  A banca cobrou conhecimentos sobre a funcionalidade de referência cruzada no Microsoft Word, explorando especificamente como criar vínculos internos dentro de um documento. A questão não tratou de edição básica — foi além, exigindo que o candidato soubesse navegar entre seções do texto por meio de referências estruturadas.

Outro exemplo CORRETO:
  O tema Microsoft Windows 10 foi abordado com foco na sincronização de configurações via conta Microsoft. A banca explorou o comportamento do sistema quando o usuário está conectado a uma conta institucional, perguntando especificamente sobre como as configurações de conta são sincronizadas entre dispositivos.

REGRA ADICIONAL: Sempre que o parecer e as tags existirem, use-os juntos para reconstruir "o que a banca quis testar" em linguagem analítica.

═══════════════════════════════════════════════════════════
SOBRE A SEÇÃO 5 (NATUREZA DAS QUESTÕES):
═══════════════════════════════════════════════════════════

NÃO analise "conceitual vs prático". Em vez disso, analise COMO a banca formulou as questões:
- Usou cenários hipotéticos ou situações de uso?
- Fez perguntas diretas sobre nomenclaturas e funcionamento?
- Cobrou identificação de termos e definições?
- Misturou contextos de uso real com conceitos teóricos?
- As questões exigiam interpretação de enunciados longos?
- Havia pegadinhas de nomenclatura, comparação entre opções?

Seja descritivo sobre o ESTILO de cobrança da banca, não sobre uma classificação binária.

═══════════════════════════════════════════════════════════
SOBRE A SEÇÃO 10 (CONCLUSÃO TÉCNICA):
═══════════════════════════════════════════════════════════

NÃO use linguagem genérica. A conclusão deve sintetizar ESPECIFICAMENTE:
- Quais foram os assuntos que mais pesaram e o que especificamente foi cobrado dentro deles
- Qual foi o estilo de cobrança predominante desta banca
- O que os dados revelam sobre o perfil desta prova em particular
- Não mencione "conceitual vs prático" de forma nenhuma

═══════════════════════════════════════════════════════════

Tom: laudo técnico/pericial, humanizado, analítico, descritivo.
Idioma: português do Brasil.
Formato: Markdown.
${command ? `\nInstrução editorial adicional: ${command}\n` : ""}

ESTRUTURA OBRIGATÓRIA (10 seções):

# RAIO-X DA PROVA — INFORMÁTICA / TI

## 1. Visão geral dos dados da prova
Total de questões, dificuldade média, assunto dominante, questões com imagem, perfil geral.

## 2. Distribuição geral dos assuntos
Tabela (Assunto | Questões | Percentual) + análise textual da distribuição.

## 3. Peso real dos blocos temáticos
Agrupe assuntos correlatos em blocos temáticos. Explique o peso de cada bloco.

## 4. Análise por assunto cobrado
Subseção (### 4.X. Nome) para cada assunto. Quantidade, percentual, dificuldade, e — USANDO TAGS + PARECER COMBINADOS — uma narrativa descritiva do que especificamente a banca cobrou dentro daquele assunto.

## 5. Estilo de cobrança da banca
Como a banca formulou as questões desta prova? Usou cenários, perguntas diretas, pegadinhas de nomenclatura? Qual foi o perfil de formulação predominante? (NÃO use "conceitual vs prático")

## 6. Questões com imagem
Quantidade, percentual, o que esse dado revela sobre a prova.

## 7. Assunto dominante
Assunto dominante, seu peso, assuntos correlatos, o que especificamente foi cobrado.

## 8. Leitura estatística da prova
Concentração ou dispersão, núcleo temático, desenho da distribuição.

## 9. Síntese do perfil da prova
Lista objetiva dos principais dados e características desta prova.

## 10. Conclusão técnica do raio-x
Síntese pericial: os assuntos que dominaram, o que especificamente foi exigido dentro deles, e o perfil particular desta banca nesta prova. Sem recomendações.

DADOS DA PROVA:
${JSON.stringify(provaData, null, 2)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 6000,
      messages: [
        { role: "system", content: "Você é um especialista em análise de provas de concursos públicos, com foco em Informática/TI. Gere relatórios em português do Brasil, com estilo técnico, humanizado e pericial. Escreva exclusivamente em Markdown." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) return buildFallbackMarkdown(provaData);
  const data = await response.json();
  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  return text || buildFallbackMarkdown(provaData);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { id } = await params;
    const body = await request.json();
    const rawMode = String(body.mode || "summary");
    const mode = rawMode === "full" ? "full" : rawMode === "report" ? "report" : "summary";
    const teacherNotes = String(body.teacher_notes || "").trim();
    const aiAdjustmentPrompt = String(body.ai_adjustment_prompt || "").trim();
    const supabase = createSupabaseAdminClient();

    const { data: analysis, error: analysisError } = await supabase.from("exam_analyses").select("*").eq("id", id).single();
    if (analysisError || !analysis) throw new Error(analysisError?.message || "Análise não encontrada.");

    // ── MODO REPORT: gera o laudo analítico completo em Markdown ─────────────
    if (mode === "report") {
      const { data: qs, error: qsError } = await supabase
        .from("exam_analysis_questions")
        .select("*")
        .eq("exam_analysis_id", id)
        .is("parent_question_id", null)
        .neq("status", "discarded")
        .order("original_number", { ascending: true });
      if (qsError) throw new Error(qsError.message);

      const active = qs || [];

      // ── Busca nomes dos assuntos do banco atribuídos pelo professor ───────
      const subjectIds = [
        ...new Set(active.flatMap((q) => [
          ...(Array.isArray(q.subject_ids) ? q.subject_ids : []),
          ...(q.subject_id ? [q.subject_id] : []),
        ])),
      ].filter(Boolean) as string[];

      const subjectMap: Record<string, string> = {};
      if (subjectIds.length > 0) {
        const { data: subjects } = await supabase
          .from("subjects")
          .select("id,name")
          .in("id", subjectIds);
        for (const s of subjects || []) {
          subjectMap[s.id] = s.name;
        }
      }

      const { dashboard, modulesSummary } = calculateDashboard(active);
      const provaData = buildProvaData(analysis, modulesSummary, active, teacherNotes || analysis.teacher_notes || "", subjectMap);
      const report = await generateDetailedReport(provaData, aiAdjustmentPrompt || analysis.ai_adjustment_prompt || "");

      const { error } = await supabase.from("exam_analyses").update({
        dashboard,
        modules_summary: modulesSummary,
        final_summary_text: report,
        summary_text: report,
        teacher_notes: teacherNotes || analysis.teacher_notes || null,
        ai_adjustment_prompt: aiAdjustmentPrompt || analysis.ai_adjustment_prompt || null,
        status: "reviewed",
      }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, mode, final_summary_text: report, summary_text: report, dashboard, modules_summary: modulesSummary });
    }

    if (mode === "full") {
      // Aceita novo texto no corpo — se não enviado, usa o stored
      const rawContent = (String(body.raw_content || "").trim() || String(analysis.raw_content || "").trim());
      if (rawContent.length < 40) return NextResponse.json({ ok: false, message: "Cole o texto da prova antes de analisar." }, { status: 400 });
      // Atualiza o raw_content armazenado se veio um novo
      if (body.raw_content?.trim()) {
        await supabase.from("exam_analyses").update({ raw_content: rawContent }).eq("id", id);
      }
      await supabase.from("exam_analysis_questions").delete().eq("exam_analysis_id", id);
      let aiResult: any = null;
      try { aiResult = await analyzeWithOpenAI(rawContent, analysis, teacherNotes || analysis.teacher_notes || ""); } catch (error) { throw error; }
      const sourceQuestions = Array.isArray(aiResult?.questions) && aiResult.questions.length ? aiResult.questions : fallbackParseQuestions(rawContent, analysis);
      const normalized = sourceQuestions.map((q: any, index: number) => {
        const questionType = q?.question_type === "true_false" ? "true_false" : "multiple_choice";
        const alternatives = normalizeAlternatives(q?.alternatives, questionType);
        const answerKey = q?.answer_key ? String(q.answer_key).trim().toUpperCase() : alternatives.find((a) => a.is_correct)?.label || null;
        return { exam_analysis_id: id, original_number: String(index + 1), statement: markImageHints(String(q?.statement || "").trim()), question_type: questionType, alternatives: alternatives.map((alt)=>({ ...alt, text: markImageHints(alt.text) })), answer_key: answerKey, is_annulled: Boolean(q?.is_annulled), board_name: analysis.board_name, year: analysis.exam_year, discipline_id: analysis.discipline_id, discipline_name: analysis.discipline_name, module_name: String(q?.module_name || "Informática").trim(), subtopic_name: String(q?.subtopic_name || "Geral").trim(), knowledge_points: cleanArray(q?.knowledge_points), difficulty_level: safeDifficulty(q?.difficulty_level), difficulty_reason: String(q?.difficulty_reason || "").trim(), charging_profile: String(q?.charging_profile || "Conceitual").trim(), explanation_text: String(q?.explanation_text || "").trim(), teacher_opinion: "", has_image: Boolean(q?.has_image) || hasImage(String(q?.statement || "")) || alternatives.some((a)=>hasImage(a.text)), visual_analysis_status: normalizeVisualAnalysisStatus(q?.visual_analysis_status, Boolean(q?.has_image) || hasImage(String(q?.statement || "")) || alternatives.some((a) => hasImage(a.text))), ai_confidence: Number.isFinite(Number(q?.ai_confidence)) ? Number(q.ai_confidence) : null, status: "detected", source_origin: "exam_analysis" };
      }).filter((q:any)=>q.statement);
      if (normalized.length) {
        const { error } = await supabase.from("exam_analysis_questions").insert(normalized);
        if (error) throw new Error(error.message);
      }
      const { dashboard, modulesSummary } = calculateDashboard(normalized);
      const summary = String(aiResult?.summary_text || await generateSummary({ analysis, modulesSummary, teacherNotes, command: aiAdjustmentPrompt }));
      const { error } = await supabase.from("exam_analyses").update({ status: "review_pending", dashboard, modules_summary: modulesSummary, ai_summary_text: summary, final_summary_text: summary, summary_text: summary, teacher_notes: teacherNotes || analysis.teacher_notes || null, ai_adjustment_prompt: aiAdjustmentPrompt || analysis.ai_adjustment_prompt || null }).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, mode, summary_text: summary, final_summary_text: summary, dashboard, modules_summary: modulesSummary });
    }

    const { data: questions, error: questionsError } = await supabase.from("exam_analysis_questions").select("*").eq("exam_analysis_id", id).is("parent_question_id", null).order("created_at", { ascending: true });
    if (questionsError) throw new Error(questionsError.message);
    const { dashboard, modulesSummary } = calculateDashboard(questions || []);
    const summary = await generateSummary({ analysis: { ...analysis, dashboard, modules_summary: modulesSummary }, modulesSummary, teacherNotes: teacherNotes || analysis.teacher_notes || "", command: aiAdjustmentPrompt || analysis.ai_adjustment_prompt || "" });
    const { error } = await supabase.from("exam_analyses").update({ dashboard, modules_summary: modulesSummary, final_summary_text: summary, summary_text: summary, teacher_notes: teacherNotes || analysis.teacher_notes || null, ai_adjustment_prompt: aiAdjustmentPrompt || analysis.ai_adjustment_prompt || null, status: "reviewed" }).eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, mode, final_summary_text: summary, summary_text: summary, dashboard, modules_summary: modulesSummary });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Erro ao reprocessar análise." }, { status: 500 });
  }
}
