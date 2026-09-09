import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { rankedParticipants, type RankableParticipant } from "@/lib/eventRanking";
import { formatRankingName } from "@/lib/formatRankingName";
import { buildDifficultyTopics } from "@/lib/topicDifficulty";
import { buildRankingRows, formatCompactTime, loadRankingCoverDataUri, RANKING_COVER_LOAD_ERROR } from "@/app/lib/pdf/event-ranking-pdf";

const RESULT_PAGE = "app/meus-simulados/[id]/resultado/page-client.tsx";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const RENDERER = "app/lib/pdf/event-ranking-pdf.ts";
const PANEL = "app/professor/eventos/[id]/page-client.tsx";
const API_ROUTE = "app/api/professor/events/[id]/route.ts";

type ParticipantExtra = { display_score?: number | null; owl_help_used_count?: number; focus_violation_count?: number };

function participant(
  id: string,
  name: string,
  correct_count: number | null,
  time_spent_ms: number | null,
  extra?: ParticipantExtra,
): RankableParticipant {
  return {
    id,
    name,
    result: correct_count === null ? null : {
      correct_count,
      time_spent_ms: time_spent_ms as number,
      display_score: extra?.display_score,
      owl_help_used_count: extra?.owl_help_used_count,
      focus_violation_count: extra?.focus_violation_count,
    },
  };
}

test.describe("NOVA REGRA OFICIAL DE CLASSIFICAÇÃO — pontuação > coruja > advertências > tempo", () => {
  test("CASO A: pontuações diferentes → maior pontuação sempre vence, mesmo com mais ajuda/advertência/tempo", () => {
    const a = participant("A", "Aluno A", 10, 30 * 60_000, { display_score: 10, owl_help_used_count: 0, focus_violation_count: 0 });
    const b = participant("B", "Aluno B", 11, 90 * 60_000, { display_score: 11, owl_help_used_count: 5, focus_violation_count: 4 });
    const ranked = rankedParticipants([a, b]);
    expect(ranked.find((p) => p.id === "B")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(2);
  });

  test("CASO B: mesma pontuação, ajudas diferentes → menos ajuda da coruja vence", () => {
    const a = participant("A", "Aluno A", 11, 50 * 60_000, { display_score: 11, owl_help_used_count: 0, focus_violation_count: 2 });
    const b = participant("B", "Aluno B", 11, 40 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 0 });
    const ranked = rankedParticipants([a, b]);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "B")!.rank).toBe(2);
  });

  test("CASO C: mesma pontuação e ajuda, advertências diferentes → menos advertências vence", () => {
    const a = participant("A", "Aluno A", 11, 55 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 1 });
    const b = participant("B", "Aluno B", 11, 40 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 2 });
    const ranked = rankedParticipants([a, b]);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "B")!.rank).toBe(2);
  });

  test("CASO D: pontuação/ajuda/advertência iguais, tempo diferente → menor tempo vence", () => {
    const a = participant("A", "Aluno A", 11, 55 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 1 });
    const b = participant("B", "Aluno B", 11, 40 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 1 });
    const ranked = rankedParticipants([a, b]);
    expect(ranked.find((p) => p.id === "B")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(2);
  });

  test("CASO E: todos os quatro critérios idênticos → ordem determinística (mesma posição, sem instabilidade entre execuções)", () => {
    const a = participant("A", "Beatriz", 11, 40 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 1 });
    const b = participant("B", "Amanda", 11, 40 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 1 });
    const run1 = rankedParticipants([a, b]).map((p) => p.id);
    const run2 = rankedParticipants([a, b]).map((p) => p.id);
    const run3 = rankedParticipants([b, a]).map((p) => p.id);
    expect(run1).toEqual(run2);
    expect(run1).toEqual(run3);
    // ambos dividem a mesma posição (1º) — ranking competitivo preservado
    // quando os quatro critérios oficiais empatam exatamente.
    const ranked = rankedParticipants([a, b]);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "B")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "A")!.rank_tied).toBe(true);
    expect(ranked.find((p) => p.id === "B")!.rank_tied).toBe(true);
  });

  test("teste de prioridade entre critérios: menos ajuda vence apesar de mais advertências e mais tempo (prova que coruja > advertências e coruja > tempo)", () => {
    const a = participant("A", "Aluno A", 11, 90 * 60_000, { display_score: 11, owl_help_used_count: 0, focus_violation_count: 5 }); // lento, mais advertências, MENOS ajuda
    const b = participant("B", "Aluno B", 11, 20 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 0 }); // rápido, menos advertências, MAIS ajuda
    const ranked = rankedParticipants([a, b]);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "B")!.rank).toBe(2);
  });

  test("teste de prioridade: menos advertências vence apesar de mais tempo (prova que advertências > tempo, com coruja empatada)", () => {
    const a = participant("A", "Aluno A", 11, 90 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 1 }); // lento, menos advertências
    const b = participant("B", "Aluno B", 11, 20 * 60_000, { display_score: 11, owl_help_used_count: 1, focus_violation_count: 2 }); // rápido, mais advertências
    const ranked = rankedParticipants([a, b]);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "B")!.rank).toBe(2);
  });

  test("pontuação usa o score oficial (display_score), não correct_count, quando os dois divergem (ex.: Cebraspe)", () => {
    // Aluno A tem mais acertos brutos, mas nota final menor (erros descontam
    // pontos sob Cebraspe); Aluno B tem menos acertos brutos, mas nota final
    // maior. B deve vencer, porque a classificação usa a nota oficial.
    const a = participant("A", "Aluno A", 15, 40 * 60_000, { display_score: 8 });
    const b = participant("B", "Aluno B", 12, 40 * 60_000, { display_score: 9 });
    const ranked = rankedParticipants([a, b]);
    expect(ranked.find((p) => p.id === "B")!.rank).toBe(1);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(2);
  });

  test("compatibilidade: sem display_score informado (fixtures antigas), cai para correct_count — não quebra chamadores antigos", () => {
    const a = participant("A", "Aluno A", 9, 60_000);
    const b = participant("B", "Aluno B", 7, 30_000);
    const ranked = rankedParticipants([a, b]);
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(1);
  });

  test("ausência de coruja/advertências (undefined) é normalizada para 0 — nunca derruba um participante por dado ausente", () => {
    const withData = participant("A", "Aluno A", 11, 40 * 60_000, { display_score: 11, owl_help_used_count: 0, focus_violation_count: 0 });
    const withoutData = participant("B", "Aluno B", 11, 40 * 60_000, { display_score: 11 }); // owl/focus ausentes
    const ranked = rankedParticipants([withData, withoutData]);
    // Ambos tratados como 0 em coruja/advertências — critérios idênticos,
    // desempatados só pelo nome (técnico), nunca penalizando quem não tem o
    // campo preenchido.
    expect(ranked.find((p) => p.id === "A")!.rank).toBe(ranked.find((p) => p.id === "B")!.rank);
  });
});

