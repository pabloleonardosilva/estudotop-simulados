"use client";

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

const OWL_MARK = "\u{1F989}\uFE0F";

// ─── Paleta ──────────────────────────────────────────────────────────────────
const C = {
  orange: "#f97316",
  orangeLight: "#fff7ed",
  orangeBorder: "#fed7aa",
  orangeDark: "#ea580c",
  orangeDeep: "#9a3412",
  green: "#10b981",
  greenLight: "#f0fdf4",
  greenBorder: "#86efac",
  greenText: "#166534",
  red: "#ef4444",
  redLight: "#fef2f2",
  redBorder: "#fca5a5",
  redText: "#dc2626",
  slate900: "#0f172a",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748b",
  slate400: "#94a3b8",
  slate300: "#cbd5e1",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  white: "#ffffff",
};

// ─── Estilos ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    backgroundColor: C.white,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.slate900,
    paddingBottom: 40,
    paddingLeft: 40,
    paddingRight: 40,
    paddingTop: 0,
  },

  // barra laranja no topo
  accentBar: {
    height: 5,
    backgroundColor: C.orange,
    marginLeft: -40,
    marginRight: -40,
    marginBottom: 28,
  },

  // cabeçalho
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  brand: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.orange,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 5,
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: C.slate900,
    marginBottom: 4,
  },
  subtitle: { fontSize: 10, color: C.slate500 },
  scoreBadge: {
    backgroundColor: C.orangeLight,
    borderRadius: 8,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 18,
    paddingRight: 18,
    alignItems: "center",
    minWidth: 100,
  },
  scorePct: {
    fontFamily: "Helvetica-Bold",
    fontSize: 26,
    color: C.orangeDark,
  },
  scoreLbl: { fontSize: 9, color: C.orangeDeep, marginTop: 3 },

  divider: { height: 1, backgroundColor: C.slate200, marginBottom: 22 },

  // seções
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: C.slate900,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.slate100,
  },
  section: { marginBottom: 26 },

  // métricas
  metricsGrid: { flexDirection: "row", gap: 10, marginBottom: 26 },
  metricBox: {
    flex: 1,
    backgroundColor: C.slate50,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: C.slate200,
  },
  metricLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.slate500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  metricValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    color: C.slate900,
  },
  metricSub: { fontSize: 8, color: C.slate400, marginTop: 2 },

  // barras
  barRow: { marginBottom: 10 },
  barHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { fontSize: 9, color: C.slate700 },
  barCount: { fontFamily: "Helvetica-Bold", fontSize: 9, color: C.slate900 },
  barTrack: { height: 4, backgroundColor: C.slate100, borderRadius: 2 },
  barFill: { height: 4, borderRadius: 2 },
  barSub: { fontSize: 8, color: C.slate400, marginTop: 3 },

  // perfil
  profileBox: {
    backgroundColor: C.orangeLight,
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: C.orange,
    marginBottom: 26,
  },
  profileTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: C.orangeDeep,
    marginBottom: 5,
  },
  profileDesc: { fontSize: 10, color: "#7c2d12", lineHeight: 1.55 },

  // chips de assuntos
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: C.orangeLight,
    borderRadius: 999,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 8,
    paddingRight: 8,
    fontSize: 9,
    color: "#c2410c",
  },

  // questões
  questionCard: {
    backgroundColor: C.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.slate200,
    marginBottom: 14,
    padding: 14,
  },
  qHeader: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.slate100,
  },
  qNum: {
    backgroundColor: C.slate900,
    color: C.white,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 999,
  },
  qSubjectChip: {
    backgroundColor: C.slate100,
    color: C.slate600,
    fontSize: 9,
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 999,
  },
  qStatement: {
    fontSize: 10,
    color: "#1e293b",
    lineHeight: 1.6,
    marginBottom: 10,
  },

  altRow: {
    flexDirection: "row",
    gap: 6,
    borderRadius: 6,
    padding: 8,
    marginBottom: 4,
    borderWidth: 1,
  },
  altRowCorrect: { backgroundColor: C.greenLight, borderColor: C.greenBorder },
  altRowWrong: { backgroundColor: C.redLight, borderColor: C.redBorder },
  altRowNeutral: { backgroundColor: C.white, borderColor: C.slate200 },
  altLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, width: 14, paddingTop: 1 },
  altText: { flex: 1, fontSize: 9, lineHeight: 1.5 },

  answerRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  answerCell: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.slate200,
    padding: 8,
  },
  answerCellLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: C.slate500,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  answerCellValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: C.slate900,
  },

  commentBox: {
    backgroundColor: C.greenLight,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.greenBorder,
    padding: 10,
    marginTop: 8,
  },
  commentTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: C.greenText,
    marginBottom: 3,
  },
  commentText: { fontSize: 9, color: C.greenText, lineHeight: 1.55 },

  // rodapé e paginação
  pageFooter: {
    position: "absolute",
    bottom: 14,
    left: 40,
    fontSize: 8,
    color: C.slate400,
  },
  pageNumber: {
    position: "absolute",
    bottom: 14,
    right: 40,
    fontSize: 8,
    color: C.slate400,
  },
});

