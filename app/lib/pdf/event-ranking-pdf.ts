import React from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { formatRankingName } from "@/lib/formatRankingName";

// Renderer dedicado ao Ranking em PDF do Evento (Professor/Admin). Documento
// separado do caderno de prova (SimuladoQuestionsPdf, em simulado-result-pdf.ts)
// porque a estrutura visual é outra (tabela compacta, sem questões) — sem
// necessidade de forçar os dois no mesmo template. Não recalcula nem reordena
// nada: recebe a lista já processada por rankedParticipants() (lib/eventRanking.ts,
// a mesma regra usada na aba Ranking — pontuação > coruja > advertências >
// tempo) e apenas desenha o que já foi decidido lá.
//
// Colunas: Posição, Nome, Tempo, Advert., Coruja, Pontos — sem Status (a
// situação do participante só faz sentido no painel operacional da tela, não
// num documento impresso/estático).
//
// Sem marca d'água nesta versão (removida por decisão do usuário — ficou
// visualmente ruim em homologação). Só capa oficial + tabela + rodapé.

type RankingPdfParticipant = {
  id: string;
  name: string;
  rank: number | null;
  rank_tied: boolean;
  result: {
    correct_count: number;
    time_spent_ms: number;
    display_score?: number | null;
    owl_help_used_count?: number | null;
    focus_violation_count?: number | null;
  } | null;
};

type RankingPdfMeta = {
  eventName: string;
  simuladoTitle?: string | null;
};

const RANKING_COVER_SRC = "/images/pdf/capa-ranking-simulado.png";

Font.register({
  family: "Inter",
  fonts: [
    { src: "/fonts/Inter.ttf", fontWeight: 400 },
    { src: "/fonts/Inter.ttf", fontWeight: 700 },
  ],
});