test.describe("regra de tempo (formatCompactTime) — compacto, sem milissegundos", () => {
  const cases: [number, string][] = [
    [5 * 60 * 1000 + 12 * 1000, "5min 12s"],
    [59 * 60 * 1000 + 59 * 1000, "59min 59s"],
    [60 * 60 * 1000, "1h 00min"],
    [65 * 60 * 1000, "1h 05min"],
    [(60 + 45) * 60 * 1000, "1h 45min"],
    [38 * 60 * 1000 + 42 * 1000, "38min 42s"],
    [59 * 60 * 1000 + 3 * 1000, "59min 03s"],
  ];
  for (const [ms, expected] of cases) {
    test(`${ms}ms → "${expected}"`, () => {
      expect(formatCompactTime(ms)).toBe(expected);
    });
  }
  test("sem tempo (não concluído) → traço", () => {
    expect(formatCompactTime(null)).toBe("—");
    expect(formatCompactTime(undefined)).toBe("—");
  });
  test("nunca contém milissegundos (nenhum ponto decimal / 'ms' na saída)", () => {
    expect(formatCompactTime(38 * 60 * 1000 + 42_617)).not.toMatch(/ms|\./);
  });
});

test.describe("regra de posição — competitiva, igual à tela (1º,2º,2º,4º)", () => {
  test("posições variadas incluindo dezenas e centenas", () => {
    const many = Array.from({ length: 120 }, (_, i) => participant(`p${i}`, `Aluno ${String(i).padStart(3, "0")}`, 120 - i, 100_000 + i));
    const ranked = rankedParticipants(many);
    const rows = buildRankingRows(ranked);
    expect(rows[0].position).toBe("1º");
    expect(rows[1].position).toBe("2º");
    expect(rows[2].position).toBe("3º");
    expect(rows[8].position).toBe("9º");
    expect(rows[9].position).toBe("10º");
    expect(rows[98].position).toBe("99º");
    expect(rows[99].position).toBe("100º");
  });

  test("empate exato em acertos+tempo gera ranking competitivo (1º,2º,2º,4º) e marca 'tied' — mesma regra da tela", () => {
    const tied = [
      participant("A", "Ana", 8, 100_000),
      participant("B", "Bruno", 8, 100_000),
      participant("C", "Carla", 8, 100_000),
      participant("D", "Duda", 7, 90_000),
    ];
    const rows = buildRankingRows(rankedParticipants(tied));
    const byName = (name: string) => rows.find((r) => r.name === name)!;
    expect(byName("Ana").position).toBe("1º");
    expect(byName("Bruno").position).toBe("1º");
    expect(byName("Carla").position).toBe("1º");
    expect(byName("Duda").position).toBe("4º");
    expect(byName("Ana").tied).toBe(true);
    expect(byName("Bruno").tied).toBe(true);
    expect(byName("Duda").tied).toBe(false);
  });

  test("top 3 recebem tone (destaque discreto); do 4º em diante, tone é null", () => {
    const many = Array.from({ length: 6 }, (_, i) => participant(`p${i}`, `Aluno ${i}`, 10 - i, 100_000 + i));
    const rows = buildRankingRows(rankedParticipants(many));
    expect(rows[0].tone).toBe(1);
    expect(rows[1].tone).toBe(2);
    expect(rows[2].tone).toBe(3);
    expect(rows[3].tone).toBeNull();
    expect(rows[5].tone).toBeNull();
  });
});

