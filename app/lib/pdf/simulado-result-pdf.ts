import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { formatCpf } from "@/lib/utils/cpf";

type PdfQuestion = {
  order_number?: number;
  statement?: string | null;
  subject?: string | null;
  alternatives?: Array<{ id: string; label: string; text: string; is_correct?: boolean }>;
  simulado_question_id?: string;
};

type PdfAnswer = {
  alternativeId?: string;
  label?: string;
  isCorrect?: boolean | null;
};

type PdfResult = {
  displayScore: number;
  maxScore: number;
  percentage: number;
  correct: number;
  wrong: number;
  blank: number;
};

type PdfMeta = {
  title: string;
  max_attempts?: number | null;
  scoring_model?: string;
};

type PdfStudent = {
  name?: string | null;
  email?: string | null;
  cpf?: string | null;
};

const COVER_BG_SRC = "/images/pdf/capa-simulado-pdf.png";
const OWL_MARK = "\u{1F989}\uFE0F";

// Twemoji owl graphic, licensed under CC-BY 4.0: https://github.com/jdecked/twemoji
Font.registerEmojiSource({
  url: "/images/pdf/",
  format: "png",
});

const C = {
  brand: "#f97316",
  brandDark: "#c2410c",
  dark: "#0f172a",
  dark2: "#111827",
  slate700: "#334155",
  slate500: "#64748b",
  slate300: "#cbd5e1",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  orange50: "#fff7ed",
  emerald700: "#047857",
  emerald500: "#10b981",
  emerald200: "#a7f3d0",
  emerald50: "#ecfdf5",
  white: "#ffffff",
};

