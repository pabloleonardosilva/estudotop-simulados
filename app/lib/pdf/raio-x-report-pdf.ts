import React from "react";
import { Circle, Defs, Document, Font, Image, LinearGradient, Page, RadialGradient, Rect, Stop, StyleSheet, Svg, Text, View, pdf } from "@react-pdf/renderer";
import {
  COLORS,
  PARECER_FALLBACK,
  alternativeLabel,
  buildReportSummary,
  cleanBlockText,
  cleanText,
  difficultyLabel,
  difficultyTone,
  getQuestionTags,
  isAlternativeCorrect,
  moduleRelatedNumbers,
  modulePercent,
  moduleTags,
  paragraphList,
  parecerText,
  profileIndicators,
  questionCorrectLabel,
  questionDisplayNumber,
  safeFileName,
  unique,
  type ReportProps,
} from "@/app/admin/raio-x-provas/[id]/relatorio/report-model";

// PDF premium do relatório final do Raio-X (Versão PDF de /admin/raio-x-provas/[id]/relatorio).
// Documento editorial próprio em A4, montado a partir dos MESMOS dados e regras da
// Versão Tela (report-model.ts). Texto vetorial e selecionável; nenhuma página vira imagem.
//
// Isolado dos demais geradores: família tipográfica exclusiva (Inter estática Regular/Bold —
// a Inter variável registrada pelos outros PDFs não produz negrito real no React PDF) e
// nenhum registro global alterado (sem Font.registerHyphenationCallback/EmojiSource).
//
// Paginação: blocos curtos e de altura limitada ficam indivisíveis; blocos variáveis só
// ficam indivisíveis quando a estimativa CONSERVADORA de altura cabe com folga numa página.
// Rede de segurança: se o React PDF avisar que algum bloco indivisível ficou maior que a
// página (o único caso em que ele corta conteúdo), o documento é refeito com todos os
// blocos variáveis quebráveis. Se ainda assim houver aviso, a geração falha — nunca
// entrega um PDF com conteúdo cortado.

export const RAIO_X_PDF_FONT_FAMILY = "EstudoTopRaioXInter";

// Capa oficial (arte A4 retrato, pixels intocados): ocupa a página inteira e recebe o selo
// de identificação (nome + ID do Raio-X) sobreposto na geração. A capa composta (banner +
// mascote) só é usada como reserva se a arte oficial não puder ser carregada.
export const RAIO_X_PDF_ASSETS = {
  coverImage: "/images/pdf/capa_raiox.png" as string | null,
  coverBanner: "/images/raio-x/bg-simulados1.png",
  mascot: "/images/raio-x/owl-footer.png",
};

export type RaioXPdfAssetKey = keyof typeof RAIO_X_PDF_ASSETS;
export type RaioXPdfResolvedAssets = Partial<Record<RaioXPdfAssetKey, string | null>>;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const PAD_X = 46;
const PAD_TOP = 74;
const PAD_BOTTOM = 64;
const CONTENT_W = PAGE_W - PAD_X * 2;
const CONTENT_H = PAGE_H - PAD_TOP - PAD_BOTTOM;
// Um bloco variável só é indivisível se a estimativa couber em 90% da área útil. Se a
// estimativa errar e o bloco real passar da página, renderWithOversizeGuard detecta e
// refaz o documento em modo seguro — o limite afeta a estética, nunca a integridade.
const UNBREAKABLE_LIMIT = CONTENT_H * 0.9;
// Questões: decisão editorial isolada. Inteiras quando cabem na página (leitura sem
// interrupção), ao custo de espaço livre quando duas não cabem juntas. Reduzir este limite
// faz questões longas quebrarem entre alternativas (cabeçalho + enunciado seguem juntos).
const QUESTION_UNBREAKABLE_LIMIT = CONTENT_H * 0.9;
const ALTERNATIVE_UNBREAKABLE_LIMIT = CONTENT_H * 0.4;
// Cabeçalho + enunciado de um card quebrável ficam juntos se couberem em metade da página.
const HEAD_GROUP_LIMIT = CONTENT_H * 0.5;

const C = {
  ink: "#0b1220",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  soft: "#f8fafc",
  white: "#ffffff",
  orange: "#f97316",
  orangeDeep: "#c2410c",
  amber: "#f59e0b",
  navy: "#050e1a",
  navy2: "#0b1626",
  navy3: "#13233a",
  green: "#16a34a",
  greenSoft: "#f0fdf4",
  greenLine: "#86efac",
};