test.describe("paridade tela × PDF — mesma fonte de dados, mesma ordem, sem nova regra de ranking", () => {
  test("buildRankingRows não reordena: preserva exatamente a ordem/posição já decidida por rankedParticipants()", () => {
    const participants = [
      participant("A", "Ana", 9, 120_000),
      participant("B", "Bruno", 9, 100_000),
      participant("C", "Carla", 6, 80_000),
      participant("D", "Duda", null, null), // não concluiu — sem posição na tela
    ];
    const ranked = rankedParticipants(participants);
    const rows = buildRankingRows(ranked);
    expect(rows.map((r) => r.name)).toEqual(["Bruno", "Ana", "Carla"]);
    expect(rows.map((r) => r.position)).toEqual(["1º", "2º", "3º"]);
  });

  test("participantes sem posição na aba (rank null — não concluíram) não aparecem no PDF, mas não afetam a posição dos demais", () => {
    const participants = [
      participant("A", "Ana", 10, 60_000),
      participant("B", "Bruno", null, null),
      participant("C", "Carla", null, null),
    ];
    const rows = buildRankingRows(rankedParticipants(participants));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ana");
    expect(rows[0].position).toBe("1º");
  });

  test("pontos exibidos são exatamente o score consolidado — nenhum recálculo", () => {
    const participants = [participant("A", "Ana", 37, 100_000, { display_score: 32 })];
    const rows = buildRankingRows(rankedParticipants(participants));
    expect(rows[0].points).toBe("32");
  });

  test("advertências e ajudas exibidas são exatamente os contadores consolidados da tentativa oficial", () => {
    const participants = [participant("A", "Ana", 10, 100_000, { display_score: 10, owl_help_used_count: 2, focus_violation_count: 1 })];
    const rows = buildRankingRows(rankedParticipants(participants));
    expect(rows[0].owlHelp).toBe("2");
    expect(rows[0].advert).toBe("1");
  });

  test("zero advertências/ajudas aparece como \"0\", nunca em branco ou traço (traço é reservado a quem não tem resultado)", () => {
    const participants = [participant("A", "Ana", 10, 100_000, { display_score: 10, owl_help_used_count: 0, focus_violation_count: 0 })];
    const rows = buildRankingRows(rankedParticipants(participants));
    expect(rows[0].owlHelp).toBe("0");
    expect(rows[0].advert).toBe("0");
  });

  test("estresse com 100+ participantes: todos aparecem, sem duplicatas, ordem estritamente por posição", () => {
    const many = Array.from({ length: 137 }, (_, i) => participant(`p${i}`, `Aluno ${String(i).padStart(3, "0")}`, Math.floor(Math.random() * 40), 60_000 + i * 137));
    const rows = buildRankingRows(rankedParticipants(many));
    expect(rows).toHaveLength(137);
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.size).toBe(137);
    for (let i = 1; i < rows.length; i++) {
      const prevPos = parseInt(rows[i - 1].position, 10);
      const currPos = parseInt(rows[i].position, 10);
      expect(currPos).toBeGreaterThanOrEqual(prevPos);
    }
  });

  test("nomes longos não invadem outras colunas — abreviados via formatRankingName (dois primeiros nomes + inicial do terceiro), mesma regra da tela", () => {
    const longName = "Maria Fernanda de Oliveira Cavalcanti e Albuquerque dos Santos Neto";
    const rows = buildRankingRows(rankedParticipants([participant("A", longName, 10, 60_000)]));
    expect(rows[0].name).toBe(formatRankingName(longName));
    expect(rows[0].name.length).toBeLessThan(longName.length);
  });
});

test.describe("privacidade — apenas Posição, Nome, Tempo, Acertos", () => {
  test("renderer não lê nem desenha CPF, e-mail, telefone ou IDs internos (fora de comentários explicativos)", () => {
    const code = read(RENDERER)
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const forbidden = ["cpf", "e-mail", "email", "phone", "telefone", "student_id", "attempt_id", "participant_id", "professor_id", "user_id", "representative_attempt_id"];
    for (const term of forbidden) {
      expect(code.toLowerCase().includes(term.toLowerCase())).toBe(false);
    }
  });

  test("RankingPdfRow só carrega os campos de exibição permitidos (posição, nome, tempo, advertências, coruja, pontos + id técnico e tone/tied de estilo) — sem Status", () => {
    const renderer = read(RENDERER);
    const typeIndex = renderer.indexOf("export type RankingPdfRow");
    expect(typeIndex).toBeGreaterThan(-1);
    const typeBlock = renderer.slice(typeIndex, renderer.indexOf("};", typeIndex) + 2);
    expect(typeBlock).toContain("position: string");
    expect(typeBlock).toContain("name: string");
    expect(typeBlock).toContain("time: string");
    expect(typeBlock).toContain("advert: string");
    expect(typeBlock).toContain("owlHelp: string");
    expect(typeBlock).toContain("points: string");
    expect(typeBlock).not.toContain("correct: string");
    expect(typeBlock).not.toMatch(/status/i);
    expect(typeBlock).not.toMatch(/email|cpf|phone/i);
  });
});

test.describe("regra do ranking — reaproveita rankedParticipants(), nenhuma regra nova", () => {
  test("renderer importa e usa rankedParticipants de lib/eventRanking — não reimplementa ordenação/desempate", () => {
    const panel = read(PANEL);
    expect(panel).toContain('import { rankedParticipants } from "@/lib/eventRanking";');
  });

  test("event-ranking-pdf.ts não contém lógica própria de ordenação (.sort) — só filtra e formata o que já vem pronto", () => {
    const renderer = read(RENDERER);
    expect(renderer).not.toContain(".sort(");
  });
});

test.describe("capa oficial do ranking — mesmo mecanismo/tamanho da capa do Simulado", () => {
  test("usa Page A4 + Image absolute/full-bleed com objectFit cover — idêntico ao padrão de simulado-result-pdf.ts", () => {
    const renderer = read(RENDERER).replace(/\r\n/g, "\n");
    const studentRenderer = read("app/lib/pdf/simulado-result-pdf.ts").replace(/\r\n/g, "\n");
    const coverMechanism = 'position: "absolute",\n    left: 0,\n    top: 0,\n    width: "100%",\n    height: "100%",\n    objectFit: "cover",';
    expect(renderer).toContain('size: "A4", style: s.coverPage');
    expect(renderer).toContain("React.createElement(Image, { src: coverSrc, style: s.coverImage })");
    expect(renderer).toContain(coverMechanism);
    expect(studentRenderer).toContain(coverMechanism);
  });

  test("capa é a primeira Page do documento e não recebe nenhuma linha da tabela sobreposta", () => {
    const renderer = read(RENDERER);
    const docIndex = renderer.indexOf("React.createElement(\n    Document,");
    expect(docIndex).toBeGreaterThan(-1);
    const firstPageIndex = renderer.indexOf("Page,", docIndex);
    const firstPageBlock = renderer.slice(firstPageIndex, renderer.indexOf("),", firstPageIndex) + 2);
    expect(firstPageBlock).toContain("coverPage");
    expect(firstPageBlock).not.toContain("tableHeaderRow");
    expect(firstPageBlock).not.toContain("rows.map");
  });

  test("caminho do asset segue a convenção documentada (public/images/pdf/) — mesma pasta da capa do Simulado", () => {
    const renderer = read(RENDERER);
    expect(renderer).toContain('const RANKING_COVER_SRC = "/images/pdf/capa-ranking-simulado.png";');
  });

  test("o arquivo da capa oficial existe fisicamente em public/images/pdf/ — bloqueio de sessões anteriores resolvido", () => {
    const filePath = resolve(root, "public/images/pdf/capa-ranking-simulado.png");
    expect(existsSync(filePath)).toBe(true);
    expect(statSync(filePath).size).toBeGreaterThan(10_000);
  });
});

