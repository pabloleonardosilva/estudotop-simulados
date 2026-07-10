import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { calculateDuplicateScore, jaccardSimilarity } from "@/lib/questions/duplicate-service";
import { normalizeEvaluatedTopics } from "@/lib/questions/evaluated-topics";
import { requireAdmin } from "@/lib/server/authGuard";

function clean(value?: string | null) {
  return (value || "").trim();
}

function normalizeBoardName(value: string) {
  return clean(value).replace(/\s+/g, " ").toUpperCase();
}


function extractJson(text: string) {
  const cleaned = text.trim();

  if (cleaned.startsWith("{")) return cleaned;

  const match = cleaned.match(/\{[\s\S]*\}/);

  return match?.[0] || cleaned;
}

function isValidYear(value: unknown): value is number {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1990 && year <= 2100;
}

function extractYearFromText(text: string): number | null {
  const patterns = [
    /\bano\s*[:\-]?\s*(19\d{2}|20\d{2}|2100)\b/i,
    /\b(19\d{2}|20\d{2}|2100)\s*(?=banca\s*:)/i,
    /\bbanca\s*:[\s\S]{0,120}?\bano\s*[:\-]?\s*(19\d{2}|20\d{2}|2100)\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const year = Number(match[1]);
    if (isValidYear(year)) return year;
  }

  return null;
}

function extractBoardNameFromText(text: string): string {
  const patterns = [
    /\bBanca\s*:\s*([^\n\r]+?)(?=\s+(?:Órgão|Orgao|Provas?|Ano)\s*:|$)/i,
    /\bBanca\s*:\s*([^\n\r]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;

    const boardName = match[1]
      .replace(/\s+/g, " ")
      .replace(/[.,;:\-]+$/g, "")
      .trim();

    if (boardName) return boardName;
  }

  return "";
}

function extractAgencyNameFromText(text: string): string {
  const patterns = [
    /\b(?:Órgão|Orgao)\s*:\s*([^\n\r]+?)(?=\s+(?:Provas?|Banca|Ano|Disciplina|Assunto)\s*:|$)/i,
    /\b(?:Órgão|Orgao)\s*:\s*([^\n\r]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;

    const agencyName = match[1]
      .replace(/\s+/g, " ")
      .replace(/[.,;:\-]+$/g, "")
      .trim();

    if (agencyName) return agencyName;
  }

  return "";
}


type ParsedAlternative = {
  label: string;
  text: string;
  is_correct: boolean;
};

type AiAlternativeLike = {
  label?: string | null;
  is_correct?: boolean | null;
};

const alternativesTitleRegex = /^\s*alternativas?\s*[:\-]?\s*$/i;
const inlineAlternativeRegex = /^\s*([A-E])\s*[).:]\s*(.+)?$/i;
const dashAlternativeRegex = /^\s*([A-E])\s+-\s*(.+)$/i;
const namedAlternativeRegex = /^\s*alternativa\s+([A-E])\s*[).:\-]?\s*(.*)$/i;
const spacedRomanAlternativeRegex =
  /^\s*([A-E])\s+((?:[IVXLCDM]+\.?)(?:\s*(?:,|e)\s*[IVXLCDM]+\.?)*\s*(?:,?\s*apenas\.?)?)$/i;
const isolatedAlternativeLabelRegex = /^\s*([A-E])\s*$/i;
const trueFalseAlternativeRegex = /^\s*(certo|errado)\s*$/i;
const numberedStatementItemRegex = /(?:^|\s)(\d{1,2})\.\s+\S/g;
const numberedStatementItemLineRegex = /^\s*\d{1,2}\.\s+\S/;
const alternativeLabels = ["A", "B", "C", "D", "E"];
const romanAlternativeTextPattern =
  "(?:[IVXLCDM]+\\.?)(?:\\s*(?:,|e)\\s*[IVXLCDM]+\\.?)*\\s*(?:,?\\s*apenas\\.?)?";
const questionMetadataLineRegex =
  /\bAno\s*:\s*(?:19\d{2}|20\d{2}|2100)\b[\s\S]{0,240}?\bBanca\s*:/i;

function isQConcursosJunkLine(line: string) {
  const normalized = line
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  if (!normalized) return false;

  const exactJunk = new Set([
    "mentoria qconcursos",
    "home",
    "concursos publicos",
    "questoes",
    "minhas questoes",
    "nome do novo filtro",
    "palavra chave",
    "excluir questoes",
    "mostrar filtro simples",
    "filtros",
    "filtro",
    "buscar",
    "limpar",
    "aplicar",
    "entrar",
    "cadastre-se",
    "proxima",
    "anterior",
  ]);

  if (exactJunk.has(normalized)) return true;

  return [
    /^receba orientacao/,
    /^foram encontradas? \d+ quest/,
    /^pagina \d+/,
    /^ir para pagina/,
    /^questoes encontradas/,
    /^mostrar filtro/,
    /^ocultar filtro/,
    /^criar novo filtro/,
    /^salvar filtro/,
    /^limpar filtros/,
    /^ordenar por/,
    /^disciplinas?$/,
    /^assuntos?$/,
    /^bancas?$/,
    /^anos?$/,
    /^orgaos?$/,
    /^provas?$/,
  ].some((pattern) => pattern.test(normalized));
}