// ─── Utilitários ─────────────────────────────────────────────────────────────
function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function fmt(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

// ─── Sub-componente: barra de desempenho ─────────────────────────────────────
function BarEntry({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={s.barRow}>
      <View style={s.barHead}>
        <Text style={s.barLabel}>{label}</Text>
        <Text style={s.barCount}>
          {count} ({pct}%)
        </Text>
      </View>
      <View style={s.barTrack}>
        <View
          style={[
            s.barFill,
            { width: `${Math.max(2, pct)}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

// ─── Tipos ───────────────────────────────────────────────────────────────────
export type PdfReportProps = {
  simuladoTitle: string;
  computed: {
    correct: number;
    wrong: number;
    blank: number;
    displayScore: number;
    maxScore: number;
    percentage: number;
  };
  questions: Array<{
    simulado_question_id: string;
    order_number: number;
    statement: string | null;
    explanation_text: string | null;
    subject: string | null;
    question_type?: string | null;
    alternatives: Array<{
      id: string;
      label: string;
      text: string;
      is_correct: boolean;
    }>;
  }>;
  answers: Record<string, { alternativeId?: string }>;
  weakTopics: Array<{ subject: string; topics: string[]; count: number }>;
  performanceBySubject: Array<{
    subject: string;
    correct: number;
    wrong: number;
    blank: number;
    total: number;
    percent: number;
  }>;
  timeSpent: number;
  answerChanges: number;
  profile: { title: string; description: string };
};

// ─── Documento PDF ────────────────────────────────────────────────────────────
function SimuladoPdfDocument(props: PdfReportProps) {
  const {
    simuladoTitle,
    computed,
    questions,
    answers,
    weakTopics,
    performanceBySubject,
    timeSpent,
    answerChanges,
    profile,
  } = props;

  const total = questions.length;
  const avgTime = total > 0 ? Math.round(timeSpent / total) : 0;
  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <Document
      title={`Relatório — ${simuladoTitle}`}
      author="EstudoTOP Simulados"
    >
      {/* ══════════════ PÁGINA 1: RESUMO ══════════════ */}
      <Page size="A4" style={s.page}>
        <View style={s.accentBar} />

        {/* Cabeçalho */}
        <View style={s.headerRow} wrap={false}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={s.brand}>EstudoTOP Simulados — Relatório de Desempenho</Text>
            <Text style={s.title}>{simuladoTitle}</Text>
            <Text style={s.subtitle}>Preview administrativo · {today}</Text>
          </View>
          <View style={s.scoreBadge}>
            <Text style={s.scorePct}>{fmt(computed.percentage)}%</Text>
            <Text style={s.scoreLbl}>Aproveitamento</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Métricas */}
        <View style={s.metricsGrid} wrap={false}>
          <View style={s.metricBox}>
            <Text style={s.metricLabel}>Pontuação</Text>
            <Text style={s.metricValue}>{fmt(computed.displayScore)}</Text>
            <Text style={s.metricSub}>/ {fmt(computed.maxScore)} pts</Text>
          </View>
          <View style={s.metricBox}>
            <Text style={s.metricLabel}>Questões</Text>
            <Text style={s.metricValue}>{total}</Text>
            <Text style={s.metricSub}>
              {computed.correct} acerto(s) · {computed.wrong} erro(s) · {computed.blank} branco(s)
            </Text>
          </View>
          <View style={s.metricBox}>
            <Text style={s.metricLabel}>Tempo total</Text>
            <Text style={s.metricValue}>{formatTime(timeSpent)}</Text>
          </View>
          <View style={s.metricBox}>
            <Text style={s.metricLabel}>Tempo médio/questão</Text>
            <Text style={s.metricValue}>{formatTime(avgTime)}</Text>
            <Text style={s.metricSub}>{answerChanges} mudança(s) de resposta</Text>
          </View>
        </View>

        {/* Barras de desempenho */}
        <View style={s.section} wrap={false}>
          <Text style={s.sectionTitle}>Desempenho</Text>
          <BarEntry label="Acertos" count={computed.correct} total={total} color={C.green} />
          <BarEntry label="Erros" count={computed.wrong} total={total} color={C.red} />
          <BarEntry label="Em branco" count={computed.blank} total={total} color={C.slate400} />
        </View>

        {/* Perfil comportamental */}
        <View style={s.profileBox} wrap={false}>
          <Text style={s.profileTitle}>{profile.title}</Text>
          <Text style={s.profileDesc}>{profile.description}</Text>
        </View>

        {/* Desempenho por assunto */}
        {performanceBySubject.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Desempenho por assunto</Text>
            {performanceBySubject.slice(0, 12).map((item) => (
              <View key={item.subject} style={s.barRow}>
                <View style={s.barHead}>
                  <Text style={s.barLabel}>{item.subject}</Text>
                  <Text style={s.barCount}>
                    {item.correct}/{item.total} ({item.percent}%)
                  </Text>
                </View>
                <View style={s.barTrack}>
                  <View
                    style={[
                      s.barFill,
                      { width: `${Math.max(2, item.percent)}%`, backgroundColor: C.orange },
                    ]}
                  />
                </View>
                <Text style={s.barSub}>
                  {item.correct} acerto(s) · {item.wrong} erro(s) · {item.blank} branco(s)
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Pontos de revisão */}
        {weakTopics.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>Pontos de revisão</Text>
            {weakTopics.slice(0, 8).map((group) => (
              <View key={group.subject} style={{ marginBottom: 10 }}>
                <Text
                  style={{
                    fontFamily: "Helvetica-Bold",
                    fontSize: 10,
                    color: C.slate700,
                    marginBottom: 5,
                  }}
                >
                  {group.subject}
                </Text>
                <View style={s.chipsWrap}>
                  {group.topics.map((topic) => (
                    <Text key={topic} style={s.chip}>
                      {topic}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <Text
          style={s.pageFooter}
          fixed
          render={() => "EstudoTOP Simulados"}
        />
        <Text
          style={s.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>

      {/* ══════════════ PÁGINA 2+: QUESTÕES ══════════════ */}
      <Page size="A4" style={s.page}>
        <View style={s.accentBar} />

        <View style={{ marginBottom: 20 }} wrap={false}>
          <Text
            style={{
              fontFamily: "Helvetica-Bold",
              fontSize: 14,
              color: C.slate900,
              marginBottom: 2,
            }}
          >
            Questões do Simulado
          </Text>
          <Text style={{ fontSize: 9, color: C.slate500 }}>
            {total} questão(ões) · {simuladoTitle}
          </Text>
        </View>

        {questions.map((question, index) => {
          const answer = answers[question.simulado_question_id];
          const selected = question.alternatives.find(
            (a) => a.id === answer?.alternativeId,
          );
          const correct = question.alternatives.find((a) => a.is_correct);
          const resultLabel = !selected
            ? "Em branco"
            : selected.is_correct
              ? "Acertou"
              : "Errou";
          const resultColor =
            resultLabel === "Acertou"
              ? C.green
              : resultLabel === "Errou"
                ? C.red
                : C.slate500;

          return (
            <View
              key={question.simulado_question_id}
              style={s.questionCard}
              wrap={false}
            >
              {/* Cabeçalho da questão */}
              <View style={s.qHeader}>
                <Text style={s.qNum}>Q {index + 1}</Text>
                {question.subject && (
                  <Text style={s.qSubjectChip}>{question.subject}</Text>
                )}
              </View>

              {/* Enunciado */}
              <Text style={s.qStatement}>
                {stripHtml(question.statement)}
              </Text>

              {/* Alternativas */}
              {question.alternatives.map((alt) => {
                const isCorrect = alt.is_correct;
                const isSelected = alt.id === selected?.id;
                const isWrongSelected = isSelected && !isCorrect;
                const isWrongTrueFalse = question.question_type === "true_false" && isCorrect && (alt.label === "E" || String(alt.text || "").trim().toLowerCase() === "errado");

                return (
                  <View
                    key={alt.id}
                    style={[
                      s.altRow,
                      isWrongTrueFalse
                        ? s.altRowWrong
                        : isCorrect
                        ? s.altRowCorrect
                        : isWrongSelected
                          ? s.altRowWrong
                          : s.altRowNeutral,
                    ]}
                  >
                    <Text
                      style={[
                        s.altLabel,
                        {
                          color: isWrongTrueFalse
                            ? C.redText
                            : isCorrect
                            ? C.greenText
                            : isWrongSelected
                              ? C.redText
                              : C.slate500,
                        },
                      ]}
                    >
                      {isCorrect ? OWL_MARK : `${alt.label})`}
                    </Text>
                    <Text style={s.altText}>{stripHtml(alt.text)}</Text>
                  </View>
                );
              })}

              {/* Linha de resposta/gabarito */}
              <View style={s.answerRow}>
                <View style={s.answerCell}>
                  <Text style={s.answerCellLabel}>Sua resposta</Text>
                  <Text style={s.answerCellValue}>
                    {selected ? `Alt. ${selected.label}` : "Em branco"}
                  </Text>
                </View>
                <View style={s.answerCell}>
                  <Text style={s.answerCellLabel}>Gabarito</Text>
                  <Text style={s.answerCellValue}>
                    {correct ? `Alt. ${correct.label}` : "—"}
                  </Text>
                </View>
                <View style={s.answerCell}>
                  <Text style={s.answerCellLabel}>Resultado</Text>
                  <Text
                    style={[s.answerCellValue, { color: resultColor }]}
                  >
                    {resultLabel}
                  </Text>
                </View>
              </View>

              {/* Comentário do professor */}
              {question.explanation_text && (
                <View style={s.commentBox}>
                  <Text style={s.commentTitle}>
                    Comentario do professor
                  </Text>
                  <Text style={s.commentText}>
                    {stripHtml(question.explanation_text)}
                  </Text>
                </View>
              )}
            </View>
          );
        })}

        <Text
          style={s.pageFooter}
          fixed
          render={() => "EstudoTOP Simulados"}
        />
        <Text
          style={s.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

// ─── Função pública: gera e faz download do PDF ───────────────────────────────
export async function generateSimuladoPdf(props: PdfReportProps): Promise<void> {
  const blob = await pdf(<SimuladoPdfDocument {...props} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `relatorio-${props.simuladoTitle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