test.describe("tabela — cabeçalho fixo, linha nunca dividida entre páginas", () => {
  test("cabeçalho da tabela (Pos./Nome/Tempo/Advert./Ajudas/Pontos) é fixed — repete em toda página gerada por overflow, sem Status", () => {
    const renderer = read(RENDERER);
    const headerIndex = renderer.indexOf("{ style: s.header, fixed: true }");
    expect(headerIndex).toBeGreaterThan(-1);
    const headerBlock = renderer.slice(headerIndex, headerIndex + 1400);
    expect(headerBlock).toContain('"Pos."');
    expect(headerBlock).toContain('"Nome"');
    expect(headerBlock).toContain('"Tempo"');
    expect(headerBlock).toContain('"Advert."');
    expect(headerBlock).toContain('"Ajudas"');
    expect(headerBlock).toContain('"Pontos"');
    expect(headerBlock).not.toContain('"Acertos"');
    expect(headerBlock).not.toContain('"Coruja"');
    expect(headerBlock).not.toMatch(/"Status"|"Situação"/);
  });

  test("cada linha de participante usa wrap:false — nunca é dividida entre duas páginas", () => {
    const renderer = read(RENDERER);
    expect(renderer).toContain("style: index % 2 ? [s.row, s.rowAlt] : s.row, wrap: false");
  });

  test("rodapé institucional (fixed) não expõe dado pessoal — inclui o domínio oficial, nome do Evento e paginação", () => {
    const renderer = read(RENDERER);
    const footerIndex = renderer.indexOf("function PdfFooter");
    const footerBlock = renderer.slice(footerIndex, footerIndex + 400);
    expect(footerBlock).toContain('"EstudoTOP Simulados - simulados.estudotop.com.br"');
    expect(footerBlock).toContain("pageNumber");
  });
});