function isQuestionSignalLine(line: string) {
  const trimmed = line.trim();

  return (
    /^Q\d{3,}/i.test(trimmed) ||
    questionMetadataLineRegex.test(trimmed) ||
    /^(?:Ano|Banca|Ã“rgÃ£o|Orgao|Prova|Disciplina|Assunto)\s*:/i.test(trimmed) ||
    /^\s*(?:quest(?:Ã£o|ao)?\s*)?(?:n[ÂºoÂ°.]?\s*)?\d{1,4}[).:-]\s+/i.test(trimmed) ||
    /^\s*(?:quest(?:Ã£o|ao)\s*|n[ÂºoÂ°.]?\s*)[IVXLCDM]{1,8}[).:-]\s+/i.test(trimmed)
  );
}

function isPostQuestionJunkLine(line: string) {
  const normalized = line
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  if (!normalized) return false;

  if (numberedStatementItemLineRegex.test(line)) return false;

  return (
    isQuestionSignalLine(line) ||
    [
      /^fim da questao$/,
      /^gabarito/,
      /^gabarito comentado/,
      /^aulas?\s*(\(|$)/,
      /^comentarios?\s*(\(|$)/,
      /^estatisticas$/,
      /^cadernos$/,
      /^criar anotacoes$/,
      /^notificar erro$/,
      /^resumo relacionado$/,
      /^questao anterior$/,
      /^proxima questao$/,
      /^responder$/,
      /^ver comentarios$/,
    ].some((pattern) => pattern.test(normalized))
  );
}

function sanitizeImportedText(text: string) {
  const lines = text
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  const filtered = lines.filter((line) => !isQConcursosJunkLine(line));
  // Use only STRONG signals (Q-number, Ano:, Banca:) to trim preamble.
  // Bare numbered lines like "1. Abrir a PASTA1" must NOT trigger preamble removal —
  // they can be numbered steps inside a statement that follows the preceding paragraph.
  const firstSignalIndex = filtered.findIndex((line) => {
    const t = line.trim();
    return (
      /^Q\d{3,}/i.test(t) ||
      questionMetadataLineRegex.test(t) ||
      /^(?:Ano|Banca|[OÓ]rg[aã]o|Orgao|Prova|Disciplina|Assunto)\s*:/i.test(t)
    );
  });
  const usefulLines =
    firstSignalIndex > 0 ? filtered.slice(firstSignalIndex) : filtered;

  return usefulLines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function trimTrailingQuestionJunk(value: string) {
  const lines = normalizeLines(value);
  const kept: string[] = [];

  for (const line of lines) {
    if (isPostQuestionJunkLine(line)) break;
    kept.push(line);
  }

  return kept.join("\n").trim();
}

function hasQuestionIdentity(value: string) {
  return (
    /^Q\d{3,}/im.test(value) ||
    /\bAno\s*[:\-]?\s*(19\d{2}|20\d{2}|2100)\b/i.test(value) ||
    /\bBanca\s*:/i.test(value)
  );
}

function looksLikeQuestionContinuation(value: string) {
  const lines = normalizeLines(value);
  const firstLine = lines[0] || "";

  return (
    !hasQuestionIdentity(value) &&
    (
      alternativesTitleRegex.test(firstLine) ||
      Boolean(parseAlternativeLabel(firstLine)) ||
      isRomanAlternativeText(firstLine) ||
      numberedStatementItemLineRegex.test(firstLine) ||
      /^(?:D|E)\s*$/i.test(firstLine)
    )
  );
}

function coalesceContinuationBlocks(blocks: string[]) {
  const merged: string[] = [];

  for (const block of blocks) {
    const cleaned = sanitizeImportedText(block);
    if (!cleaned) continue;

    if (merged.length > 0 && looksLikeQuestionContinuation(cleaned)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n${cleaned}`.trim();
      continue;
    }

    merged.push(cleaned);
  }

  return merged;
}

function isPreMetadataContextLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length > 80) return false;
  if (parseAlternativeLabel(trimmed) || isRomanAlternativeText(trimmed)) return false;
  if (/^(?:est[aá]\s+corret[ao]|com rela[cç][aã]o|considere|analise|assinale)\b/i.test(trimmed)) {
    return false;
  }

  return /^[\p{L}\d\s/().,\-]+$/u.test(trimmed);
}

function detachPreMetadataContext(lines: string[]) {
  const context: string[] = [];

  while (lines.length > 0 && context.length < 4) {
    const lastLine = lines[lines.length - 1];

    if (!isPreMetadataContextLine(lastLine)) break;

    context.unshift(lines.pop() || "");
  }

  return context;
}

function splitIntoQuestionBlocks(text: string) {
  const normalized = sanitizeImportedText(text);

  if (!normalized) return [];

  const markedRegex =
    /\(?IN[IÍ]CIO DA QUEST(?:ÃO|AO)\)?([\s\S]*?)\(?FIM DA QUEST(?:ÃO|AO)\)?/gi;
  const markedBlocks: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = markedRegex.exec(normalized)) !== null) {
    const block = match[1]?.trim();
    if (block) markedBlocks.push(block);
  }

  if (markedBlocks.length > 0) return markedBlocks;

  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  const strongQuestionStartRegex = /^\s*(?:Q\d{3,}|Ano\s*:)/i;
  const numberedQuestionStartRegex =
    /^\s*(?:quest(?:ão|ao)?\s*)?(?:n[ºo°.]?\s*)?(?:\d{1,4}|[IVXLCDM]{1,8})[).:-]?\s*$/i;
  const metadataRegex =
    /^\s*(?:Q\d{3,}|Ano\s*:|Banca\s*:|Órgão\s*:|Orgao\s*:|Provas?\s*:)/i;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    const hasMetadataAhead = lines
      .slice(index + 1, index + 8)
      .some((nextLine) => metadataRegex.test(nextLine.trim()));
    const isQuestionStart =
      strongQuestionStartRegex.test(trimmed) ||
      questionMetadataLineRegex.test(trimmed) ||
      (numberedQuestionStartRegex.test(trimmed) && hasMetadataAhead);
    const previousLine = current[current.length - 1] ?? "";
    const hasBlankLineBefore = previousLine.trim().length === 0;

    if (
      isQuestionStart &&
      current.join("\n").trim().length > 0 &&
      (hasBlankLineBefore || current.join("\n").trim().length > 250)
    ) {
      const preMetadataContext = questionMetadataLineRegex.test(trimmed)
        ? detachPreMetadataContext(current)
        : [];
      const previousBlock = current.join("\n").trim();

      if (previousBlock) {
        blocks.push(previousBlock);
      }
      current = [...preMetadataContext, line];
      continue;
    }

    current.push(line);
  }

  const lastBlock = current.join("\n").trim();
  if (lastBlock) blocks.push(lastBlock);

  return coalesceContinuationBlocks(blocks.length ? blocks : [normalized]);
}

function normalizeLines(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function stripQuestionMetadataFromStatement(value: string) {
  const lines = normalizeLines(value);
  if (!lines.length) return clean(value);

  const metadataLineIndex = lines.findIndex((line, index) => {
    if (index > 12) return false;

    return questionMetadataLineRegex.test(line);
  });

  if (metadataLineIndex >= 0) {
    const afterMeta = lines.slice(metadataLineIndex + 1);
    if (afterMeta.length > 0 && /^texto associado\s*[:\-]?$/i.test(afterMeta[0])) {
      afterMeta.shift();
    }
    return afterMeta.join("\n").trim() || clean(value);
  }

  const metadataEndIndex = lines.findIndex((line, index) => {
    if (index > 8) return false;

    return (
      /^(?:Ano|Banca|Órgão|Orgao|Provas?|Disciplina|Assunto)\s*:/i.test(line) ||
      (/\bAno\s*:/i.test(line) &&
        (/\bBanca\s*:/i.test(line) || /\bÓrgão\s*:/i.test(line) || /\bOrgao\s*:/i.test(line) || /\bProvas?\s*:/i.test(line)))
    );
  });

  if (metadataEndIndex >= 0) {
    const afterMeta = lines.slice(metadataEndIndex + 1);
    if (afterMeta.length > 0 && /^texto associado\s*[:\-]?$/i.test(afterMeta[0])) {
      afterMeta.shift();
    }
    return afterMeta.join("\n").trim() || clean(value);
  }

  if (/^Q\d{3,}$/i.test(lines[0])) {
    return stripQuestionMetadataFromStatement(lines.slice(1).join("\n"));
  }

  if (/^texto associado\s*[:\-]?$/i.test(lines[0])) {
    return lines.slice(1).join("\n").trim() || clean(value);
  }

  return clean(value);
}

function parseAlternativeLabel(line: string) {
  const trimmed = line.trim();

  const trueFalse = trimmed.match(trueFalseAlternativeRegex);
  if (trueFalse) {
    const isCerto = trueFalse[1].toLowerCase() === "certo";
    const text = isCerto ? "Certo" : "Errado";

    return {
      label: isCerto ? "C" : "E",
      text,
    };
  }

  const named = trimmed.match(namedAlternativeRegex);
  if (named) {
    return {
      label: named[1].toUpperCase(),
      text: clean(named[2]),
    };
  }

  const spacedRoman = trimmed.match(spacedRomanAlternativeRegex);
  if (spacedRoman) {
    return {
      label: spacedRoman[1].toUpperCase(),
      text: clean(spacedRoman[2]),
    };
  }

  const inline = trimmed.match(inlineAlternativeRegex);
  if (inline) {
    return {
      label: inline[1].toUpperCase(),
      text: clean(inline[2]),
    };
  }

  const dash = trimmed.match(dashAlternativeRegex);
  if (dash) {
    return {
      label: dash[1].toUpperCase(),
      text: clean(dash[2]),
    };
  }

  const isolated = trimmed.match(isolatedAlternativeLabelRegex);
  if (isolated) {
    return {
      label: isolated[1].toUpperCase(),
      text: "",
    };
  }

  return null;
}

function countAlternativeLabels(lines: string[], startIndex: number) {
  const labels = new Set<string>();

  for (let index = startIndex; index < lines.length; index++) {
    const parsed = parseAlternativeLabel(lines[index]);
    if (parsed) labels.add(parsed.label);
  }

  return labels.size;
}

function findAlternativesStartIndex(lines: string[]) {
  const titleIndex = lines.findIndex((line) => alternativesTitleRegex.test(line));
  if (titleIndex >= 0 && countAlternativeLabels(lines, titleIndex + 1) >= 2) {
    return titleIndex;
  }

  for (let index = 0; index < lines.length; index++) {
    const parsed = parseAlternativeLabel(lines[index]);
    if (!parsed || parsed.label !== "A") continue;

    if (countAlternativeLabels(lines, index) >= 2) {
      return index;
    }
  }

  return -1;
}

function normalizeLoose(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isUnlabeledAlternativesCue(line: string) {
  const normalized = normalizeLoose(line);

  return (
    /\besta\s+corret[ao]\b/.test(normalized) &&
    /\b(?:afirma|afirmam|itens?|assertivas?)\b/.test(normalized)
  );
}

function isRomanAlternativeText(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length > 120) return false;
  if (parseAlternativeLabel(trimmed) || isPostQuestionJunkLine(trimmed)) return false;

  return new RegExp(`^${romanAlternativeTextPattern}$`, "i").test(trimmed);
}

function extractUnlabeledRomanAlternatives(lines: string[]) {
  for (let index = 0; index < lines.length; index++) {
    if (!isUnlabeledAlternativesCue(lines[index])) continue;

    const alternatives: ParsedAlternative[] = [];

    for (
      let optionIndex = index + 1;
      optionIndex < lines.length && alternatives.length < alternativeLabels.length;
      optionIndex++
    ) {
      const line = lines[optionIndex];

      if (!isRomanAlternativeText(line)) break;

      alternatives.push({
        label: alternativeLabels[alternatives.length],
        text: line.trim(),
        is_correct: false,
      });
    }

    if (alternatives.length >= 2) {
      return {
        startIndex: index + 1,
        alternatives,
      };
    }
  }

  return null;
}

function extractInlineUnlabeledRomanAlternatives(rawBlock: string) {
  const text = rawBlock
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cue = text.match(
    /\best[aá]\s+corret[ao]\b[\s\S]{0,120}?\b(?:afirma|afirmam|itens?|assertivas?)\b[\s\S]{0,120}?\bem\b/i,
  );

  if (!cue || cue.index === undefined) return null;

  const afterCueStart = cue.index + cue[0].length;
  const rawAfterCue = text.slice(afterCueStart);
  const leadingOptionGap = rawAfterCue.match(/^\s*[:\-]?\s*/)?.[0].length ?? 0;
  const afterCue = rawAfterCue.slice(leadingOptionGap);
  const firstOptionBaseIndex = afterCueStart + leadingOptionGap;
  const optionRegex = new RegExp(`\\s*(${romanAlternativeTextPattern})`, "gi");
  const alternatives: ParsedAlternative[] = [];
  let firstOptionIndex: number | null = null;
  let consumedUntil = 0;

  while (alternatives.length < alternativeLabels.length) {
    optionRegex.lastIndex = consumedUntil;
    const match = optionRegex.exec(afterCue);

    if (!match?.[1]) break;

    const skippedText = afterCue.slice(consumedUntil, match.index).trim();
    if (skippedText) break;

    if (firstOptionIndex === null) {
      firstOptionIndex = match.index;
    }

    alternatives.push({
      label: alternativeLabels[alternatives.length],
      text: match[1].trim(),
      is_correct: false,
    });

    consumedUntil = optionRegex.lastIndex;
  }

  if (alternatives.length < 4 || firstOptionIndex === null) return null;

  const statement = text.slice(0, firstOptionBaseIndex + firstOptionIndex).trim();

  return {
    statement,
    alternatives,
  };
}

function extractQuestionParts(rawBlock: string) {
  const lines = normalizeLines(rawBlock);
  const startIndex = findAlternativesStartIndex(lines);

  if (startIndex < 0) {
    const unlabeledAlternatives = extractUnlabeledRomanAlternatives(lines);
    const inlineUnlabeledAlternatives =
      extractInlineUnlabeledRomanAlternatives(rawBlock);

    if (
      inlineUnlabeledAlternatives &&
      (!unlabeledAlternatives ||
        inlineUnlabeledAlternatives.alternatives.length >
          unlabeledAlternatives.alternatives.length)
    ) {
      return {
        statement:
          trimTrailingQuestionJunk(
            stripQuestionMetadataFromStatement(inlineUnlabeledAlternatives.statement),
          ) || rawBlock.trim(),
        alternatives: inlineUnlabeledAlternatives.alternatives,
      };
    }

    if (unlabeledAlternatives) {
      return {
        statement:
          trimTrailingQuestionJunk(
            stripQuestionMetadataFromStatement(
              lines.slice(0, unlabeledAlternatives.startIndex).join("\n"),
            ),
          ) || rawBlock.trim(),
        alternatives: unlabeledAlternatives.alternatives,
      };
    }

    return {
      statement: trimTrailingQuestionJunk(stripQuestionMetadataFromStatement(rawBlock)),
      alternatives: [] as ParsedAlternative[],
    };
  }

  const startsWithTitle = alternativesTitleRegex.test(lines[startIndex]);
  const statementLines = lines.slice(0, startIndex);
  const alternativeLines = lines.slice(startsWithTitle ? startIndex + 1 : startIndex);
  const alternatives: ParsedAlternative[] = [];
  let current: ParsedAlternative | null = null;

  for (const line of alternativeLines) {
    if (isPostQuestionJunkLine(line)) {
      break;
    }

    const parsed = parseAlternativeLabel(line);

    if (parsed) {
      if (current?.text) alternatives.push(current);
      current = {
        label: parsed.label,
        text: parsed.text,
        is_correct: false,
      };
      continue;
    }

    if (current) {
      current.text = clean([current.text, line].filter(Boolean).join("\n"));
    }
  }

  if (current?.text) alternatives.push(current);

  return {
    statement:
      trimTrailingQuestionJunk(stripQuestionMetadataFromStatement(statementLines.join("\n"))) ||
      rawBlock.trim(),
    alternatives,
  };
}

function countNumberedStatementItems(value: string) {
  return Array.from(value.matchAll(numberedStatementItemRegex)).length;
}

function extractNumberedStatementSection(rawBlock: string) {
  const lines = normalizeLines(rawBlock);
  const alternativesStartIndex = findAlternativesStartIndex(lines);
  const safeEndIndex = alternativesStartIndex >= 0 ? alternativesStartIndex : lines.length;
  const statementLines = lines.slice(0, safeEndIndex);
  const firstNumberedIndex = statementLines.findIndex((line) =>
    numberedStatementItemLineRegex.test(line),
  );

  if (firstNumberedIndex < 0) return "";

  return statementLines
    .slice(firstNumberedIndex)
    .filter((line) => numberedStatementItemLineRegex.test(line))
    .join("\n")
    .trim();
}

function restoreMissingNumberedItems(statement: string, rawBlock: string) {
  const numberedSection = extractNumberedStatementSection(rawBlock);
  if (!numberedSection) return statement;

  const rawNumberedItems = countNumberedStatementItems(numberedSection);
  const statementNumberedItems = countNumberedStatementItems(statement);

  if (rawNumberedItems < 2 || statementNumberedItems >= rawNumberedItems) {
    return statement;
  }

  return clean([statement, numberedSection].filter(Boolean).join("\n\n"));
}

function chooseStatement({
  rawStatement,
  parsedStatement,
  rawAlternativeCount,
}: {
  rawStatement: string;
  parsedStatement: string;
  rawAlternativeCount: number;
}) {
  const cleanRawStatement = clean(rawStatement);
  const cleanParsedStatement = clean(parsedStatement);

  if (!cleanRawStatement) return cleanParsedStatement;
  if (!cleanParsedStatement) return cleanRawStatement;

  const rawNumberedItems = countNumberedStatementItems(cleanRawStatement);
  const parsedNumberedItems = countNumberedStatementItems(cleanParsedStatement);

  if (rawNumberedItems >= 2 && parsedNumberedItems < rawNumberedItems) {
    return cleanRawStatement;
  }

  if (rawAlternativeCount >= 2) {
    return cleanRawStatement;
  }

  if (
    cleanRawStatement.length > cleanParsedStatement.length &&
    cleanRawStatement.toLowerCase().includes(cleanParsedStatement.toLowerCase())
  ) {
    return cleanRawStatement;
  }

  return cleanParsedStatement || cleanRawStatement;
}

function mergeRawAlternativesWithAi(
  rawAlternatives: ParsedAlternative[],
  aiAlternatives: unknown
) {
  const alternatives: AiAlternativeLike[] = Array.isArray(aiAlternatives)
    ? aiAlternatives
    : [];
  const correctLabels = new Set(
    alternatives
      .filter((alternative) => Boolean(alternative?.is_correct))
      .map((alternative) => clean(alternative?.label).toUpperCase())
      .filter(Boolean),
  );

  if (rawAlternatives.length >= 2) {
    const mapped = rawAlternatives.map((alternative) => ({
      ...alternative,
      is_correct: correctLabels.has(alternative.label.toUpperCase()),
    }));

    // Fallback for true/false: AI sometimes returns "A"/"B" labels instead of
    // "Certo"/"Errado", so label matching above finds nothing. Use position instead.
    if (!mapped.some((a) => a.is_correct) && alternatives.length >= 2) {
      const correctIndex = alternatives.findIndex((a) => Boolean(a?.is_correct));
      if (correctIndex >= 0 && correctIndex < mapped.length) {
        return mapped.map((alt, i) => ({ ...alt, is_correct: i === correctIndex }));
      }
    }

    return mapped;
  }

  return alternatives;
}

async function findBoardByName(supabase: SupabaseClient, boardName: string) {
  const normalized = normalizeBoardName(boardName);

  if (!normalized) return null;

  const { data, error } = await supabase
    .from("exam_boards")
    .select("id, name")
    .ilike("name", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data || null;
}

type BoardCandidatesCache = Map<
  string,
  {
    candidates: { id: string; statement: string | null; exam_board_id: string | null; year?: number | null }[];
    alternativesByQuestion: Map<string, { label?: string | null; text?: string | null; image_url?: string | null; is_correct?: boolean | null }[]>;
  }
>;

type DuplicateInfo = {
  duplicate_type: "batch" | "database" | "possible";
  duplicate_of: {
    id?: string;
    temp_id?: string;
    statement?: string | null;
    similarity: number;
    statement_similarity?: number;
    alternatives_similarity?: number;
    matched_metadata?: string[];
  };
} | null;

function findBatchDuplicate(
  statement: string,
  processedInBatch: Array<{ temp_id: string; statement: string }>,
): DuplicateInfo {
  let bestScore = 0;
  let bestEntry: { temp_id: string; statement: string } | null = null;

  for (const entry of processedInBatch) {
    const score = jaccardSimilarity(statement, entry.statement);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (bestScore >= 0.82 && bestEntry) {
    return {
      duplicate_type: "batch",
      duplicate_of: { temp_id: bestEntry.temp_id, statement: bestEntry.statement, similarity: bestScore },
    };
  }

  return null;
}

async function fetchBoardCandidates(
  supabase: SupabaseClient,
  examBoardId: string,
  cache: BoardCandidatesCache,
) {
  if (cache.has(examBoardId)) return cache.get(examBoardId)!;

  const { data: candidates, error } = await supabase
    .from("questions")
    .select("id, statement, exam_board_id, year")
    .eq("exam_board_id", examBoardId)
    .limit(500);

  if (error) throw new Error(error.message);

  const candidateIds = (candidates || []).map((q: { id: string }) => q.id);
  const alternativesByQuestion = new Map<
    string,
    { label?: string | null; text?: string | null; image_url?: string | null; is_correct?: boolean | null }[]
  >();

  const ALT_CHUNK = 100;
  for (let i = 0; i < candidateIds.length; i += ALT_CHUNK) {
    const chunk = candidateIds.slice(i, i + ALT_CHUNK);
    const { data: altData, error: altError } = await supabase
      .from("question_alternatives")
      .select("question_id, label, text, image_url, is_correct")
      .in("question_id", chunk);

    if (altError) throw new Error(altError.message);

    for (const alt of (altData || []) as { question_id: string; label?: string | null; text?: string | null; image_url?: string | null; is_correct?: boolean | null }[]) {
      const current = alternativesByQuestion.get(alt.question_id) || [];
      current.push(alt);
      alternativesByQuestion.set(alt.question_id, current);
    }
  }

  const result = { candidates: candidates || [], alternativesByQuestion };
  cache.set(examBoardId, result);
  return result;
}

async function findDatabaseDuplicate({
  supabase,
  statement,
  alternatives,
  examBoardId,
  year,
  cache,
}: {
  supabase: SupabaseClient;
  statement: string;
  alternatives: { label?: string | null; text?: string | null; is_correct?: boolean | null; image_url?: string | null }[];
  examBoardId: string | null;
  year: number | null;
  cache: BoardCandidatesCache;
}): Promise<DuplicateInfo> {
  if (examBoardId) {
    const { candidates, alternativesByQuestion } = await fetchBoardCandidates(supabase, examBoardId, cache);

    type BestCandidate = { id: string; statement: string | null; similarity: number; statementSimilarity: number; alternativesSimilarity: number; matchedMetadata: string[] };
    let bestBlocking: BestCandidate | null = null;
    let bestPossible: BestCandidate | null = null;

    for (const candidate of candidates) {
      const metrics = calculateDuplicateScore({
        statement,
        alternatives,
        candidateStatement: candidate.statement || "",
        candidateAlternatives: alternativesByQuestion.get(candidate.id) || [],
        examBoardId,
        candidateExamBoardId: candidate.exam_board_id,
        year,
        candidateYear: (candidate as any).year ?? null,
      });

      if (metrics.isBlockingDuplicate) {
        if (!bestBlocking || metrics.score > bestBlocking.similarity) {
          bestBlocking = { id: candidate.id, statement: candidate.statement, similarity: metrics.score, statementSimilarity: metrics.statementSimilarity, alternativesSimilarity: metrics.alternativesSimilarity, matchedMetadata: metrics.matchedMetadata };
        }
      } else if (metrics.isPossibleDuplicate) {
        if (!bestPossible || metrics.score > bestPossible.similarity) {
          bestPossible = { id: candidate.id, statement: candidate.statement, similarity: metrics.score, statementSimilarity: metrics.statementSimilarity, alternativesSimilarity: metrics.alternativesSimilarity, matchedMetadata: metrics.matchedMetadata };
        }
      }
    }

    if (bestBlocking) {
      return {
        duplicate_type: "database",
        duplicate_of: { id: bestBlocking.id, statement: bestBlocking.statement, similarity: bestBlocking.similarity, statement_similarity: bestBlocking.statementSimilarity, alternatives_similarity: bestBlocking.alternativesSimilarity, matched_metadata: bestBlocking.matchedMetadata },
      };
    }

    if (bestPossible) {
      return {
        duplicate_type: "possible",
        duplicate_of: { id: bestPossible.id, statement: bestPossible.statement, similarity: bestPossible.similarity, statement_similarity: bestPossible.statementSimilarity, alternatives_similarity: bestPossible.alternativesSimilarity, matched_metadata: bestPossible.matchedMetadata },
      };
    }

    return null;
  }

  if (year) {
    const { data, error } = await supabase
      .from("questions")
      .select("id, statement")
      .eq("year", year)
      .limit(300);

    if (error) throw new Error(error.message);

    let bestBlockingScore = 0;
    let bestBlockingCandidate: { id: string; statement: string | null } | null = null;
    let bestPossibleScore = 0;
    let bestPossibleCandidate: { id: string; statement: string | null } | null = null;

    for (const candidate of data || []) {
      const score = jaccardSimilarity(statement, candidate.statement || "");

      if (score >= 0.88 && score > bestBlockingScore) {
        bestBlockingScore = score;
        bestBlockingCandidate = candidate;
      } else if (score >= 0.72 && score > bestPossibleScore) {
        bestPossibleScore = score;
        bestPossibleCandidate = candidate;
      }
    }

    if (bestBlockingCandidate) {
      return {
        duplicate_type: "database",
        duplicate_of: { id: bestBlockingCandidate.id, statement: bestBlockingCandidate.statement, similarity: bestBlockingScore },
      };
    }

    if (bestPossibleCandidate) {
      return {
        duplicate_type: "possible",
        duplicate_of: { id: bestPossibleCandidate.id, statement: bestPossibleCandidate.statement, similarity: bestPossibleScore },
      };
    }
  }

  return null;
}

function formatStatementForDisplay(value: string): string {
  if (!value) return value;

  // Replace (__) and (   ) variants with (     ) — 5 spaces inside parens
  let result = value
    .replace(/\r/g, "")
    .replace(/\(\s*[_ ]+\s*\)/g, "(     )");

  // Add space after list item label when immediately followed by text (no space)
  // e.g. "I.Texto" → "I. Texto", "II-Texto" → "II- Texto", "1.Texto" → "1. Texto"
  result = result.replace(/^([ivx]{1,5})([-.:])(\S)/gim, "$1$2 $3");
  result = result.replace(/^(\d{1,2})([-.:])(\S)/gm, "$1$2 $3");

  // Restore line breaks for roman-numeral list items collapsed onto one line.
  // e.g. "...locais. II- Uma das..." → "...locais.\nII- Uma das..."
  // Uses [^\S\n]+ to only match horizontal whitespace, leaving existing \n untouched.
  result = result.replace(
    /([.!?;:])[^\S\n]+([ivx]{1,5}\s*-\s)(?=[A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜ])/gi,
    "$1\n$2",
  );

  // Move (     ) to a new line only when preceded by a word character + whitespace.
  // This handles "some text (     )" but intentionally leaves "1. (     )text" intact,
  // so that numbered/roman items with an inline blank keep their number and blank together.
  result = result.replace(/(\w)\s+(\(     \))/g, "$1\n$2");

  const isListItemStart = (line: string): boolean => {
    const t = line.trim();
    if (!t) return false;
    return (
      t.startsWith("(     )") ||
      /^[ivx]{1,5}\s*[-.:]\s*\S/i.test(t) ||
      /^\d{1,2}[.:]\s*\S/.test(t)
    );
  };

  const lines = result.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    if (isListItemStart(line) && out.length > 0 && out[out.length - 1].trim() !== "") {
      out.push("");
    }
    out.push(line);
  }

  result = out.join("\n").trim();

  // Aplica destaque vermelho nas referências de imagem (utilitário centralizado)
  const IMAGE_MARKER_STYLE = "font-weight:700;color:#dc2626;font-size:1.3em;background:none;display:inline;line-height:1.4;";
  result = result.replace(
    /imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/gi,
    (m) => `<span data-image-marker="true" style="${IMAGE_MARKER_STYLE}">${m}</span>`,
  );
  result = result.replace(
    /\b([\w][\w\s.-]*\.(png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?)/gi,
    (m) => `<span data-image-marker="true" style="${IMAGE_MARKER_STYLE}">${m}</span>`,
  );

  return result;
}

export async function POST(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          message: "OPENAI_API_KEY nÃ£o foi configurada.",
        },
        { status: 500 },
      );
    }

    const body = await request.json();

    const text = String(body.text || "").trim();
    const rawBlocks = Array.isArray(body.blocks)
      ? body.blocks
          .map((block: unknown) => sanitizeImportedText(String(block || "")))
          .filter(Boolean)
      : splitIntoQuestionBlocks(text);
    const defaultYear = isValidYear(body.year) ? Number(body.year) : null;
    const batchIndex = Number(body.batch_index || 0);

    if (!text) {
      return NextResponse.json(
        {
          ok: false,
          message: "Texto nÃ£o informado.",
        },
        { status: 400 },
      );
    }

    const prompt = `
VocÃª Ã© um importador inteligente de questÃµes para concursos pÃºblicos.

Extraia as questÃµes e retorne JSON vÃ¡lido no formato:

{
  "questions": [
    {
      "statement": "Enunciado completo sem alternativas",
      "year": 2025,
      "board_name": "CESPE / CEBRASPE",
      "orgao": "PC-RR",
      "question_type": "multiple_choice",
      "evaluated_topics": ["Tópico específico"],
      "difficulty_level": null,
      "explanation_text": "",
      "alternatives": [
        { "label": "A", "text": "texto", "is_correct": false }
      ]
    }
  ]
}

Regras obrigatÃ³rias:
- Cada bloco bruto enviado corresponde a UMA questÃ£o. NUNCA divida um bloco em vÃ¡rias questÃµes por causa de itens numerados no enunciado.
- Preserve TODO o texto antes do inÃ­cio real das alternativas.
- O inÃ­cio das alternativas sÃ³ acontece quando uma linha comeÃ§ar com:
  - Alternativas
    A
    texto da alternativa
    B
    texto da alternativa
  - A) B) C) D) E)
  - A. B. C. D. E.
  - Alternativa A, Alternativa B, Alternativa C, ...
  - opÃ§Ãµes sem letra apÃ³s frases como "EstÃ¡ correto o que se afirma em", por exemplo:
    I.
    II.
    III.
    I e II.
    II e III.
    Nesse caso, atribua A, B, C, D, E pela ordem visual.
- NÃƒO trate como inÃ­cio de alternativas:
  - "A sequÃªncia correta Ã©:"
  - "Assinale a resposta correta."
  - "Marque a alternativa correta:"
  - "Analise os itens a seguir:"
  - "Considere os itens abaixo:"
  - listas em formato "( ) item"
  - frases de transiÃ§Ã£o ou instruÃ§Ã£o que fazem parte do enunciado
  - AFIRMATIVAS com algarismos romanos seguidos de texto descritivo longo: "I.Navegadores funcionam...", "II.Ã‰ correto afirmar que...", "III.O protocolo HTTP..." — essas sÃ£o afirmativas do enunciado, mantenha dentro do statement mesmo que comecem com I. II. III.
- Distinção crucial entre AFIRMATIVAS e ALTERNATIVAS:
  - AFIRMATIVA (fica no statement): "I.Texto descritivo longo..." — algarismo romano + ponto + texto na mesma linha
  - ALTERNATIVA (vai no campo alternatives): "I." sozinho em linha curta após "É correto o que se afirma" / "I e II." / "II, apenas." — opções de resposta sem texto próprio
- NÃƒO trate itens numerados do enunciado como novas questÃµes:
  - "1. texto"
  - "2. texto"
  - "3. texto"
  - "1) texto"
  - "2) texto"
  - "3) texto"
  Esses itens devem continuar dentro do statement atÃ© aparecer o bloco real de alternativas.
- Se houver um bloco com itens entre parÃªnteses antes das alternativas, mantenha-o dentro do statement.
- Se houver dÃºvida entre texto do enunciado e alternativas, preserve o texto no statement.

Campos obrigatÃ³rios:
- statement
- question_type
- board_name
- orgao
- year
- difficulty_level
- explanation_text
- alternatives
- evaluated_topics

Regras para evaluated_topics:
- Identifique os tópicos específicos efetivamente avaliados na questão.
- Não repita o assunto genérico se houver tópico mais específico.
- Use nomes curtos e objetivos, de 1 a 4 tópicos.
- Não invente tópicos que não estejam diretamente relacionados ao enunciado.

Regras para orgao:
- Extraia o órgão quando aparecer em padrões como "Órgão: PC-RR", "Orgao: PC-SP" ou em linha de metadados do QConcursos.
- Retorne apenas o valor do órgão, por exemplo: "PC-RR", "PC-BA", "TJ-SP".
- Se o órgão não aparecer, retorne orgao = "".

Regras para year:
- Extraia anos em padrÃµes como "Ano: 2025", "Ano 2025", "Ano - 2025", "2025 Banca:" e "Banca: VUNESP Ano: 2024".
- Aceite apenas ano com 4 dÃ­gitos entre 1990 e 2100.
- Se o ano nÃ£o aparecer, retorne year = null.

Texto:
${text}
`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_IMPORT_MODEL || "gpt-4o-mini",
        temperature: 0.1,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content:
              "VocÃª transforma textos de questÃµes de concursos em JSON estruturado vÃ¡lido. Preserve o statement completo antes do primeiro marcador real de alternativa.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(extractJson(content));
    const supabase = createSupabaseAdminClient();
    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const normalized = [];
    const boardCandidatesCache: BoardCandidatesCache = new Map();
    const processedInBatch: Array<{ temp_id: string; statement: string }> = [];

    for (let index = 0; index < rawBlocks.length; index++) {
      const question = questions[index] || {};
      const rawBlock = rawBlocks[index] || "";
      const rawParts = extractQuestionParts(rawBlock);
      const parsedStatement = clean(question.statement);
      const rawStatement = rawParts.statement;
      const statement = formatStatementForDisplay(
        restoreMissingNumberedItems(
          chooseStatement({
            rawStatement,
            parsedStatement,
            rawAlternativeCount: rawParts.alternatives.length,
          }),
          rawBlock,
        )
      );
      const alternatives = mergeRawAlternativesWithAi(
        rawParts.alternatives,
        question.alternatives,
      ).map((alt) => {
        if (!("text" in alt)) return alt;
        return { ...alt, text: formatStatementForDisplay((alt as ParsedAlternative).text) };
      });
      const rawBoardName = extractBoardNameFromText(rawBlock);
      const boardName = normalizeBoardName(rawBoardName || question.board_name || "");
      const agencyName = clean(extractAgencyNameFromText(rawBlock) || question.orgao || question.agency_name || "");
      const existingBoard = boardName
        ? await findBoardByName(supabase, boardName)
        : null;

      const detectedYear =
        extractYearFromText(rawBlock) ||
        extractYearFromText(statement) ||
        (isValidYear(question.year) ? Number(question.year) : null) ||
        defaultYear;

      // Regra do Importador com IA: se a análise resultar em apenas duas opções,
      // tratar como questão de assertivas (Certo/Errado), não como ABCDE.
      const isTrueFalse =
        question.question_type === "true_false" || alternatives.length === 2;

      const tempId = `batch-${batchIndex + 1}-${index + 1}-${Date.now()}`;

      const batchDuplicate = statement
        ? findBatchDuplicate(statement, processedInBatch)
        : null;

      const dbDuplicate =
        !batchDuplicate && statement
          ? await findDatabaseDuplicate({
              supabase,
              statement,
              alternatives,
              examBoardId: existingBoard?.id || null,
              year: detectedYear,
              cache: boardCandidatesCache,
            })
          : null;

      const duplicateInfo = batchDuplicate || dbDuplicate;

      if (statement) {
        processedInBatch.push({ temp_id: tempId, statement });
      }

      normalized.push({
        temp_id: tempId,
        statement,
        question_type: isTrueFalse ? "true_false" : "multiple_choice",
        board_name: boardName,
        exam_board_id: existingBoard?.id || "",
        orgao: agencyName,
        year: detectedYear || null,
        difficulty_level: question.difficulty_level
          ? Number(question.difficulty_level)
          : null,
        evaluated_topics: normalizeEvaluatedTopics(question.evaluated_topics),
        explanation_text: clean(question.explanation_text),
        alternatives,
        is_duplicate: Boolean(duplicateInfo) && duplicateInfo?.duplicate_type !== "possible",
        duplicate_type: duplicateInfo?.duplicate_type ?? null,
        duplicate_of: duplicateInfo?.duplicate_of ?? null,
      });
    }

    return NextResponse.json({
      ok: true,
      questions: normalized,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado.",
      },
      { status: 500 },
    );
  }
}