function hexToRgb(hex: string) {
  const v = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

// Mistura a cor com branco (amount = fração de branco). React PDF não tem color-mix.
function tint(hex: string, amount: number) {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c + (255 - c) * amount));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// Escurece a cor (amount = fração de preto): texto colorido legível sobre fundo claro.
function shade(hex: string, amount: number) {
  const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c * (1 - amount)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

// ─── Modelo ──────────────────────────────────────────────────────────────────

const TAG_LIMIT_QUICK_READ = 12; // mesmo limite de <TagList limit={12}> da Versão Tela
const TAG_LIMIT_TOPIC = 18; // <TopicTagList limit={18}>
const TAG_LIMIT_QUESTION = 8; // <TagList limit={8}>

export type RaioXPdfModel = ReturnType<typeof buildRaioXPdfModel>;

export function buildRaioXPdfModel(props: ReportProps) {
  const { analysis, questions = [] } = props;
  const summary = buildReportSummary(props);
  const { modules, total, averageDifficulty } = summary;
  const content = analysis.final_summary_text || analysis.summary_text || "";
  // Mesmo valor inicial de parecerDraft na Versão Tela; o PDF reflete o parecer salvo.
  const parecerDraft = cleanBlockText(content || analysis.teacher_notes || "");
  const parecer = parecerText(parecerDraft || content, analysis, PARECER_FALLBACK);

  return {
    title: String(analysis.title || "Raio-X de Provas"),
    recordId: String(analysis.id || ""),
    fileName: `${safeFileName(analysis.title || "RaioX")}.pdf`,
    identification: `${analysis.contest_name} — ${analysis.position_name} — ${analysis.board_name}`,
    generatedAt: summary.generatedAt,
    kpis: [
      { value: String(total), label: "Questões de Informática" },
      { value: String(modules.length), label: "Assuntos abordados" },
      { value: `${averageDifficulty ? averageDifficulty.toFixed(1) : "—"} / 5`, label: "Dificuldade média" },
      { value: String(summary.annulledCount), label: "Questões anuladas" },
    ],
    subjects: modules.map((mod, index) => ({
      rank: String(index + 1).padStart(2, "0"),
      name: mod.module,
      color: COLORS[index % COLORS.length],
      countLabel: `${mod.question_count} ${Number(mod.question_count) !== 1 ? "questões" : "questão"}`,
      percent: modulePercent(mod, total),
      difficulty: `${Number(mod.average_difficulty || 0).toFixed(1)} / 5`,
      difficultyLabel: difficultyLabel(mod.average_difficulty),
    })),
    profile: {
      distributionLabel: summary.distributionLabel,
      distributionText: summary.distributionText,
      difficultyLabel: difficultyLabel(averageDifficulty),
      difficultyText: `Média ${averageDifficulty ? averageDifficulty.toFixed(1) : "—"}/5`,
      moduleCount: modules.length,
      ...profileIndicators(modules.length, averageDifficulty),
    },
    quickRead: summary.quickRead,
    quickReadTags: unique(summary.allTags).slice(0, TAG_LIMIT_QUICK_READ),
    topics: modules.map((mod, index) => {
      const relatedNumbers = moduleRelatedNumbers(mod, questions);
      return {
        rank: String(index + 1).padStart(2, "0"),
        name: mod.module,
        color: COLORS[index % COLORS.length],
        meta: `${mod.question_count} ${Number(mod.question_count) !== 1 ? "questões" : "questão"}${relatedNumbers.length ? ` · Questões ${relatedNumbers.join(", ")}` : ""}`,
        tags: unique(moduleTags(mod, questions)).slice(0, TAG_LIMIT_TOPIC),
      };
    }),
    parecerParagraphs: paragraphList(parecer),
    questions: questions.map((q, index) => {
      const diff = Number(q.difficulty_level || 0);
      const alternatives = Array.isArray(q.alternatives) ? q.alternatives : [];
      return {
        id: q.id,
        number: `Q${String(questionDisplayNumber(q, index)).padStart(2, "0")}`,
        subject: q.subject_name || q.module_name || "Assunto não classificado",
        tags: unique(getQuestionTags(q)).slice(0, TAG_LIMIT_QUESTION),
        difficulty: diff ? `${diff.toFixed(1)} / 5` : "—",
        difficultyLabel: difficultyLabel(diff),
        difficultyColor: difficultyTone(diff),
        statement: cleanText(q.statement || "Enunciado não disponível."),
        alternatives: alternatives.map((alt, altIndex) => {
          const label = alternativeLabel(alt, altIndex);
          return { label, text: cleanText(alt.text || "Alternativa sem texto."), correct: isAlternativeCorrect(q, alt, label) };
        }),
        correct: questionCorrectLabel(q),
        hasImage: Boolean(q.has_image),
        annulled: Boolean(q.is_annulled),
      };
    }),
  };
}

// ─── Estimativas de altura (pt) ──────────────────────────────────────────────
// Ligeiramente superestimadas (largura média de caractere 0,52em; a Inter fica perto de
// 0,48em em português) e com uma linha extra por bloco. Servem só para decidir se um bloco
// pode ser indivisível; a garantia contra corte é renderWithOversizeGuard.

export function estimateTextHeight(text: string, width: number, fontSize: number, lineHeight: number) {
  const charsPerLine = Math.max(8, Math.floor(width / (fontSize * 0.52)));
  const lines = String(text || "")
    .split("\n")
    .reduce((sum, part) => sum + Math.max(1, Math.ceil(part.length / charsPerLine)), 0);
  return (lines + 1) * fontSize * lineHeight;
}

function estimateChipRows(tags: string[], width: number, fontSize: number) {
  if (!tags.length) return 0;
  const chipsWidth = tags.reduce((sum, tag) => sum + tag.length * fontSize * 0.62 + 18, 0);
  return Math.ceil(chipsWidth / width) + 1;
}

const Q_INNER_W = CONTENT_W - 30;
const TOPIC_COL_W = Math.floor((CONTENT_W - 32 - 14) / 2) - 2;

export function estimateQuestionHeadHeight(question: RaioXPdfModel["questions"][number]) {
  const header = 34 + estimateChipRows(question.tags, Q_INNER_W - 140, 7) * 15;
  return header + estimateTextHeight(question.statement, Q_INNER_W, 9.6, 1.45);
}

export function estimateQuestionHeight(question: RaioXPdfModel["questions"][number]) {
  const alternatives = question.alternatives.reduce((sum, alt) => sum + estimateAlternativeHeight(alt.text) + 4, 0);
  return estimateQuestionHeadHeight(question) + alternatives + 48;
}

export function estimateAlternativeHeight(text: string) {
  return estimateTextHeight(text, Q_INNER_W - 30, 9, 1.4) + 11;
}

export function estimateTopicHeight(topic: RaioXPdfModel["topics"][number]) {
  const colW = TOPIC_COL_W - 18;
  const tagHeights = topic.tags.map((tag) => estimateTextHeight(tag, colW, 9, 1.4) + 8);
  const column = tagHeights.reduce((s, x) => s + x, 0) / 2 + Math.max(0, ...tagHeights);
  return 64 + estimateTextHeight(topic.meta, CONTENT_W - 90, 8.5, 1.4) + column;
}

export function estimateQuickReadHeight(model: Pick<RaioXPdfModel, "quickRead" | "quickReadTags">) {
  return 60 + estimateTextHeight(model.quickRead, CONTENT_W - 70, 10.5, 1.6) + estimateChipRows(model.quickReadTags, CONTENT_W - 70, 7.5) * 18;
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const F = RAIO_X_PDF_FONT_FAMILY;

const s = StyleSheet.create({
  page: { paddingTop: PAD_TOP, paddingBottom: PAD_BOTTOM, paddingHorizontal: PAD_X, backgroundColor: C.white, fontFamily: F, fontWeight: 400, fontSize: 10, color: C.body },
  coverPage: { backgroundColor: C.navy, fontFamily: F, color: C.white, position: "relative" },

  runHeader: { position: "absolute", top: 26, left: PAD_X, right: PAD_X, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 8, borderBottomWidth: 0.8, borderBottomColor: C.line },
  runHeaderBrand: { flexDirection: "row", alignItems: "center", gap: 6 },
  runHeaderDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange },
  runHeaderTitle: { fontSize: 7.5, fontWeight: 700, color: C.ink, letterSpacing: 1.4 },
  runHeaderMeta: { fontSize: 7.5, color: C.muted, maxWidth: CONTENT_W * 0.62, textAlign: "right" },
  footer: { position: "absolute", bottom: 24, left: PAD_X, right: PAD_X, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTopWidth: 0.8, borderTopColor: C.line },
  footerBrand: { fontSize: 7.5, fontWeight: 700, color: C.ink },
  footerBrandTop: { color: C.orange },
  footerText: { fontSize: 7.5, color: C.muted },

  sectionHead: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14, marginTop: 6 },
  sectionNumber: { fontSize: 22, fontWeight: 700, color: C.orange, lineHeight: 1 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: C.ink, textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 1.2 },
  sectionSubtitle: { fontSize: 9, color: C.muted, marginTop: 3, lineHeight: 1.4 },
  sectionRule: { width: 34, height: 3, backgroundColor: C.orange, borderRadius: 2, marginTop: 6 },
  section: { marginBottom: 22 },

  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  kpiCard: { flex: 1, backgroundColor: C.navy2, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 10, alignItems: "center", borderTopWidth: 3, borderTopColor: C.orange },
  kpiValue: { fontSize: 20, fontWeight: 700, color: C.white, marginBottom: 4 },
  kpiLabel: { fontSize: 8, color: "#cbd5e1", textAlign: "center", lineHeight: 1.3 },

  distWrap: { marginBottom: 14 },
  distLabel: { fontSize: 7.5, fontWeight: 700, color: C.muted, letterSpacing: 1.2, marginBottom: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 7 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { fontSize: 7.5, color: C.body },

  subjectRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  subjectCard: { width: (CONTENT_W - 20) / 3, borderRadius: 10, borderWidth: 1, padding: 12, alignItems: "center" },
  subjectTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", alignSelf: "stretch", marginBottom: 8 },
  subjectRank: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, fontSize: 8, fontWeight: 700, textAlign: "center", paddingTop: 6 },
  subjectPct: { fontSize: 13, fontWeight: 700, color: C.ink },
  subjectName: { fontSize: 10, fontWeight: 700, color: C.ink, textTransform: "uppercase", textAlign: "center", lineHeight: 1.25, marginBottom: 6 },
  subjectCount: { fontSize: 8.5, color: C.body, marginBottom: 7 },
  barTrack: { alignSelf: "stretch", height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 9 },
  barFill: { height: 5, borderRadius: 3 },
  diffPill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, fontSize: 10, fontWeight: 700, marginBottom: 3 },
  diffLabel: { fontSize: 8, fontWeight: 700 },

  profileRow: { flexDirection: "row", gap: 10 },
  profileCard: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.soft, padding: 12, alignItems: "center" },
  profileEyebrow: { fontSize: 6.8, fontWeight: 700, color: C.muted, letterSpacing: 1.1, textTransform: "uppercase", textAlign: "center" },
  profileValue: { fontSize: 13, fontWeight: 700, color: C.ink, marginVertical: 6, textAlign: "center" },
  profileText: { fontSize: 8, color: C.body, textAlign: "center", lineHeight: 1.35 },
  profileAccent: { width: 18, height: 3, borderRadius: 2, backgroundColor: C.orange, marginBottom: 8 },

  callout: { marginTop: 14, borderRadius: 10, backgroundColor: tint(C.orange, 0.92), borderLeftWidth: 4, borderLeftColor: C.orange, padding: 16 },
  calloutTitle: { fontSize: 10, fontWeight: 700, color: C.orangeDeep, letterSpacing: 1, marginBottom: 6 },
  calloutText: { fontSize: 10.5, color: C.ink, lineHeight: 1.6 },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  chip: { fontSize: 7, fontWeight: 700, color: C.body, backgroundColor: C.white, borderWidth: 0.8, borderColor: tint(C.body, 0.7), borderRadius: 999, paddingVertical: 3, paddingHorizontal: 7 },

  topicCard: { borderRadius: 10, borderWidth: 1, padding: 16, marginBottom: 10 },
  topicHead: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 10 },
  topicRank: { width: 26, height: 26, borderRadius: 7, borderWidth: 1, fontSize: 9, fontWeight: 700, textAlign: "center", paddingTop: 8 },
  topicName: { fontSize: 11, fontWeight: 700, color: C.ink, textTransform: "uppercase", lineHeight: 1.25 },
  topicMeta: { fontSize: 8.5, color: C.muted, marginTop: 3, lineHeight: 1.4 },
  topicTags: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  topicTag: { width: TOPIC_COL_W, flexDirection: "row", gap: 6, paddingVertical: 4, borderTopWidth: 0.6, borderTopColor: C.line },
  topicArrow: { fontSize: 9, fontWeight: 700, width: 10 },
  topicTagText: { flex: 1, fontSize: 9, fontWeight: 700, color: C.ink, lineHeight: 1.4 },
  empty: { fontSize: 9, color: C.muted },

  parecerBox: { borderLeftWidth: 3, borderLeftColor: C.orange, paddingLeft: 16, paddingBottom: 10 },
  parecerParagraph: { fontSize: 10.5, color: C.ink, lineHeight: 1.65 },
  steps: { flexDirection: "row", marginTop: 12, borderRadius: 10, overflow: "hidden", backgroundColor: C.navy2 },
  step: { flex: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: "center", borderRightWidth: 0.6, borderRightColor: C.navy3 },
  stepNumber: { fontSize: 9, fontWeight: 700, color: C.orange, marginBottom: 4 },
  stepText: { fontSize: 7.5, fontWeight: 700, color: C.white, textTransform: "uppercase", textAlign: "center", letterSpacing: 0.4 },

  qCard: { borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10, position: "relative" },
  qCardAnnulled: { borderColor: tint(C.orange, 0.45), backgroundColor: tint(C.orange, 0.96) },
  qHead: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingBottom: 8, marginBottom: 8, borderBottomWidth: 0.8, borderBottomColor: C.line },
  qNumber: { width: 32, height: 32, borderRadius: 8, backgroundColor: C.orange, color: C.navy, fontSize: 10, fontWeight: 700, textAlign: "center", paddingTop: 10 },
  qSubject: { fontSize: 10, fontWeight: 700, color: C.ink, textTransform: "uppercase", lineHeight: 1.25 },
  qDiff: { width: 82, alignItems: "flex-end" },
  qDiffValue: { fontSize: 11, fontWeight: 700 },
  qDiffLabel: { fontSize: 7.5, color: C.muted, marginTop: 2 },
  qAnnulledBadge: { marginTop: 4, fontSize: 7, fontWeight: 700, color: C.orangeDeep, letterSpacing: 1 },
  qStatement: { fontSize: 9.6, color: C.ink, lineHeight: 1.45, marginBottom: 8 },
  alt: { flexDirection: "row", gap: 8, borderRadius: 7, borderWidth: 0.8, borderColor: C.line, backgroundColor: C.soft, paddingVertical: 4.5, paddingHorizontal: 8, marginBottom: 4 },
  altCorrect: { borderColor: C.greenLine, backgroundColor: C.greenSoft },
  altLetter: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.line, color: C.ink, fontSize: 7.5, fontWeight: 700, textAlign: "center", paddingTop: 4 },
  altLetterCorrect: { backgroundColor: C.green, color: C.white },
  altText: { flex: 1, fontSize: 9, color: C.body, lineHeight: 1.4 },
  qFoot: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 3 },
  qFootChip: { fontSize: 7.5, color: C.body, backgroundColor: C.soft, borderWidth: 0.8, borderColor: C.line, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  qFootStrong: { fontWeight: 700, color: C.orangeDeep },
  watermark: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  watermarkText: { fontSize: 64, fontWeight: 700, color: C.orange, opacity: 0.09, letterSpacing: 6, transform: "rotate(-14deg)" },

  closing: { marginTop: 10, borderRadius: 14, backgroundColor: C.navy, flexDirection: "row", overflow: "hidden", minHeight: 250 },
  closingVisual: { width: 170, position: "relative", alignItems: "center", justifyContent: "flex-end" },
  closingCopy: { flex: 1, paddingVertical: 26, paddingRight: 24, paddingLeft: 6, justifyContent: "center" },
  closingTitle: { fontSize: 19, fontWeight: 700, color: C.white, textTransform: "uppercase", lineHeight: 1.15, marginBottom: 10 },
  closingText: { fontSize: 10, color: "#dbe7f7", lineHeight: 1.6, marginBottom: 14 },
  pillars: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  pillar: { width: "48%", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.navy3, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8 },
  pillarDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.orange },
  pillarText: { fontSize: 7.5, fontWeight: 700, color: C.white, textTransform: "uppercase", letterSpacing: 0.4 },
  closingSmall: { fontSize: 7.5, color: "#a9bed8" },
});