const C = {
  dark: "#0f172a",
  dark2: "#111827",
  slate700: "#334155",
  slate500: "#64748b",
  slate400: "#94a3b8",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  white: "#ffffff",
  gold: "#a16207",
  goldBg: "#fef3c7",
  silver: "#475569",
  silverBg: "#f1f5f9",
  bronze: "#9a3412",
  bronzeBg: "#ffedd5",
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
    paddingRight: 38,
    paddingBottom: 48,
    paddingLeft: 38,
    backgroundColor: C.white,
    color: C.dark,
    fontFamily: "Inter", fontWeight: 400,
    fontSize: 10,
  },
  header: {
    paddingTop: 30,
    paddingBottom: 12,
  },
  headerEyebrow: {
    color: C.slate500,
    fontFamily: "Inter", fontWeight: 700,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  headerTitle: {
    color: C.dark,
    fontFamily: "Inter", fontWeight: 700,
    fontSize: 15,
  },
  tableHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: C.dark,
    paddingBottom: 7,
  },
  tableHeaderCell: {
    color: C.slate500,
    fontFamily: "Inter", fontWeight: 700,
    fontSize: 8,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 0.75,
    borderBottomColor: C.slate100,
  },
  rowAlt: {
    backgroundColor: "#fafaf9",
  },
  colPos: { width: 40 },
  colName: { flex: 1, paddingRight: 8 },
  colTime: { width: 68 },
  colAdvert: { width: 52, textAlign: "right" },
  colCoruja: { width: 52, textAlign: "right" },
  colPoints: { width: 62, textAlign: "right" },
  positionBadge: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  positionText: {
    fontFamily: "Inter", fontWeight: 700,
    fontSize: 10,
    color: C.slate700,
  },
  positionTextTop: {
    fontSize: 9.5,
  },
  tiedBadge: {
    marginLeft: 4,
    color: C.slate400,
    fontSize: 6.5,
    letterSpacing: 0.5,
  },
  name: {
    fontFamily: "Inter", fontWeight: 700,
    fontSize: 10,
    color: C.dark2,
    lineHeight: 1.35,
  },
  time: {
    color: C.slate700,
    fontSize: 9.5,
  },
  metric: {
    color: C.slate700,
    fontSize: 9.5,
  },
  points: {
    fontFamily: "Inter", fontWeight: 700,
    fontSize: 10.5,
    color: C.dark2,
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

const TOP_TONE = {
  1: { bg: C.goldBg, color: C.gold },
  2: { bg: C.silverBg, color: C.silver },
  3: { bg: C.bronzeBg, color: C.bronze },
} as const;

function safeFileName(value: string) {
  return (value || "ranking")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

// Exportada para ser testada diretamente (valor real, sem depender de
// renderização de PDF): "38min 42s" / "59min 03s" / "1h 05min" / "1h 42min",
// sem milissegundos — mesmo valor (time_spent_ms) já usado na aba Ranking,
// só formatado de forma compacta para impressão.
export function formatCompactTime(milliseconds?: number | null) {
  if (milliseconds === null || milliseconds === undefined) return "—";
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes}min ${String(seconds).padStart(2, "0")}s`;
}

export type RankingPdfRow = {
  id: string;
  position: string;
  tone: 1 | 2 | 3 | null;
  name: string;
  tied: boolean;
  time: string;
  advert: string;
  owlHelp: string;
  points: string;
};

// Score oficial já consolidado (o mesmo exibido como "Nota"/"Pontos" na
// tela) — nunca correct_count ("acertos"), que é um número diferente sob
// modelos de pontuação como Cebraspe. Cai para correct_count só quando
// display_score não vier (compatibilidade com chamadores antigos/fixtures de
// teste), preservando o valor que já era mostrado antes desta mudança.
function formatPoints(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// Única função que decide quem entra no Ranking em PDF e em que ordem — sem
// recalcular nada: apenas filtra (rank !== null, ou seja, participantes com
// posição real na aba Ranking) e formata para exibição. A ordem já vem
// pronta de rankedParticipants() (lib/eventRanking.ts), preservada aqui.
// Exportada para ser exercitada em teste real (paridade tela × PDF, 100+
// participantes, nomes longos, tempos, posições) sem precisar renderizar PDF.
export function buildRankingRows(participants: RankingPdfParticipant[]): RankingPdfRow[] {
  return participants
    .filter((item) => item.rank !== null && item.rank !== undefined)
    .map((item) => ({
      id: item.id,
      position: item.rank ? `${item.rank}º` : "—",
      tone: item.rank && item.rank <= 3 ? (item.rank as 1 | 2 | 3) : null,
      name: formatRankingName(item.name),
      tied: item.rank_tied,
      time: formatCompactTime(item.result?.time_spent_ms),
      advert: item.result ? String(item.result.focus_violation_count ?? 0) : "—",
      owlHelp: item.result ? String(item.result.owl_help_used_count ?? 0) : "—",
      points: formatPoints(item.result ? (item.result.display_score ?? item.result.correct_count) : null),
    }));
}

// Mensagem de erro controlada — nunca gerar a capa em branco silenciosamente.
// Se a imagem oficial não puder ser carregada (arquivo ausente, falha de
// rede, resposta não-2xx), a geração do PDF é bloqueada aqui, antes de
// `pdf(...).toBlob()` — melhor não gerar nada do que gerar um PDF incompleto.
export const RANKING_COVER_LOAD_ERROR = "Não foi possível carregar a capa do ranking.";

// Carrega a capa oficial como base64 (data URI) via fetch explícito e
// controlado pelo próprio código, em vez de deixar o <Image> do
// @react-pdf/renderer resolver a URL internamente. Dois motivos:
// 1) `cache: "reload"` força ignorar qualquer resposta 404 antiga cacheada
//    pelo navegador (cenário real observado: testar a exportação antes do
//    asset existir, depois adicionar o arquivo, sem recarregar a página).
// 2) o cache interno de imagens do @react-pdf/renderer (`IMAGE_CACHE`, em
//    node_modules/@react-pdf/image) guarda a PROMISE da primeira resolução
//    por URL pelo tempo de vida da aba/SPA — se a primeira tentativa falhar
//    (ex.: arquivo ainda não existia), toda tentativa seguinte na mesma aba
//    reaproveita essa mesma promise rejeitada e a capa nunca mais aparece,
//    mesmo depois do arquivo existir, sem lançar nenhum erro visível. Buscar
//    o arquivo nós mesmos e entregar o conteúdo já resolvido como data URI
//    evita esse cache por URL inteiramente.
// Base64 puro (sem FileReader — API só de navegador, não testável/portável em
// Node) em blocos de 32KB, técnica padrão para evitar estourar o limite de
// argumentos de `String.fromCharCode.apply` em imagens grandes.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(buffer).toString("base64");
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

export async function loadRankingCoverDataUri(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(RANKING_COVER_SRC, { cache: "reload" });
  } catch {
    throw new Error(RANKING_COVER_LOAD_ERROR);
  }
  if (!response.ok) {
    throw new Error(RANKING_COVER_LOAD_ERROR);
  }
  try {
    const buffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${base64}`;
  } catch {
    throw new Error(RANKING_COVER_LOAD_ERROR);
  }
}

