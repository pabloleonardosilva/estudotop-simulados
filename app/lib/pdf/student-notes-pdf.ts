import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";

type PdfNotesStudent = {
  name?: string | null;
  email?: string | null;
  cpf?: string | null;
};

type PdfNotesSimuladoInput = {
  simulado_id: string;
  title: string;
  content: string;
  jornada: { id: string; title: string } | null;
};

type PdfNotesSimulado = {
  simulado_id: string;
  title: string;
  notes: string[];
};

type PdfNotesJornada = {
  id: string;
  title: string;
  simulados: PdfNotesSimulado[];
};

// O asset oficial da capa precisa existir em public/images/minhas-anotações.png.
// Se não estiver disponível em runtime, o PDF usa a capa premium sem imagem.
const COVER_BG_SRC = "/images/minhas-anotações.png";

const AVULSOS_GROUP_ID = "__avulsos__";
const AVULSOS_GROUP_TITLE = "Simulados avulsos";

const C = {
  brand: "#f97316",
  brandDark: "#c2410c",
  dark: "#0f172a",
  dark2: "#111827",
  slate700: "#334155",
  slate500: "#64748b",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  orange50: "#fff7ed",
  orange100: "#ffedd5",
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
  coverFallback: {
    flex: 1,
    justifyContent: "center",
    paddingLeft: 52,
    paddingRight: 52,
  },
  coverFallbackEyebrow: {
    color: C.brand,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  coverFallbackTitle: {
    color: C.white,
    fontFamily: "Helvetica-Bold",
    fontSize: 34,
    lineHeight: 1.15,
  },
  coverFallbackBar: {
    marginTop: 22,
    width: 88,
    height: 4,
    backgroundColor: C.brand,
    borderRadius: 2,
  },
  coverFallbackSubtitle: {
    marginTop: 22,
    color: C.slate200,
    fontSize: 11,
    lineHeight: 1.6,
  },
  page: {
    paddingTop: 36,
    paddingRight: 38,
    paddingBottom: 52,
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
  studentPanel: {
    marginBottom: 22,
    padding: 16,
    borderRadius: 10,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    borderLeftWidth: 4,
    borderLeftColor: C.brand,
  },
  studentPanelEyebrow: {
    color: C.brand,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  studentPanelName: {
    color: C.dark,
    fontFamily: "Helvetica-Bold",
    fontSize: 15,
    marginBottom: 4,
  },
  studentPanelLine: {
    color: C.slate500,
    fontSize: 9.5,
    lineHeight: 1.5,
  },
  jornadaHeader: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 10,
    backgroundColor: C.dark,
  },
  jornadaEyebrow: {
    color: C.brand,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  jornadaTitle: {
    color: C.white,
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    lineHeight: 1.25,
  },
  jornadaMeta: {
    marginTop: 7,
    color: C.slate200,
    fontSize: 8.5,
  },
  simuladoHeader: {
    marginTop: 10,
    marginBottom: 12,
    padding: 14,
    borderRadius: 9,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    borderLeftWidth: 5,
    borderLeftColor: C.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  simuladoHeaderText: {
    flex: 1,
  },
  simuladoEyebrow: {
    color: C.brandDark,
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  simuladoTitle: {
    color: C.dark,
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    lineHeight: 1.3,
  },
  simuladoCountChip: {
    paddingTop: 5,
    paddingBottom: 5,
    paddingLeft: 10,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: C.orange50,
    borderWidth: 1,
    borderColor: C.orange100,
    color: C.brandDark,
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
  },
  noteCard: {
    marginBottom: 10,
    padding: 13,
    borderRadius: 8,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
  },
  noteNumber: {
    alignSelf: "flex-start",
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 9,
    paddingRight: 9,
    borderRadius: 999,
    backgroundColor: C.dark,
    color: C.white,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    marginBottom: 8,
  },
  noteParagraph: {
    color: C.dark2,
    fontSize: 10,
    lineHeight: 1.55,
    marginBottom: 5,
  },
  sectionDivider: {
    marginTop: 6,
    marginBottom: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.orange100,
  },
  emptyMessage: {
    color: C.slate500,
    fontSize: 10,
    lineHeight: 1.5,
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

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(value: string) {
  return decodeEntities(
    String(value || "")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Extrai as anotações de um simulado: primeiro os blocos oficiais do caderno
// ([data-note-block], removendo o rótulo "Nota N:"); depois, qualquer conteúdo
// legado restante vira notas separadas por parágrafo em branco.
function extractNotesFromHtml(html: string): string[] {
  const clean = String(html || "").trim();
  if (!clean) return [];

  if (typeof document === "undefined") {
    const text = htmlToPlainText(clean);
    return text ? text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean) : [];
  }

  const temp = document.createElement("div");
  temp.innerHTML = clean;
  const notes: string[] = [];

  temp.querySelectorAll("[data-note-block]").forEach((block) => {
    const inner = block.cloneNode(true) as HTMLElement;
    inner.querySelectorAll("[data-note-label], [data-note-divider]").forEach((el) => el.remove());
    const text = htmlToPlainText(inner.innerHTML);
    if (text) notes.push(text);
    block.remove();
  });

  const leftover = htmlToPlainText(temp.innerHTML);
  if (leftover) {
    leftover
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => notes.push(part));
  }

  return notes;
}

function safeFileName(value: string) {
  return (value || "anotacoes")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function buildJornadaGroups(simulados: PdfNotesSimuladoInput[]): PdfNotesJornada[] {
  const groups = new Map<string, PdfNotesJornada>();

  for (const simulado of simulados) {
    const notes = extractNotesFromHtml(simulado.content);
    if (!notes.length) continue;

    const groupId = simulado.jornada?.id || AVULSOS_GROUP_ID;
    const groupTitle = simulado.jornada?.title || AVULSOS_GROUP_TITLE;
    if (!groups.has(groupId)) {
      groups.set(groupId, { id: groupId, title: groupTitle, simulados: [] });
    }
    groups.get(groupId)!.simulados.push({
      simulado_id: simulado.simulado_id,
      title: simulado.title,
      notes,
    });
  }

  // Jornadas na ordem em que aparecem; "Simulados avulsos" sempre por último.
  const ordered = Array.from(groups.values());
  return [
    ...ordered.filter((group) => group.id !== AVULSOS_GROUP_ID),
    ...ordered.filter((group) => group.id === AVULSOS_GROUP_ID),
  ];
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

function PdfWatermark({ student, second = false }: { student: PdfNotesStudent; second?: boolean }) {
  const name = student.name?.trim() || "Aluno não identificado";
  const details = [student.email?.trim(), student.cpf?.trim() ? `CPF: ${student.cpf.trim()}` : null]
    .filter(Boolean)
    .join("  •  ");

  return React.createElement(
    View,
    { style: second ? [s.watermark, s.watermarkSecond] : s.watermark, fixed: true },
    React.createElement(Text, { style: s.watermarkName }, name),
    details ? React.createElement(Text, { style: s.watermarkDetails }, details) : null,
  );
}

function StudentNotesPdf({
  student,
  jornadas,
  withCoverImage,
  generatedAtLabel,
}: {
  student: PdfNotesStudent;
  jornadas: PdfNotesJornada[];
  withCoverImage: boolean;
  generatedAtLabel: string;
}): React.ReactElement<React.ComponentProps<typeof Document>> {
  const documentTitle = "Minhas Anotações";
  const totalNotes = jornadas.reduce(
    (sum, jornada) => sum + jornada.simulados.reduce((inner, simulado) => inner + simulado.notes.length, 0),
    0,
  );

  return React.createElement(
    Document,
    { title: `Minhas Anotações - EstudoTOP`, author: "EstudoTOP Simulados" },
    React.createElement(
      Page,
      { size: "A4", style: s.coverPage },
      withCoverImage
        ? React.createElement(Image, { src: COVER_BG_SRC, style: s.coverImage })
        : React.createElement(
            View,
            { style: s.coverFallback },
            React.createElement(Text, { style: s.coverFallbackEyebrow }, "EstudoTOP Simulados"),
            React.createElement(Text, { style: s.coverFallbackTitle }, "Minhas Anotações"),
            React.createElement(View, { style: s.coverFallbackBar }),
            React.createElement(
              Text,
              { style: s.coverFallbackSubtitle },
              "Caderno pessoal de estudos, organizado por Jornada e por simulado.",
            ),
          ),
    ),
    React.createElement(
      Page,
      { size: "A4", style: s.page },
      React.createElement(
        View,
        { style: s.studentPanel, wrap: false },
        React.createElement(Text, { style: s.studentPanelEyebrow }, "Caderno de anotações do aluno"),
        React.createElement(Text, { style: s.studentPanelName }, student.name?.trim() || "Aluno não identificado"),
        student.email?.trim()
          ? React.createElement(Text, { style: s.studentPanelLine }, student.email.trim())
          : null,
        React.createElement(
          Text,
          { style: s.studentPanelLine },
          `Gerado em ${generatedAtLabel}  •  ${totalNotes} anotaç${totalNotes === 1 ? "ão" : "ões"} no total`,
        ),
      ),
      totalNotes === 0
        ? React.createElement(
            Text,
            { style: s.emptyMessage },
            "Você ainda não possui anotações registradas nos seus simulados.",
          )
        : jornadas.map((jornada, jornadaIndex) =>
            React.createElement(
              View,
              { key: jornada.id, break: jornadaIndex > 0 },
              React.createElement(
                View,
                { style: s.jornadaHeader, wrap: false },
                React.createElement(
                  Text,
                  { style: s.jornadaEyebrow },
                  jornada.id === AVULSOS_GROUP_ID ? "Fora de Jornada" : "Jornada",
                ),
                React.createElement(Text, { style: s.jornadaTitle }, jornada.title),
                React.createElement(
                  Text,
                  { style: s.jornadaMeta },
                  `${jornada.simulados.length} simulado${jornada.simulados.length === 1 ? "" : "s"} com anotações`,
                ),
              ),
              jornada.simulados.map((simulado, simuladoIndex) =>
                React.createElement(
                  View,
                  // Cada simulado inicia em página nova; o primeiro da Jornada
                  // permanece na mesma página do banner da Jornada.
                  { key: simulado.simulado_id, break: simuladoIndex > 0 },
                  React.createElement(
                    View,
                    { style: s.simuladoHeader, wrap: false },
                    React.createElement(
                      View,
                      { style: s.simuladoHeaderText },
                      React.createElement(Text, { style: s.simuladoEyebrow }, "Simulado"),
                      React.createElement(Text, { style: s.simuladoTitle }, simulado.title),
                    ),
                    React.createElement(
                      Text,
                      { style: s.simuladoCountChip },
                      `${simulado.notes.length} nota${simulado.notes.length === 1 ? "" : "s"}`,
                    ),
                  ),
                  simulado.notes.map((note, noteIndex) =>
                    React.createElement(
                      View,
                      {
                        key: `${simulado.simulado_id}-${noteIndex}`,
                        style: s.noteCard,
                        wrap: note.length > 1400,
                      },
                      React.createElement(Text, { style: s.noteNumber }, `Nota ${noteIndex + 1}`),
                      note
                        .split(/\n+/)
                        .map((paragraph) => paragraph.trim())
                        .filter(Boolean)
                        .map((paragraph, paragraphIndex) =>
                          React.createElement(
                            Text,
                            { key: paragraphIndex, style: s.noteParagraph },
                            paragraph,
                          ),
                        ),
                    ),
                  ),
                  React.createElement(View, { style: s.sectionDivider }),
                ),
              ),
            ),
          ),
      React.createElement(PdfWatermark, { student }),
      React.createElement(PdfWatermark, { student, second: true }),
      React.createElement(PdfFooter, { title: documentTitle }),
    ),
  );
}

async function isCoverImageAvailable(): Promise<boolean> {
  try {
    const response = await fetch(COVER_BG_SRC, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function downloadStudentNotesPdf({
  student,
  simulados,
}: {
  student: PdfNotesStudent;
  simulados: PdfNotesSimuladoInput[];
}) {
  const jornadas = buildJornadaGroups(simulados);
  const withCoverImage = await isCoverImageAvailable();
  const generatedAtLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const pdfDocument = React.createElement(StudentNotesPdf, {
    student,
    jornadas,
    withCoverImage,
    generatedAtLabel,
  }) as React.ReactElement<React.ComponentProps<typeof Document>>;

  const blob = await pdf(pdfDocument).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `minhas-anotacoes-estudotop-${safeFileName(student.name || "aluno")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