const s = StyleSheet.create({
  coverPage: {
    backgroundColor: C.dark,
    position: "relative",
  },
  coverImage: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  page: {
    paddingTop: 36,
    paddingRight: 38,
    paddingBottom: 48,
    paddingLeft: 38,
    backgroundColor: C.slate50,
    color: C.dark,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  watermark: {
    position: "absolute",
    top: 255,
    left: -85,
    right: -85,
    alignItems: "center",
    transform: "rotate(-28deg)",
    opacity: 0.055,
  },
  watermarkSecond: {
    top: 555,
  },
  watermarkName: {
    color: C.slate700,
    fontFamily: "Helvetica-Bold",
    fontSize: 17,
    letterSpacing: 1.2,
  },
  watermarkDetails: {
    marginTop: 5,
    color: C.slate700,
    fontSize: 9,
    letterSpacing: 0.55,
  },
  questionsTitle: {
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.slate200,
  },
  questionsTitleEyebrow: {
    color: C.brand,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  questionsTitleText: {
    color: C.dark,
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
  },
  questionCard: {
    marginBottom: 14,
    padding: 15,
    borderRadius: 8,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 10,
    marginBottom: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.slate100,
  },
  questionNumber: {
    paddingTop: 4,
    paddingRight: 9,
    paddingBottom: 4,
    paddingLeft: 9,
    borderRadius: 999,
    backgroundColor: C.dark,
    color: C.white,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  subjectChip: {
    paddingTop: 4,
    paddingRight: 9,
    paddingBottom: 4,
    paddingLeft: 9,
    borderRadius: 999,
    backgroundColor: C.orange50,
    color: C.brandDark,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  statement: {
    color: C.dark2,
    fontSize: 10.3,
    lineHeight: 1.55,
    marginBottom: 12,
  },
  alternatives: {
    gap: 6,
  },
  alternative: {
    flexDirection: "row",
    gap: 8,
    padding: 9,
    borderRadius: 7,
    backgroundColor: C.slate50,
    borderWidth: 1,
    borderColor: C.slate200,
  },
  alternativeCorrect: {
    backgroundColor: C.emerald50,
    borderColor: C.emerald200,
  },
  alternativeLabel: {
    width: 19,
    height: 19,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate300,
    color: C.slate700,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textAlign: "center",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  alternativeLabelCorrect: {
    backgroundColor: C.emerald500,
    borderColor: C.emerald500,
  },
  alternativeLabelText: {
    color: C.slate700,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  alternativeCorrectMark: {
    fontSize: 11,
    lineHeight: 1,
  },
  alternativeText: {
    flex: 1,
    color: C.slate700,
    fontSize: 9.4,
    lineHeight: 1.45,
  },
  alternativeTextCorrect: {
    color: C.emerald700,
  },
  footer: {
    position: "absolute",
    left: 38,
    right: 38,
    bottom: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: C.slate200,
    paddingTop: 8,
    color: C.slate500,
    fontSize: 7.5,
  },
});

function stripHtml(value?: string | null) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function safeFileName(value: string) {
  return (value || "simulado")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function estimateQuestionHeight(question: PdfQuestion) {
  const statementChars = stripHtml(question.statement).length;
  const alternativesChars = (question.alternatives || []).reduce((sum, alt) => sum + stripHtml(alt.text).length, 0);
  return 88 + Math.ceil(statementChars / 92) * 16 + Math.ceil(alternativesChars / 90) * 16 + (question.alternatives?.length || 0) * 30;
}

function PdfFooter({ title }: { title: string }) {
  return React.createElement(
    View,
    { style: s.footer, fixed: true },
    React.createElement(Text, null, "EstudoTOP Simulados"),
    React.createElement(Text, null, title),
    React.createElement(Text, { render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
  );
}

function PdfWatermark({ student, second = false }: { student: PdfStudent; second?: boolean }) {
  const name = student.name?.trim() || "Aluno não identificado";
  const email = student.email?.trim() || "E-mail não informado";
  const cpf = student.cpf ? formatCpf(student.cpf) : "CPF não informado";

  return React.createElement(
    View,
    { style: second ? [s.watermark, s.watermarkSecond] : s.watermark, fixed: true },
    React.createElement(Text, { style: s.watermarkName }, name),
    React.createElement(Text, { style: s.watermarkDetails }, `${email}  •  CPF: ${cpf}`),
  );
}

function SimuladoQuestionsPdf({ meta, questions, student }: { meta: PdfMeta; questions: PdfQuestion[]; student: PdfStudent }): React.ReactElement<React.ComponentProps<typeof Document>> {
  const title = meta.title || "Simulado";

  return React.createElement(
    Document,
    { title: `Simulado - ${title}`, author: "EstudoTOP Simulados" },
    React.createElement(
      Page,
      { size: "A4", style: s.coverPage },
      React.createElement(Image, { src: COVER_BG_SRC, style: s.coverImage }),
    ),
    React.createElement(
      Page,
      { size: "A4", style: s.page },
      React.createElement(
        View,
        { style: s.questionsTitle, wrap: false },
        React.createElement(Text, { style: s.questionsTitleEyebrow }, "CADERNO DE QUESTÕES"),
        React.createElement(Text, { style: s.questionsTitleText }, title),
      ),
      questions.length === 0
        ? React.createElement(Text, { style: s.statement }, "Nenhuma questão disponível neste simulado.")
        : questions.map((question, index) =>
            React.createElement(
              View,
              {
                key: question.simulado_question_id || `${index}`,
                style: s.questionCard,
                wrap: estimateQuestionHeight(question) > 680,
              },
              React.createElement(
                View,
                { style: s.questionHeader },
                React.createElement(Text, { style: s.questionNumber }, `Questão ${index + 1}`),
                React.createElement(Text, { style: s.subjectChip }, question.subject || "Sem assunto"),
              ),
              React.createElement(Text, { style: s.statement }, stripHtml(question.statement) || "Enunciado não informado."),
              React.createElement(
                View,
                { style: s.alternatives },
                (question.alternatives || []).map((alternative, alternativeIndex) =>
                  React.createElement(
                    View,
                    {
                      key: alternative.id || `${alternativeIndex}`,
                      style: alternative.is_correct ? [s.alternative, s.alternativeCorrect] : s.alternative,
                      wrap: false,
                    },
                    React.createElement(
                      View,
                      { style: alternative.is_correct ? [s.alternativeLabel, s.alternativeLabelCorrect] : s.alternativeLabel },
                      React.createElement(
                        Text,
                        { style: alternative.is_correct ? s.alternativeCorrectMark : s.alternativeLabelText },
                        alternative.is_correct ? OWL_MARK : alternative.label || String(alternativeIndex + 1),
                      ),
                    ),
                    React.createElement(
                      Text,
                      { style: alternative.is_correct ? [s.alternativeText, s.alternativeTextCorrect] : s.alternativeText },
                      stripHtml(alternative.text),
                    ),
                  ),
                ),
              ),
            ),
          ),
      React.createElement(PdfWatermark, { student }),
      React.createElement(PdfWatermark, { student, second: true }),
      React.createElement(PdfFooter, { title }),
    ),
  );
}

export async function downloadSimuladoResultPdf({
  meta,
  questions,
  student,
}: {
  meta: PdfMeta;
  student: PdfStudent;
  result: PdfResult;
  questions: PdfQuestion[];
  answers: Record<string, PdfAnswer>;
  timeSpent: number;
}) {
  const pdfDocument = React.createElement(SimuladoQuestionsPdf, { meta, questions, student }) as React.ReactElement<React.ComponentProps<typeof Document>>;
  const blob = await pdf(pdfDocument).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `simulado-estudotop-${safeFileName(meta.title)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