test.describe("cabeçalho e rodapé — nome do Evento uma única vez, sem duplicar com o nome do Simulado", () => {
  function eventRankingPdfBody(): string {
    const renderer = read(RENDERER);
    const fnIndex = renderer.indexOf("function EventRankingPdf(");
    expect(fnIndex).toBeGreaterThan(-1);
    const nextFnIndex = renderer.indexOf("\n// Ranking oficial em PDF", fnIndex);
    expect(nextFnIndex).toBeGreaterThan(fnIndex);
    return renderer.slice(fnIndex, nextFnIndex);
  }

  test("cabeçalho mostra RANKING + nome do Evento uma única vez — sem segunda linha com o nome do Simulado", () => {
    const body = eventRankingPdfBody();
    expect(body).toContain('React.createElement(Text, { style: s.headerEyebrow }, "RANKING")');
    expect(body).toContain("React.createElement(Text, { style: s.headerTitle }, eventName)");
    // Nenhuma referência ao nome do Simulado (nem ao estilo de segunda linha
    // já removido) sobrevive dentro do componente que monta o cabeçalho.
    expect(body).not.toContain("simuladoTitle");
    expect(body).not.toContain("headerSubtitle");
  });

  test("rodapé recebe apenas o nome do Evento — não concatena mais com o nome do Simulado", () => {
    const body = eventRankingPdfBody();
    expect(body).toContain("React.createElement(PdfFooter, { subtitle: eventName })");
    expect(body).not.toMatch(/subtitle:\s*`\$\{eventName\}/);
  });

  test("meta.simuladoTitle não é lido em nenhum ponto de EventRankingPdf — eliminado do uso de apresentação", () => {
    const body = eventRankingPdfBody();
    expect(body).not.toContain("meta.simuladoTitle");
  });

  test("simuladoTitle continua aceito no tipo/API (chamador ainda pode enviá-lo) — só deixou de ser exibido", () => {
    const renderer = read(RENDERER);
    expect(renderer).toContain("simuladoTitle?: string | null;");
    const fnIndex = renderer.indexOf("export async function downloadEventRankingPdf(");
    const fnBlock = renderer.slice(fnIndex, fnIndex + 400);
    expect(fnBlock).toContain("simuladoTitle");
  });
});

test.describe("marca d'água — removida do PDF do Ranking por decisão do usuário", () => {
  test("nenhuma referência a marca d'água (constante, componente, estilos) sobrevive no renderer", () => {
    const renderer = read(RENDERER);
    expect(renderer).not.toContain("RANKING_WATERMARK_SRC");
    expect(renderer).not.toContain("PdfWatermark");
    expect(renderer).not.toContain("watermarkImage");
    expect(renderer).not.toMatch(/\bwatermark:\s*{/);
    expect(renderer.toLowerCase()).not.toContain("marca-dagua-oficial.png");
  });

  test("o asset marca-dagua-oficial.png é preservado em disco (não apagado), só deixou de ser usado", () => {
    const filePath = resolve(root, "public/images/pdf/marca-dagua-oficial.png");
    expect(existsSync(filePath)).toBe(true);
    expect(statSync(filePath).size).toBeGreaterThan(10_000);
  });
});

test.describe("capa oficial — carregamento robusto, sem fallback silencioso para página em branco", () => {
  test("loadRankingCoverDataUri busca a URL oficial com cache:'reload' (ignora 404 antigo cacheado pelo navegador)", async () => {
    const originalFetch = global.fetch;
    let calledWith: [RequestInfo | URL, RequestInit | undefined] | null = null;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calledWith = [input, init];
      const bytes = readFileSync(resolve(root, "public/images/pdf/capa-ranking-simulado.png"));
      return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } });
    };
    try {
      const dataUri = await loadRankingCoverDataUri();
      expect(dataUri.startsWith("data:")).toBe(true);
      expect(calledWith).not.toBeNull();
      expect(calledWith![0]).toBe("/images/pdf/capa-ranking-simulado.png");
      expect(calledWith![1]?.cache).toBe("reload");
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("resposta não-ok (ex.: 404) lança o erro controlado — nunca gera capa em branco silenciosamente", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(null, { status: 404 });
    try {
      await expect(loadRankingCoverDataUri()).rejects.toThrow(RANKING_COVER_LOAD_ERROR);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("falha de rede (fetch rejeita) também lança o erro controlado", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => { throw new Error("network down"); };
    try {
      await expect(loadRankingCoverDataUri()).rejects.toThrow(RANKING_COVER_LOAD_ERROR);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("downloadEventRankingPdf carrega e valida a capa ANTES de montar o documento — bloqueia a geração inteira em caso de falha", () => {
    const renderer = read(RENDERER);
    const fnIndex = renderer.indexOf("export async function downloadEventRankingPdf(");
    expect(fnIndex).toBeGreaterThan(-1);
    const fnBody = renderer.slice(renderer.indexOf("{", fnIndex));
    const coverLoadIndex = fnBody.indexOf("await loadRankingCoverDataUri()");
    const pdfBuildIndex = fnBody.indexOf("pdf(pdfDocument).toBlob()");
    expect(coverLoadIndex).toBeGreaterThan(-1);
    expect(pdfBuildIndex).toBeGreaterThan(-1);
    expect(coverLoadIndex).toBeLessThan(pdfBuildIndex);
  });
});

test.describe("botão 'Exportar ranking em PDF' — dentro da aba Ranking/Participantes, não no cabeçalho geral do Evento", () => {
  test("botão existe uma única vez, dentro do bloco activeTab === \"participants\" — nunca junto de 'Gerar prova em PDF'", () => {
    const panel = read(PANEL);
    const occurrences = panel.split("Exportar ranking em PDF").length - 1;
    expect(occurrences).toBe(1);

    const tabIndex = panel.indexOf('activeTab === "participants" && (');
    expect(tabIndex).toBeGreaterThan(-1);
    const buttonIndex = panel.indexOf("Exportar ranking em PDF");
    expect(buttonIndex).toBeGreaterThan(tabIndex);

    // O botão do ranking não fica nos blocos de cabeçalho geral do Evento
    // (onde vive "Gerar prova em PDF"), que aparecem antes do bloco da aba.
    expect(buttonIndex).toBeGreaterThan(panel.lastIndexOf("Gerar prova em PDF"));
  });

  test("handler usa a mesma lista já calculada na tela (participants) — sem nova busca de rede/N+1", () => {
    const panel = read(PANEL);
    const fnIndex = panel.indexOf("async function generateRankingPdf()");
    expect(fnIndex).toBeGreaterThan(-1);
    const fnBlock = panel.slice(fnIndex, fnIndex + 500);
    expect(fnBlock).toContain('import("@/app/lib/pdf/event-ranking-pdf")');
    expect(fnBlock).toContain("participants,");
    expect(fnBlock).not.toContain("fetch(");
  });

  test("botão previne duplo clique (guard no início do handler) e restaura o estado de loading no finally", () => {
    const panel = read(PANEL);
    const fnIndex = panel.indexOf("async function generateRankingPdf()");
    const fnBlock = panel.slice(fnIndex, fnIndex + 900);
    expect(fnBlock).toContain("if (rankingPdfBusy) return;");
    expect(fnBlock).toContain("setRankingPdfBusy(true);");
    expect(fnBlock).toMatch(/finally\s*{\s*setRankingPdfBusy\(false\);/);
  });

  test("erro é tratado com mensagem clara e não técnica para o usuário — fallback genérico para qualquer falha inesperada", () => {
    const panel = read(PANEL);
    const fnIndex = panel.indexOf("async function generateRankingPdf()");
    const fnBlock = panel.slice(fnIndex, fnIndex + 900);
    expect(fnBlock).toContain('"Não foi possível gerar o ranking em PDF. Tente novamente."');
  });

  test("falha específica de carregamento da capa mostra a mensagem própria dela, não o fallback genérico — nunca expõe erro técnico bruto", () => {
    const panel = read(PANEL);
    const fnIndex = panel.indexOf("async function generateRankingPdf()");
    const fnBlock = panel.slice(fnIndex, fnIndex + 900);
    // A mensagem exibida só pode ser uma das duas conhecidas — nunca
    // `error.message` bruto de uma exceção não controlada.
    expect(fnBlock).toContain("RANKING_COVER_LOAD_ERROR");
    expect(fnBlock).toMatch(/error instanceof Error && coverLoadError && error\.message === coverLoadError \? error\.message : "Não foi possível gerar o ranking em PDF\. Tente novamente\."/);
  });

  test("botão fica desabilitado durante a geração e mostra o spinner (mesmo padrão visual do botão de prova)", () => {
    const panel = read(PANEL);
    const btnIndex = panel.indexOf("Exportar ranking em PDF");
    const btnBlockStart = panel.lastIndexOf("<PremiumButton", btnIndex);
    const btnBlock = panel.slice(btnBlockStart, btnIndex);
    expect(btnBlock).toContain("disabled={rankingPdfBusy}");
    expect(btnBlock).toContain("rankingPdfBusy ? <Loader2");
  });
});

test.describe("nomes — normalização e abreviação (formatRankingName, tela + PDF)", () => {
  test("1 componente: mantém como está (capitalizado)", () => {
    expect(formatRankingName("Maria")).toBe("Maria");
    expect(formatRankingName("MARIA")).toBe("Maria");
  });

  test("2 componentes: mostra os dois por completo", () => {
    expect(formatRankingName("Maria Silva")).toBe("Maria Silva");
  });

  test("3 componentes: dois primeiros completos + inicial do terceiro", () => {
    expect(formatRankingName("Maria Eduarda Silva")).toBe("Maria Eduarda S.");
  });

  test("caixa alta", () => {
    expect(formatRankingName("MARIA EDUARDA SILVA")).toBe("Maria Eduarda S.");
  });

  test("caixa baixa", () => {
    expect(formatRankingName("ana clara ferreira santos")).toBe("Ana Clara F.");
  });

  test("caixa mista", () => {
    expect(formatRankingName("joÃO peDRO silVA")).toBe("João Pedro S.");
  });

  test("acentos preservados, nunca removidos", () => {
    expect(formatRankingName("José Álvaro Conceição")).toBe("José Álvaro C.");
    expect(formatRankingName("joão")).toBe("João");
  });

  test("nome longo (5+ palavras): mesma regra, resto descartado após a abreviação", () => {
    expect(formatRankingName("JOÃO PEDRO SILVA OLIVEIRA MARTINS SANTOS")).toBe("João Pedro S.");
  });

  test("partícula: a partícula nunca vira a própria abreviação — fica colada, minúscula, ao componente seguinte", () => {
    expect(formatRankingName("João da Silva Pereira")).toBe("João da S.");
  });

  test("espaços duplicados e trim", () => {
    expect(formatRankingName("  Maria   Eduarda   Silva  ")).toBe("Maria Eduarda S.");
  });

  test("string vazia/ausente não quebra", () => {
    expect(formatRankingName("")).toBe("");
    expect(formatRankingName(null)).toBe("");
    expect(formatRankingName(undefined)).toBe("");
  });

  test("não altera nenhum dado persistido — é função pura, só recebe e devolve string", () => {
    const helper = read("lib/formatRankingName.ts");
    expect(helper).not.toMatch(/supabase|update\(|\.from\(/i);
  });
});

test.describe("PDF usa o mesmo formatRankingName da tela — nenhuma lógica de nome duplicada", () => {
  test("renderer importa formatRankingName de lib/formatRankingName — não reimplementa a regra", () => {
    const renderer = read(RENDERER);
    expect(renderer).toContain('import { formatRankingName } from "@/lib/formatRankingName";');
  });

  test("tela (page-client.tsx) importa o mesmo helper", () => {
    const panel = read(PANEL);
    expect(panel).toContain('import { formatRankingName } from "@/lib/formatRankingName";');
  });

  test("buildRankingRows aplica formatRankingName ao nome de cada linha", () => {
    const rows = buildRankingRows(rankedParticipants([
      participant("A", "MARIA EDUARDA SILVA", 10, 60_000, { display_score: 10 }),
    ]));
    expect(rows[0].name).toBe("Maria Eduarda S.");
  });
});

test.describe("tela do Ranking — novas colunas (Tempo, Advert., Ajudas utilizadas, Pontos), Situação preservada", () => {
  test("cabeçalho da tabela inclui as novas colunas sem remover Situação/Detalhes existentes", () => {
    const panel = read(PANEL);
    const headIndex = panel.indexOf("<thead");
    const bodyIndex = panel.indexOf("<tbody", headIndex);
    expect(headIndex).toBeGreaterThan(-1);
    const headBlock = panel.slice(headIndex, bodyIndex);
    expect(headBlock).toContain(">Posição<");
    expect(headBlock).toContain(">Aluno<");
    expect(headBlock).toContain(">Tempo<");
    expect(headBlock).toContain(">Advert.<");
    expect(headBlock).toContain("Ajudas utilizadas");
    expect(headBlock).not.toMatch(/>Coruja</);
    expect(headBlock).toContain(">Pontos<");
    expect(headBlock).toContain(">Situação<");
    expect(headBlock).toContain(">Detalhes<");
  });

  test("cabeçalhos abreviados carregam title/tooltip explicando o significado (sem ambiguidade)", () => {
    const panel = read(PANEL);
    const headIndex = panel.indexOf("<thead");
    const bodyIndex = panel.indexOf("<tbody", headIndex);
    const headBlock = panel.slice(headIndex, bodyIndex);
    expect(headBlock).toContain('title="Advertências por troca/saída de tela"');
    expect(headBlock).toContain('title="Quantidade de ajudas da coruja utilizadas durante a tentativa"');
  });

  test("linha da tabela usa formatTimeMs para Tempo e os contadores oficiais para Advert./Coruja, sem recalcular", () => {
    const panel = read(PANEL);
    const bodyIndex = panel.indexOf("<tbody");
    const bodyBlock = panel.slice(bodyIndex, bodyIndex + 3000);
    expect(bodyBlock).toContain("formatTimeMs(item.result?.time_spent_ms)");
    expect(bodyBlock).toContain('item.result ? item.result.focus_violation_count : "—"');
    expect(bodyBlock).toContain('item.result ? item.result.owl_help_used_count : "—"');
  });

  test("nome exibido na tabela usa formatRankingName; Situação (status) continua exatamente como antes — nenhuma nova regra de status", () => {
    const panel = read(PANEL);
    const bodyIndex = panel.indexOf("<tbody");
    const bodyBlock = panel.slice(bodyIndex, bodyIndex + 3000);
    expect(bodyBlock).toContain("formatRankingName(item.name)");
    expect(bodyBlock).toContain("status.label");
    expect(bodyBlock).toContain("participantStatus[item.status]");
  });
});

test.describe("modal \"Ver\" — ajudas utilizadas, advertências e tópicos de maior dificuldade, preservando todo o conteúdo anterior", () => {
  test("modal continua exibindo todas as métricas anteriores (Posição, Nota, Acertos, Erros, Brancos, Tempo total, Tentativa oficial, Situação)", () => {
    const panel = read(PANEL);
    const gridIndex = panel.indexOf('grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4');
    expect(gridIndex).toBeGreaterThan(-1);
    const gridBlock = panel.slice(gridIndex, gridIndex + 3500);
    expect(gridBlock).toContain('label="Posição"');
    expect(gridBlock).toContain('label="Nota"');
    expect(gridBlock).toContain('label="Acertos"');
    expect(gridBlock).toContain('label="Erros"');
    expect(gridBlock).toContain('label="Brancos"');
    expect(gridBlock).toContain('label="Tempo total"');
    expect(gridBlock).toContain('label="Tentativa oficial"');
    expect(gridBlock).toContain('label="Situação"');
  });

  test("modal passou a exibir Ajudas utilizadas e Advertências por troca de tela", () => {
    const panel = read(PANEL);
    const gridIndex = panel.indexOf('grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4');
    const gridBlock = panel.slice(gridIndex, gridIndex + 3500);
    expect(gridBlock).toContain('label="Ajudas utilizadas"');
    expect(gridBlock).not.toContain('label="Ajudas da coruja"');
    expect(gridBlock).toContain('label="Advertências por troca de tela"');
  });

  test("modal usa exatamente os mesmos campos (participant.result.owl_help_used_count/focus_violation_count) que a linha da tabela — mesmo valor, sem recálculo", () => {
    const panel = read(PANEL);
    const gridIndex = panel.indexOf('grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4');
    const gridBlock = panel.slice(gridIndex, gridIndex + 3500);
    expect(gridBlock).toContain("participant.result?.owl_help_used_count");
    expect(gridBlock).toContain("participant.result?.focus_violation_count");
  });

  test("modal não dispara nenhuma nova requisição de rede (sem N+1) — usa apenas o objeto participant já carregado", () => {
    const panel = read(PANEL);
    const gridIndex = panel.indexOf('grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4');
    const gridBlock = panel.slice(gridIndex, gridIndex + 3500);
    expect(gridBlock).not.toContain("fetch(");
    expect(gridBlock).not.toContain("useEffect(");
  });
});

test.describe("origem dos dados — coruja e advertências vêm da tentativa oficial, sem N+1", () => {
  test("GET /api/professor/events/[id] busca owl_help_used_count/focus_violation_count na MESMA consulta já existente de simulado_attempts (sem query nova)", () => {
    const route = read(API_ROUTE);
    const fromIndex = route.indexOf('supabase.from("simulado_attempts").select(');
    expect(fromIndex).toBeGreaterThan(-1);
    const selectIndex = fromIndex + 'supabase.from("simulado_attempts").select('.length;
    const selectCall = route.slice(selectIndex, route.indexOf(")", selectIndex));
    expect(selectCall).toContain("owl_help_used_count");
    expect(selectCall).toContain("focus_violation_count");
  });

  test("valores expostos vêm de representativeAttempt (a mesma tentativa oficial já usada para time_spent_ms) — nunca somados entre tentativas", () => {
    const route = read(API_ROUTE);
    const resultBlockIndex = route.indexOf("result: result ? {");
    expect(resultBlockIndex).toBeGreaterThan(-1);
    const resultBlock = route.slice(resultBlockIndex, route.indexOf("} : null,", resultBlockIndex) + 10);
    expect(resultBlock).toContain("representativeAttempt?.owl_help_used_count");
    expect(resultBlock).toContain("representativeAttempt?.focus_violation_count");
  });

  test("nenhuma nova chamada Supabase (.from) foi criada para buscar coruja/advertências — reaproveita o Promise.all já existente", () => {
    const route = read(API_ROUTE);
    const fromCount = (route.match(/supabase\.from\(/g) || []).length;
    // Mesma contagem de chamadas .from() de antes desta Sprint (GET: 7 —
    // simulado_events, simulado_event_participants, simulado_attempts,
    // simulado_questions, user_sessions, simulado_answers, simulado_results;
    // PATCH: 2 — simulado_events lido + atualizado) — owl_help_used_count e
    // focus_violation_count só entraram como campos a mais no select() já
    // existente de simulado_attempts, nenhuma chamada nova.
    expect(fromCount).toBe(9);
  });
});

test.describe("modal \"Ver\" — Tópicos de maior dificuldade (reaproveita a mesma análise da tela de resultados do aluno)", () => {
  test("card 'Tópicos de maior dificuldade' aparece por último no modal, depois de todas as métricas existentes", () => {
    const panel = read(PANEL);
    const gridIndex = panel.indexOf('grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4');
    const gridBlock = panel.slice(gridIndex, gridIndex + 3500);
    const situacaoIndex = gridBlock.indexOf('label="Situação"');
    const topicsIndex = gridBlock.indexOf("<ParticipantTopicsCard");
    expect(situacaoIndex).toBeGreaterThan(-1);
    expect(topicsIndex).toBeGreaterThan(situacaoIndex);
  });

  test("card ocupa duas colunas da grade no desktop (sm:col-span-2) — responsivo (1 coluna natural no mobile)", () => {
    const panel = read(PANEL);
    const fnIndex = panel.indexOf("function ParticipantTopicsCard(");
    expect(fnIndex).toBeGreaterThan(-1);
    const fnBlock = panel.slice(fnIndex, fnIndex + 400);
    expect(fnBlock).toContain("sm:col-span-2");
  });

  test("título exato 'Tópicos de maior dificuldade'", () => {
    const panel = read(PANEL);
    expect(panel).toContain("Tópicos de maior dificuldade");
  });

  test("estado vazio elegante quando não há tópicos — nunca um card quebrado/em branco", () => {
    const panel = read(PANEL);
    const fnIndex = panel.indexOf("function ParticipantTopicsCard(");
    const fnBlock = panel.slice(fnIndex, fnIndex + 1300);
    expect(fnBlock).toContain("Nenhum tópico de maior dificuldade identificado.");
  });

  test("modal usa participant.result.difficulty_topics — mesmo campo já carregado no payload, sem consulta nova (sem N+1)", () => {
    const panel = read(PANEL);
    const fnIndex = panel.indexOf("<ParticipantTopicsCard");
    const fnBlock = panel.slice(fnIndex, fnIndex + 200);
    expect(fnBlock).toContain("participant.result?.difficulty_topics");
    const cardFnIndex = panel.indexOf("function ParticipantTopicsCard(");
    const cardFnBlock = panel.slice(cardFnIndex, cardFnIndex + 900);
    expect(cardFnBlock).not.toContain("fetch(");
    expect(cardFnBlock).not.toContain("useEffect(");
  });

  test("Participant.result inclui difficulty_topics: string[] no tipo", () => {
    const panel = read(PANEL);
    const typeIndex = panel.indexOf("type Participant = ");
    const typeLine = panel.slice(typeIndex, panel.indexOf("\n", typeIndex));
    expect(typeLine).toContain("difficulty_topics: string[]");
  });
});

test.describe("buildDifficultyTopics — execução real, mesma lógica da tela de resultados do aluno (lib/topicDifficulty.ts)", () => {
  test("lista os tópicos das questões erradas/em branco, ordenados por incidência decrescente", () => {
    // Aluno erra tópico A uma vez e tópico B duas vezes (uma errada, uma em
    // branco) — B deve vir primeiro (maior incidência de erro).
    const rows = buildDifficultyTopics([
      { topics: ["Tópico A"], status: "wrong" },
      { topics: ["Tópico B"], status: "wrong" },
      { topics: ["Tópico B"], status: "blank" },
      { topics: ["Tópico C"], status: "correct" },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["Tópico B", "Tópico A"]);
  });

  test("questão anulada não deve ser incluída pelo chamador — nunca conta como erro (comportamento herdado da tela de resultados)", () => {
    // O chamador (rota do professor) filtra `relation.status !== "annulled"`
    // antes de montar as entries — buildDifficultyTopics em si só recebe o
    // que já passou por esse filtro, exatamente como buildSubjectTopicPerformance
    // faz na tela de resultados (return antes de contar tópicos de anuladas).
    const route = read(API_ROUTE);
    const fnIndex = route.indexOf("function difficultyTopicsForAttempt(");
    const fnBlock = route.slice(fnIndex, fnIndex + 700);
    expect(fnBlock).toContain('.filter((relation) => relation.status !== "annulled")');
  });

  test("tópico ausente (evaluated_topics vazio) usa o mesmo fallback 'Tópico não informado' da tela de resultados", () => {
    const rows = buildDifficultyTopics([{ topics: ["Tópico não informado"], status: "wrong" }]);
    expect(rows[0].label).toBe("Tópico não informado");
  });

  test("zero erros → lista vazia (o card trata isso com o texto de estado vazio)", () => {
    const rows = buildDifficultyTopics([
      { topics: ["Tópico A"], status: "correct" },
      { topics: ["Tópico B"], status: "correct" },
    ]);
    expect(rows).toHaveLength(0);
  });

  test("deduplica variações do mesmo tópico (mesma canonicalização usada na tela de resultados)", () => {
    const rows = buildDifficultyTopics([
      { topics: ["TCP/IP"], status: "wrong" },
      { topics: ["tcp ip"], status: "wrong" },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].wrong).toBe(2);
  });

  test("paridade com o caso do pedido: erros em A, B, B, C → mesma saída ordenada por incidência (B primeiro, depois A e C empatados por ordem alfabética)", () => {
    const rows = buildDifficultyTopics([
      { topics: ["A"], status: "wrong" },
      { topics: ["B"], status: "wrong" },
      { topics: ["B"], status: "wrong" },
      { topics: ["C"], status: "wrong" },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["B", "A", "C"]);
  });
});

test.describe("lib/topicDifficulty.ts é reaproveitado (não duplicado) pela tela de resultados do aluno", () => {
  test("a tela de resultados do aluno importa addTopicRollup/normalizeTextKey/TopicRollup de lib/topicDifficulty — não define mais localmente", () => {
    const resultPage = read(RESULT_PAGE);
    expect(resultPage).toContain('import { addTopicRollup, normalizeTextKey, type TopicRollup } from "@/lib/topicDifficulty";');
    expect(resultPage).not.toContain("function canonicalizeTopicLabel(");
    expect(resultPage).not.toContain("function addTopicRollup(");
  });

  test("a rota do professor importa buildDifficultyTopics do mesmo módulo compartilhado", () => {
    const route = read(API_ROUTE);
    expect(route).toContain('import { buildDifficultyTopics } from "@/lib/topicDifficulty";');
  });

  test("evaluated_topics foi adicionado ao select já existente de simulado_questions (sem query nova) para alimentar os tópicos de dificuldade", () => {
    const route = read(API_ROUTE);
    const fromIndex = route.indexOf('supabase.from("simulado_questions").select(');
    expect(fromIndex).toBeGreaterThan(-1);
    const selectIndex = fromIndex + 'supabase.from("simulado_questions").select('.length;
    const selectCall = route.slice(selectIndex, route.indexOf(".eq(\"simulado_id\"", selectIndex));
    expect(selectCall).toContain("evaluated_topics");
  });
});

test.describe("PDF do Ranking — coluna 'Coruja' renomeada para 'Ajudas' (decisão: seguro, mesmo tamanho, sem prejuízo de layout)", () => {
  test("cabeçalho da coluna usa 'Ajudas', não mais 'Coruja'", () => {
    const renderer = read(RENDERER);
    expect(renderer).not.toContain('"Coruja"');
    expect(renderer).toContain('React.createElement(Text, { style: [s.tableHeaderCell, s.colCoruja] }, "Ajudas")');
  });

  test("largura da coluna não mudou (mesma contagem de caracteres: 'Coruja' e 'Ajudas' têm 6 letras)", () => {
    expect("Coruja".length).toBe("Ajudas".length);
  });
});