// ─── Componentes ─────────────────────────────────────────────────────────────

const h = React.createElement;

// Sem hifenização (o padrão do React PDF usa regras do inglês e partiria palavras em
// português). Só palavras muito longas (URLs, códigos) são divididas para não estourar a linha.
function noHyphenation(word: string) {
  if (word.length <= 28) return [word];
  const parts: string[] = [];
  for (let i = 0; i < word.length; i += 20) parts.push(word.slice(i, i + 20));
  return parts;
}

type TProps = React.ComponentProps<typeof Text>;
function T(props: TProps) {
  return h(Text, { hyphenationCallback: noHyphenation, ...props });
}

function RunningHeader({ identification }: { identification: string }) {
  return h(
    View,
    { style: s.runHeader, fixed: true },
    h(View, { style: s.runHeaderBrand }, h(View, { style: s.runHeaderDot }), h(T, { style: s.runHeaderTitle }, "RAIO-X DE PROVAS")),
    h(T, { style: s.runHeaderMeta }, identification),
  );
}

function Footer() {
  return h(
    View,
    { style: s.footer, fixed: true },
    h(T, { style: s.footerBrand }, "ESTUDO", h(T, { style: s.footerBrandTop }, "TOP"), " SIMULADOS"),
    h(T, { style: s.footerText, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Página ${pageNumber - 1} de ${totalPages - 1}` }),
  );
}

function SectionHeading({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return h(
    View,
    { style: s.sectionHead, wrap: false },
    h(T, { style: s.sectionNumber }, number),
    h(
      View,
      { style: { flex: 1 } },
      h(T, { style: s.sectionTitle }, title),
      subtitle ? h(T, { style: s.sectionSubtitle }, subtitle) : null,
      h(View, { style: s.sectionRule }),
    ),
  );
}

// Título nunca fica sozinho no pé da página: vai num grupo indivisível com o primeiro
// bloco da seção quando esse bloco tem altura limitada. (minPresenceAhead do React PDF
// mostrou comportamento inconsistente com vizinhos indivisíveis nos testes.)
function KeepTogether({ children, enabled = true }: { children?: React.ReactNode; enabled?: boolean }) {
  return h(View, { wrap: !enabled }, children);
}

function Chips({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return h(View, { style: s.chips }, ...tags.map((tag) => h(T, { key: tag, style: s.chip }, tag)));
}

function CoverLogo() {
  return h(
    View,
    { style: { flexDirection: "row", alignItems: "center", gap: 10 } },
    h(View, { style: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: C.orange, alignItems: "center", justifyContent: "center" } }, h(View, { style: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.4, borderColor: C.amber } })),
    h(
      View,
      null,
      h(T, { style: { fontSize: 17, fontWeight: 700, color: C.white, letterSpacing: -0.4 } }, "ESTUDO", h(T, { style: { color: C.orange } }, "TOP")),
      h(T, { style: { fontSize: 6.5, fontWeight: 700, color: "#cbd5e1", letterSpacing: 3.2 } }, "SIMULADOS"),
    ),
  );
}

const COVER_BADGES = ["Análise completa", "Dados confiáveis", "Insights estratégicos", "Foco na aprovação"];

function ComposedCover({ model, assets }: { model: RaioXPdfModel; assets: RaioXPdfResolvedAssets }) {
  const bannerH = 300;
  return h(
    Page,
    { size: "A4", style: s.coverPage },
    // Banner superior com o emblema oficial do Raio-X.
    assets.coverBanner ? h(Image, { src: assets.coverBanner, style: { position: "absolute", top: 0, left: 0, width: PAGE_W, height: bannerH, objectFit: "cover", objectPosition: "right center" } }) : null,
    h(
      Svg,
      { style: { position: "absolute", top: 0, left: 0 }, width: PAGE_W, height: bannerH + 2, viewBox: `0 0 ${PAGE_W} ${bannerH + 2}` },
      h(Defs, null,
        h(LinearGradient, { id: "fadeDown", x1: "0", y1: "0", x2: "0", y2: "1" }, h(Stop, { offset: "0.45", stopColor: C.navy, stopOpacity: 0 }), h(Stop, { offset: "1", stopColor: C.navy, stopOpacity: 1 })),
        h(LinearGradient, { id: "fadeLeft", x1: "0", y1: "0", x2: "1", y2: "0" }, h(Stop, { offset: "0", stopColor: C.navy, stopOpacity: 0.85 }), h(Stop, { offset: "0.55", stopColor: C.navy, stopOpacity: 0 })),
      ),
      h(Rect, { x: 0, y: 0, width: PAGE_W, height: bannerH + 2, fill: "url(#fadeLeft)" }),
      h(Rect, { x: 0, y: 0, width: PAGE_W, height: bannerH + 2, fill: "url(#fadeDown)" }),
    ),
    // Brilho laranja atrás do mascote.
    h(
      Svg,
      { style: { position: "absolute", right: -40, bottom: -30 }, width: 320, height: 320, viewBox: "0 0 320 320" },
      h(Defs, null, h(RadialGradient, { id: "glow", cx: "0.5", cy: "0.5", r: "0.5" }, h(Stop, { offset: "0", stopColor: C.orange, stopOpacity: 0.42 }), h(Stop, { offset: "1", stopColor: C.orange, stopOpacity: 0 }))),
      h(Circle, { cx: 160, cy: 160, r: 160, fill: "url(#glow)" }),
    ),
    assets.mascot ? h(Image, { src: assets.mascot, style: { position: "absolute", right: 14, bottom: 0, width: 190, height: 285, objectFit: "contain" } }) : null,
    h(View, { style: { position: "absolute", top: 40, left: 48 } }, h(CoverLogo)),
    h(
      View,
      { style: { position: "absolute", top: bannerH - 34, left: 48, width: 330 } },
      h(T, { style: { fontSize: 7.5, fontWeight: 700, color: C.orange, letterSpacing: 2.6, marginBottom: 10 } }, "RELATÓRIO FINAL"),
      h(T, { style: { fontSize: 48, fontWeight: 700, color: C.white, lineHeight: 0.98, letterSpacing: -1.6 } }, "RAIO-X DE"),
      h(T, { style: { fontSize: 48, fontWeight: 700, color: C.amber, lineHeight: 0.98, letterSpacing: -1.6, marginBottom: 16 } }, "PROVAS"),
      h(T, { style: { fontSize: 14, fontWeight: 700, color: C.white, lineHeight: 1.25, marginBottom: 10 } }, "Análise estratégica da prova de Informática"),
      h(T, { style: { fontSize: 10.5, fontWeight: 700, color: "#fb923c", lineHeight: 1.4, marginBottom: 12 } }, model.identification),
      h(T, { style: { fontSize: 9.5, color: "#c8d7ef", lineHeight: 1.65, marginBottom: 18 } }, "Um relatório completo e objetivo para entender como a banca cobrou cada assunto e direcionar seus estudos com precisão."),
      h(
        View,
        { style: { flexDirection: "row", flexWrap: "wrap", gap: 6 } },
        ...COVER_BADGES.map((badge) =>
          h(
            View,
            { key: badge, style: { width: 160, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 0.8, borderColor: "#24364f", backgroundColor: C.navy2, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 9 } },
            h(View, { style: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange } }),
            h(T, { style: { fontSize: 8, fontWeight: 700, color: "#e2e8f0" } }, badge),
          ),
        ),
      ),
    ),
    h(
      View,
      { style: { position: "absolute", left: 48, bottom: 40, width: 320, borderTopWidth: 0.8, borderTopColor: "#24364f", paddingTop: 10 } },
      h(T, { style: { fontSize: 8, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.45 } }, model.title),
      h(T, { style: { fontSize: 7.5, color: "#94a3b8", marginTop: 3 } }, `EstudoTOP Simulados — relatório gerado em ${model.generatedAt}`),
    ),
  );
}

// Selo de identificação na faixa preta abaixo dos ícones do rodapé da arte oficial
// (y ≥ 1420 px de 1491 — região sem elementos, medida na arte). Nome entre filetes
// laranja, como o logo no topo da arte; ID menor, em cinza. Sem caixa: o fundo já é preto.
function CoverSeal({ model }: { model: RaioXPdfModel }) {
  return h(
    View,
    { style: { position: "absolute", left: 60, right: 60, bottom: 9, alignItems: "center" } },
    h(
      View,
      { style: { flexDirection: "row", alignItems: "center", gap: 9, maxWidth: PAGE_W - 120 } },
      h(View, { style: { width: 26, height: 0.8, backgroundColor: C.orange } }),
      h(T, { style: { flexShrink: 1, fontSize: 7.6, fontWeight: 700, color: C.white, letterSpacing: 0.5, textAlign: "center", lineHeight: 1.3 } }, model.title),
      h(View, { style: { width: 26, height: 0.8, backgroundColor: C.orange } }),
    ),
    model.recordId ? h(T, { style: { marginTop: 2.5, fontSize: 6, color: "#8a8f98", letterSpacing: 0.6 } }, `ID: ${model.recordId}`) : null,
  );
}

function ImageCover({ model, src }: { model: RaioXPdfModel; src: string }) {
  return h(
    Page,
    { size: "A4", style: s.coverPage },
    // Proporção da arte (1055×1491) praticamente igual à do A4: "cover" não distorce e o corte é < 0,1%.
    // `fixed`: imagem de página inteira fora da lógica de quebra. Sem isso o React PDF a trata como
    // bloco maior que a área disponível (aviso que a guarda de paginação interpreta como corte).
    // A página da capa é única, então `fixed` não repete a imagem.
    h(Image, { fixed: true, src, style: { position: "absolute", top: 0, left: 0, width: PAGE_W, height: PAGE_H, objectFit: "cover" } }),
    h(CoverSeal, { model }),
  );
}

function DistributionChart({ subjects }: { subjects: RaioXPdfModel["subjects"] }) {
  const totalPct = subjects.reduce((sum, item) => sum + item.percent, 0) || 1;
  let x = 0;
  return h(
    View,
    { style: s.distWrap, wrap: false },
    h(T, { style: s.distLabel }, "DISTRIBUIÇÃO DA PROVA"),
    h(
      Svg,
      { width: CONTENT_W, height: 14, viewBox: `0 0 ${CONTENT_W} 14` },
      h(Rect, { x: 0, y: 0, width: CONTENT_W, height: 14, rx: 4, ry: 4, fill: C.line }),
      ...subjects.map((item) => {
        const w = (item.percent / totalPct) * CONTENT_W;
        const rect = h(Rect, { key: item.rank, x, y: 0, width: Math.max(0, w - 1.5), height: 14, fill: item.color });
        x += w;
        return rect;
      }),
    ),
    h(
      View,
      { style: s.legend },
      ...subjects.map((item) => h(View, { key: item.rank, style: s.legendItem }, h(View, { style: [s.legendDot, { backgroundColor: item.color }] }), h(T, { style: s.legendText }, `${item.name} · ${item.percent}%`))),
    ),
  );
}

function SubjectCard({ subject }: { subject: RaioXPdfModel["subjects"][number] }) {
  return h(
    View,
    { style: [s.subjectCard, { borderColor: tint(subject.color, 0.55), backgroundColor: tint(subject.color, 0.94) }], wrap: false },
    h(
      View,
      { style: s.subjectTop },
      h(T, { style: [s.subjectRank, { color: shade(subject.color, 0.3), borderColor: tint(subject.color, 0.35) }] }, subject.rank),
      h(T, { style: s.subjectPct }, `${subject.percent}%`),
    ),
    h(T, { style: s.subjectName }, subject.name),
    h(T, { style: s.subjectCount }, `${subject.countLabel} · ${subject.percent}% da prova`),
    h(View, { style: s.barTrack }, h(View, { style: [s.barFill, { width: `${Math.max(2, Math.min(100, subject.percent))}%`, backgroundColor: subject.color }] })),
    h(T, { style: [s.diffPill, { color: shade(subject.color, 0.3), backgroundColor: tint(subject.color, 0.82) }] }, subject.difficulty),
    h(T, { style: [s.diffLabel, { color: shade(subject.color, 0.3) }] }, subject.difficultyLabel),
  );
}

function ProfileCard({ eyebrow, value, text }: { eyebrow: string; value: string; text: string }) {
  return h(View, { style: s.profileCard }, h(View, { style: s.profileAccent }), h(T, { style: s.profileEyebrow }, eyebrow), h(T, { style: s.profileValue }, value), h(T, { style: s.profileText }, text));
}

// Divide um texto longo em abertura + restante, cortando em fim de frase perto de `target`
// caracteres (ou no último espaço, se não houver frase). Nada é descartado: abertura e
// restante somam o texto original. Usado para que um título/cabeçalho nunca fique sozinho
// no pé da página quando o bloco que o acompanha é grande demais para ser indivisível.
export function splitLead(text: string, target = 420): [string, string] {
  if (text.length <= target * 1.4) return [text, ""];
  const windowText = text.slice(0, target + 200);
  const sentenceEnd = /[.!?;:](?=\s)/g;
  let cut = -1;
  let match: RegExpExecArray | null;
  while ((match = sentenceEnd.exec(windowText))) {
    if (match.index < target * 0.4) continue;
    cut = match.index + 1;
    if (match.index >= target) break;
  }
  if (cut < 0) {
    const space = text.lastIndexOf(" ", target);
    cut = space > target * 0.5 ? space : target;
  }
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

// Um card quebrável é desenhado como duas Views encostadas (topo indivisível + restante
// quebrável) que formam um único card visual.
const SPLIT_TOP = { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0, paddingBottom: 0 };
const SPLIT_REST = { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: 0 };

type Blocks = { lead: React.ReactElement; rest: React.ReactElement[] };

export function isTopicUnbreakable(topic: RaioXPdfModel["topics"][number], safeMode: boolean) {
  return !safeMode && estimateTopicHeight(topic) <= UNBREAKABLE_LIMIT;
}

const TOPIC_LEAD_TAGS = 6;

function TopicTags({ tags, color }: { tags: string[]; color: string }) {
  return h(View, { style: s.topicTags }, ...tags.map((tag) => h(View, { key: tag, style: s.topicTag, wrap: false }, h(T, { style: [s.topicArrow, { color }] }, "→"), h(T, { style: s.topicTagText }, tag))));
}

function topicBlocks(topic: RaioXPdfModel["topics"][number], safeMode: boolean): Blocks {
  const cardStyle = [s.topicCard, { borderColor: tint(topic.color, 0.55), backgroundColor: tint(topic.color, 0.95) }];
  const head = h(
    View,
    { style: s.topicHead, wrap: false },
    h(T, { style: [s.topicRank, { color: shade(topic.color, 0.3), borderColor: tint(topic.color, 0.35), backgroundColor: tint(topic.color, 0.86) }] }, topic.rank),
    h(View, { style: { flex: 1 } }, h(T, { style: s.topicName }, topic.name), h(T, { style: s.topicMeta }, topic.meta)),
  );
  const empty = h(T, { style: s.empty }, "Nenhuma tag específica informada para este assunto.");
  if (isTopicUnbreakable(topic, safeMode)) {
    return { lead: h(View, { style: cardStyle, wrap: false }, head, topic.tags.length ? h(TopicTags, { tags: topic.tags, color: topic.color }) : empty), rest: [] };
  }
  const leadTags = topic.tags.slice(0, TOPIC_LEAD_TAGS);
  const restTags = topic.tags.slice(TOPIC_LEAD_TAGS);
  return {
    lead: h(View, { style: [...cardStyle, SPLIT_TOP], wrap: false }, head, leadTags.length ? h(TopicTags, { tags: leadTags, color: topic.color }) : empty),
    rest: [h(View, { key: `${topic.rank}-rest`, style: [...cardStyle, SPLIT_REST] }, restTags.length ? h(TopicTags, { tags: restTags, color: topic.color }) : null)],
  };
}

export function isQuestionUnbreakable(question: RaioXPdfModel["questions"][number], safeMode: boolean) {
  return !safeMode && estimateQuestionHeight(question) <= QUESTION_UNBREAKABLE_LIMIT;
}

function questionBlocks(question: RaioXPdfModel["questions"][number], safeMode: boolean): Blocks {
  const cardStyle = question.annulled ? [s.qCard, s.qCardAnnulled] : [s.qCard];
  const head = h(
    View,
    { style: s.qHead, wrap: false },
    h(T, { style: s.qNumber }, question.number),
    h(
      View,
      { style: { flex: 1 } },
      h(T, { style: s.qSubject }, question.subject),
      question.annulled ? h(T, { style: s.qAnnulledBadge }, "QUESTÃO ANULADA") : null,
      h(Chips, { tags: question.tags }),
    ),
    h(View, { style: s.qDiff }, h(T, { style: [s.qDiffValue, { color: question.difficultyColor }] }, question.difficulty), h(T, { style: s.qDiffLabel }, question.difficultyLabel)),
  );
  const alternatives = question.alternatives.map((alt, index) =>
    h(
      View,
      {
        key: `${question.id}-${alt.label}-${index}`,
        style: alt.correct ? [s.alt, s.altCorrect] : s.alt,
        wrap: safeMode || estimateAlternativeHeight(alt.text) > ALTERNATIVE_UNBREAKABLE_LIMIT,
      },
      h(T, { style: alt.correct ? [s.altLetter, s.altLetterCorrect] : s.altLetter }, alt.label),
      h(T, { style: s.altText }, alt.text),
    ),
  );
  const foot = h(
    View,
    { key: "foot", style: s.qFoot, wrap: false },
    h(T, { style: s.qFootChip }, "Gabarito: ", h(T, { style: s.qFootStrong }, question.correct)),
    question.hasImage ? h(T, { style: s.qFootChip }, "Com imagem") : null,
  );

  if (isQuestionUnbreakable(question, safeMode)) {
    return {
      lead: h(
        View,
        { style: cardStyle, wrap: false },
        // Marca d'água só em card indivisível: num card que atravessa páginas a posição absoluta não é confiável.
        question.annulled ? h(View, { style: s.watermark }, h(T, { style: s.watermarkText }, "ANULADA")) : null,
        head,
        h(T, { style: s.qStatement }, question.statement),
        ...alternatives,
        foot,
      ),
      rest: [],
    };
  }

  // Card quebrável: topo indivisível com cabeçalho + enunciado (ou a abertura do enunciado,
  // se ele sozinho passar de meia página); o restante quebra entre alternativas.
  const statementFits = estimateQuestionHeadHeight(question) <= HEAD_GROUP_LIMIT;
  const [leadText, restText] = statementFits ? [question.statement, ""] : splitLead(question.statement);
  return {
    lead: h(View, { style: [...cardStyle, SPLIT_TOP], wrap: false }, head, h(T, { style: [s.qStatement, restText ? { marginBottom: 0 } : {}] }, leadText)),
    rest: [h(View, { key: `${question.id}-rest`, style: [...cardStyle, SPLIT_REST] }, restText ? h(T, { style: s.qStatement }, restText) : null, ...alternatives, foot)],
  };
}

const STEPS = ["Estude com estratégia", "Treine mais questões", "Revise e consolide", "Prepare-se completo"];
const PILLARS = ["Estude com foco", "Leia os dados", "Treine com estratégia", "Busque evolução"];

function Closing({ model, assets }: { model: RaioXPdfModel; assets: RaioXPdfResolvedAssets }) {
  return h(
    View,
    { style: s.closing, wrap: false },
    h(
      View,
      { style: s.closingVisual },
      h(
        Svg,
        { style: { position: "absolute", left: -30, bottom: -50 }, width: 240, height: 240, viewBox: "0 0 240 240" },
        h(Defs, null, h(RadialGradient, { id: "closingGlow", cx: "0.5", cy: "0.5", r: "0.5" }, h(Stop, { offset: "0", stopColor: C.orange, stopOpacity: 0.45 }), h(Stop, { offset: "1", stopColor: C.orange, stopOpacity: 0 }))),
        h(Circle, { cx: 120, cy: 120, r: 120, fill: "url(#closingGlow)" }),
      ),
      assets.mascot ? h(Image, { src: assets.mascot, style: { width: 150, height: 225, objectFit: "contain" } }) : null,
    ),
    h(
      View,
      { style: s.closingCopy },
      h(T, { style: s.closingTitle }, "Informação é poder. Estratégia é aprovação."),
      h(T, { style: s.closingText }, "O Raio-X transforma a prova em direção: mostra onde a banca concentrou a cobrança, revela os pontos de atenção e entrega ao aluno um caminho mais inteligente para revisar."),
      h(View, { style: s.pillars }, ...PILLARS.map((pillar) => h(View, { key: pillar, style: s.pillar }, h(View, { style: s.pillarDot }), h(T, { style: s.pillarText }, pillar)))),
      h(T, { style: s.closingSmall }, `EstudoTOP Simulados — relatório gerado em ${model.generatedAt}`),
    ),
  );
}

function chunk<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function ParecerParagraph({ text, continues = false }: { text: string; continues?: boolean }) {
  return h(View, { style: continues ? [s.parecerBox, { paddingBottom: 0 }] : s.parecerBox }, h(T, { style: s.parecerParagraph, orphans: 3, widows: 3 }, text));
}

export function RaioXReportDocument({ model, assets = {}, safeMode = false }: { model: RaioXPdfModel; assets?: RaioXPdfResolvedAssets; safeMode?: boolean }) {
  const quickReadUnbreakable = !safeMode && estimateQuickReadHeight(model) <= UNBREAKABLE_LIMIT;
  const subjectRows = chunk(model.subjects, 3);
  const subjectRow = (row: RaioXPdfModel["subjects"], key: number) => h(View, { key, style: s.subjectRow, wrap: false }, ...row.map((subject) => h(SubjectCard, { key: subject.rank, subject })));
  const topics = model.topics.map((topic) => topicBlocks(topic, safeMode));
  const questions = model.questions.map((question) => questionBlocks(question, safeMode));
  const [firstParagraph = "", ...otherParagraphs] = model.parecerParagraphs;
  const [parecerLead, parecerRest] = estimateTextHeight(firstParagraph, CONTENT_W - 19, 10.5, 1.65) <= HEAD_GROUP_LIMIT ? [firstParagraph, ""] : splitLead(firstParagraph);
  // Títulos de seção sempre agrupados com o topo indivisível do primeiro bloco.
  const withKeys = (blocks: Blocks[], prefix: string) => blocks.flatMap((b, i) => [React.cloneElement(b.lead, { key: `${prefix}-${i}` }), ...b.rest]);

  return h(
    Document,
    { title: model.title, author: "EstudoTOP Simulados", subject: `Raio-X de Provas — ${model.identification}`, creator: "EstudoTOP Simulados", producer: "EstudoTOP Simulados", language: "pt-BR" },
    assets.coverImage ? h(ImageCover, { model, src: assets.coverImage }) : h(ComposedCover, { model, assets }),
    h(
      Page,
      { size: "A4", style: s.page },
      h(RunningHeader, { identification: model.identification }),
      h(Footer),

      h(View, { style: s.kpiRow, wrap: false }, ...model.kpis.map((kpi) => h(View, { key: kpi.label, style: s.kpiCard }, h(T, { style: s.kpiValue }, kpi.value), h(T, { style: s.kpiLabel }, kpi.label)))),

      h(
        View,
        { style: s.section },
        h(
          KeepTogether,
          null,
          h(SectionHeading, { number: "01", title: "Assuntos cobrados na prova", subtitle: "Distribuição visual dos assuntos cobrados na prova." }),
          model.subjects.length ? h(DistributionChart, { subjects: model.subjects }) : null,
          subjectRows[0] ? subjectRow(subjectRows[0], 0) : null,
        ),
        ...subjectRows.slice(1).map((row, index) => subjectRow(row, index + 1)),
      ),

      h(
        View,
        { style: s.section },
        h(
          KeepTogether,
          null,
          h(SectionHeading, { number: "02", title: "Perfil da prova", subtitle: "Indicadores principais do comportamento da cobrança." }),
          h(
            View,
            { style: s.profileRow },
            h(ProfileCard, { eyebrow: "Distribuição", value: model.profile.distributionLabel, text: model.profile.distributionText }),
            h(ProfileCard, { eyebrow: "Dificuldade geral", value: model.profile.difficultyLabel, text: model.profile.difficultyText }),
            h(ProfileCard, { eyebrow: "Diversidade temática", value: model.profile.diversityLabel, text: `${model.profile.moduleCount} assuntos mapeados` }),
            h(ProfileCard, { eyebrow: "Nível de exigência", value: model.profile.demandLabel, text: model.profile.demandText }),
          ),
        ),
        h(View, { style: s.callout, wrap: !quickReadUnbreakable }, h(T, { style: s.calloutTitle }, "LEITURA RÁPIDA"), h(T, { style: s.calloutText }, model.quickRead), h(Chips, { tags: model.quickReadTags })),
      ),

      h(
        View,
        { style: s.section },
        h(
          KeepTogether,
          null,
          h(SectionHeading, { number: "03", title: "O que foi cobrado dentro de cada assunto", subtitle: "Tags consolidadas a partir da classificação da IA, dos tópicos revisados e dos ajustes feitos pelo professor." }),
          topics[0]?.lead ?? null,
        ),
        ...(topics[0]?.rest ?? []),
        ...withKeys(topics.slice(1), "topic"),
      ),

      h(
        View,
        { style: s.section },
        h(KeepTogether, null, h(SectionHeading, { number: "04", title: "Parecer EstudoTOP" }), parecerLead ? h(ParecerParagraph, { text: parecerLead, continues: Boolean(parecerRest) }) : null),
        parecerRest ? h(ParecerParagraph, { text: parecerRest }) : null,
        ...otherParagraphs.map((paragraph, index) => h(ParecerParagraph, { key: index, text: paragraph })),
        h(View, { style: s.steps, wrap: false }, ...STEPS.map((step, index) => h(View, { key: step, style: index === STEPS.length - 1 ? [s.step, { borderRightWidth: 0 }] : s.step }, h(T, { style: s.stepNumber }, String(index + 1).padStart(2, "0")), h(T, { style: s.stepText }, step)))),
      ),

      h(
        View,
        { style: s.section },
        h(
          KeepTogether,
          null,
          h(SectionHeading, { number: "05", title: "Lista de questões da prova", subtitle: "Visão final das questões analisadas, com assunto, tags, dificuldade, imagem e gabarito sugerido." }),
          questions[0]?.lead ?? h(T, { style: s.empty }, "Nenhuma questão disponível para listar neste relatório."),
        ),
        ...(questions[0]?.rest ?? []),
        ...withKeys(questions.slice(1), "question"),
      ),

      h(Closing, { model, assets }),
    ),
  );
}

// ─── Geração ─────────────────────────────────────────────────────────────────

let registeredFontBase: string | null = null;

// base: "/fonts/" no navegador; caminho de diretório local em testes Node.
export function registerRaioXPdfFonts(base = "/fonts/") {
  if (registeredFontBase === base) return;
  Font.register({
    family: RAIO_X_PDF_FONT_FAMILY,
    fonts: [
      { src: `${base}Inter-Regular.ttf`, fontWeight: 400 },
      { src: `${base}Inter-Bold.ttf`, fontWeight: 700 },
    ],
  });
  registeredFontBase = base;
}

const OVERSIZE_WARNING = "can't wrap between pages and it's bigger than available page height";

export const RAIO_X_PDF_OVERSIZE_ERROR = "O PDF não pôde ser paginado sem cortar conteúdo. Nenhum arquivo foi gerado.";

// Executa a renderização observando o aviso do React PDF de bloco indivisível maior que a
// página. Primeira tentativa: layout editorial normal. Se houver aviso, refaz em modo
// seguro (blocos variáveis quebráveis). Se ainda houver aviso, falha explicitamente.
export async function renderWithOversizeGuard<T>(render: (safeMode: boolean) => Promise<T>) {
  const attempt = async (safeMode: boolean) => {
    let oversize = false;
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (args.some((arg) => typeof arg === "string" && arg.includes(OVERSIZE_WARNING))) oversize = true;
      else originalWarn(...args);
    };
    try {
      const output = await render(safeMode);
      return { output, oversize };
    } finally {
      console.warn = originalWarn;
    }
  };
  const first = await attempt(false);
  if (!first.oversize) return { output: first.output, safeMode: false };
  const second = await attempt(true);
  if (second.oversize) throw new Error(RAIO_X_PDF_OVERSIZE_ERROR);
  return { output: second.output, safeMode: true };
}

type ImageLoadOptions = { maxWidth: number; format: "image/jpeg" | "image/png"; quality?: number; background?: string };

// Carrega a imagem e a reduz/recodifica no navegador antes de embutir no PDF (os PNGs
// oficiais têm ~2 MB cada). Retorna null em falha: o PDF segue sem aquela imagem.
async function loadImageForPdf(src: string, options: ImageLoadOptions): Promise<string | null> {
  try {
    const response = await fetch(src, { cache: "reload" });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, options.maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    if (options.background) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL(options.format, options.quality);
  } catch {
    return null;
  }
}

export const RAIO_X_PDF_IMAGE_OPTIONS: Record<RaioXPdfAssetKey, ImageLoadOptions> = {
  coverImage: { maxWidth: 1654, format: "image/jpeg", quality: 0.9, background: C.navy },
  coverBanner: { maxWidth: 1600, format: "image/jpeg", quality: 0.86, background: C.navy },
  mascot: { maxWidth: 560, format: "image/png" },
};

export async function loadRaioXPdfAssets() {
  const assets: RaioXPdfResolvedAssets = {};
  const missing: string[] = [];
  const load = async (key: RaioXPdfAssetKey) => {
    const src = RAIO_X_PDF_ASSETS[key];
    if (!src) return;
    const data = await loadImageForPdf(src, RAIO_X_PDF_IMAGE_OPTIONS[key]);
    assets[key] = data;
    if (!data) missing.push(src);
  };
  await Promise.all([load("coverImage"), load("mascot")]);
  // O banner da capa composta só é necessário quando a capa oficial não está disponível.
  if (!assets.coverImage) await load("coverBanner");
  return { assets, missing };
}

export async function generateRaioXReportPdf(props: ReportProps) {
  registerRaioXPdfFonts();
  const model = buildRaioXPdfModel(props);
  const { assets, missing } = await loadRaioXPdfAssets();
  const { output: blob, safeMode } = await renderWithOversizeGuard((safe) =>
    pdf(h(RaioXReportDocument, { model, assets, safeMode: safe }) as React.ReactElement<React.ComponentProps<typeof Document>>).toBlob(),
  );
  return { blob, fileName: model.fileName, missingAssets: missing, safeMode };
}

export function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