function PdfFooter({ subtitle }: { subtitle: string }) {
  return React.createElement(
    View,
    { style: s.footer, fixed: true },
    React.createElement(Text, null, "EstudoTOP Simulados - simulados.estudotop.com.br"),
    React.createElement(Text, null, subtitle),
    React.createElement(Text, { render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
  );
}

function EventRankingPdf({ meta, rows, coverSrc }: { meta: RankingPdfMeta; rows: RankingPdfRow[]; coverSrc: string }): React.ReactElement<React.ComponentProps<typeof Document>> {
  const eventName = meta.eventName || "Evento";

  return React.createElement(
    Document,
    { title: `Ranking - ${eventName}`, author: "EstudoTOP Simulados" },
    React.createElement(
      Page,
      { size: "A4", style: s.coverPage },
      React.createElement(Image, { src: coverSrc, style: s.coverImage }),
    ),
    React.createElement(
      Page,
      { size: "A4", style: s.page },
      React.createElement(
        View,
        { style: s.header, fixed: true },
        React.createElement(Text, { style: s.headerEyebrow }, "RANKING"),
        React.createElement(Text, { style: s.headerTitle }, eventName),
        React.createElement(
          View,
          { style: s.tableHeaderRow },
          React.createElement(Text, { style: [s.tableHeaderCell, s.colPos] }, "Pos."),
          React.createElement(Text, { style: [s.tableHeaderCell, s.colName] }, "Nome"),
          React.createElement(Text, { style: [s.tableHeaderCell, s.colTime] }, "Tempo"),
          React.createElement(Text, { style: [s.tableHeaderCell, s.colAdvert] }, "Advert."),
          React.createElement(Text, { style: [s.tableHeaderCell, s.colCoruja] }, "Ajudas"),
          React.createElement(Text, { style: [s.tableHeaderCell, s.colPoints] }, "Pontos"),
        ),
      ),
      rows.length === 0
        ? React.createElement(Text, { style: { marginTop: 130, color: C.slate500, fontSize: 10 } }, "Nenhum participante com resultado consolidado até o momento.")
        : rows.map((row, index) => {
            const tone = row.tone ? TOP_TONE[row.tone] : undefined;
            return React.createElement(
              View,
              { key: row.id, style: index % 2 ? [s.row, s.rowAlt] : s.row, wrap: false },
              React.createElement(
                View,
                { style: s.colPos },
                React.createElement(
                  View,
                  { style: tone ? [s.positionBadge, { backgroundColor: tone.bg }] : s.positionBadge },
                  React.createElement(Text, { style: tone ? [s.positionText, s.positionTextTop, { color: tone.color }] : s.positionText }, row.position),
                ),
              ),
              React.createElement(
                View,
                { style: s.colName },
                React.createElement(
                  Text,
                  { style: s.name },
                  row.name,
                  row.tied ? React.createElement(Text, { style: s.tiedBadge }, "  EMPATE") : null,
                ),
              ),
              React.createElement(Text, { style: [s.time, s.colTime] }, row.time),
              React.createElement(Text, { style: [s.metric, s.colAdvert] }, row.advert),
              React.createElement(Text, { style: [s.metric, s.colCoruja] }, row.owlHelp),
              React.createElement(Text, { style: [s.points, s.colPoints] }, row.points),
            );
          }),
      React.createElement(PdfFooter, { subtitle: eventName }),
    ),
  );
}

// Ranking oficial em PDF, gerado pelo Professor/Admin a partir da aba
// Ranking do Evento. Não recalcula posição/desempate: recebe participants já
// processados por rankedParticipants() (lib/eventRanking.ts — mesma regra da
// tela) e exporta apenas quem tem posição no ranking (rank !== null), ou
// seja, participantes com resultado consolidado — os demais (não iniciado,
// em andamento etc.) fazem parte do painel operacional da aba, não do
// ranking numerado em si. Só Posição/Nome/Tempo/Advertências/Coruja/Pontos:
// nenhum outro dado (e-mail, CPF, ID, Status) é lido ou desenhado aqui.
//
// A capa é carregada e validada ANTES de montar o documento — se falhar,
// lança e nenhum PDF é gerado (ver loadRankingCoverDataUri).
export async function downloadEventRankingPdf({
  eventName,
  simuladoTitle,
  participants,
}: {
  eventName: string;
  simuladoTitle?: string | null;
  participants: RankingPdfParticipant[];
}) {
  const coverSrc = await loadRankingCoverDataUri();
  const rows = buildRankingRows(participants);
  const pdfDocument = React.createElement(EventRankingPdf, { meta: { eventName, simuladoTitle }, rows, coverSrc }) as React.ReactElement<React.ComponentProps<typeof Document>>;
  const blob = await pdf(pdfDocument).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ranking-estudotop-${safeFileName(eventName)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
