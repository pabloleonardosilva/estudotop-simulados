/**
 * Utilitário compartilhado de divisão de blocos de questões.
 * Usado em: importar/page-client.tsx, admin/raio-x-provas/nova/page-client.tsx
 */

export const questionMetadataLineRegex =
  /\bAno\s*:\s*(?:19\d{2}|20\d{2}|2100)\b[\s\S]{0,240}?\bBanca\s*:/i;

// Palavras conhecidas que PDFs costumam quebrar com um espaço fantasma logo após a ligadura "fi"
// (ex.: "identifi car" em vez de "identificar"). Lista fechada para evitar juntar palavras erradas.
const FI_LIGATURE_WHITELIST = new Set([
  "ficar", "fica", "ficou", "ficam", "ficaram", "ficamos", "fico", "ficando", "ficado",
  "fim", "fins", "final", "finais", "finalidade", "finalidades", "finalizar", "finalizado",
  "finalizada", "finalização", "fino", "fina",
  "fixar", "fixo", "fixa", "fixado", "fixada", "fixação",
  "fila", "filas", "filho", "filha", "filme", "filmar",
  "filtro", "filtros", "filtrar", "filtragem",
  "física", "físico", "fisco",
  "identificar", "identificação", "identificado", "identificada", "identificados", "identificadas",
  "verificar", "verificação", "verificado", "verificada", "verificados", "verificadas",
  "especificar", "especificação", "especificado", "especificada", "específico", "específica",
  "especificamente",
  "modificar", "modificação", "modificado", "modificada",
  "classificar", "classificação", "classificado", "classificada",
  "qualificar", "qualificação", "qualificado", "qualificada",
  "unificar", "unificação", "unificado", "unificada",
  "ratificar", "ratificação",
  "significar", "significado", "significativa", "significativo", "significância",
  "dificuldade", "dificuldades", "dificultar", "dificultado",
  "definir", "definição", "definido", "definida", "definitivo", "definitiva",
  "confirmar", "confirmação", "confirmado", "confirmada",
  "afirmar", "afirmação", "afirmado", "afirmativa", "afirmativo",
  "configurar", "configuração", "configurado", "configurada", "configurável",
  "confiar", "confiança", "confiável", "confiabilidade",
  "confidencial", "confidencialidade",
  "infinito", "infinita", "afinal", "refinar", "refinado",
  "justificar", "justificativa", "justificado", "justificada",
  "notificar", "notificação", "notificado",
  "retificar", "retificação", "gratificação", "bonificação",
  "simplificar", "simplificação", "simplificado",
  "codificar", "codificação", "codificado", "decodificar", "decodificação",
  "fortificar", "intensificar", "intensificação",
  "diversificar", "diversificação", "exemplificar",
  "amplificar", "amplificador", "personificar",
  "fiscalizar", "fiscalização", "fiscal",
  "profissional", "profissão", "profissionalismo",
  "eficiente", "eficiência", "eficaz", "eficácia", "ineficiente", "ineficaz",
  "deficiente", "deficiência", "proficiente", "proficiência",
  "suficiente", "insuficiente", "coeficiente",
  "benefício", "benefícios", "beneficiar", "beneficiário", "beneficência",
  "ofício", "ofícios", "oficial", "oficialmente", "oficina", "oficinas",
  "artificial", "artificialmente", "superficial", "superfície",
  "edifício", "edificação", "edificar", "sacrifício",
  "científico", "científica", "magnífico", "magnífica", "pacífico",
]);

function fixBrokenFiLigature(text: string) {
  return text.replace(/(\p{L}*fi)[ \t](\p{L}+)/gu, (match, before: string, after: string) => {
    const candidate = `${before}${after}`;
    const comparable = candidate.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return FI_LIGATURE_WHITELIST.has(comparable) ? candidate : match;
  });
}

function isQConcursosJunkLine(line: string) {
  const normalized = line.trim().toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
  if (!normalized) return false;
  const exactJunk = new Set([
    "mentoria qconcursos","home","concursos publicos","questoes","minhas questoes",
    "nome do novo filtro","palavra chave","excluir questoes","mostrar filtro simples",
    "filtros","filtro","buscar","limpar","aplicar","entrar","cadastre-se","proxima","anterior",
  ]);
  if (exactJunk.has(normalized)) return true;
  return [
    /^receba orientacao/,/^foram encontradas? \d+ quest/,/^pagina \d+/,
    /^ir para pagina/,/^questoes encontradas/,/^mostrar filtro/,/^ocultar filtro/,
    /^criar novo filtro/,/^salvar filtro/,/^limpar filtros/,/^ordenar por/,
    /^disciplinas?$/,/^assuntos?$/,/^bancas?$/,/^anos?$/,/^orgaos?$/,/^provas?$/,
  ].some((p) => p.test(normalized));
}

export function sanitizeImportedText(text: string) {
  const lines = text.replace(/\r/g, "").replace(/ /g, " ")
    .split("\n").map((l) => l.replace(/[ \t]+$/g, ""));
  const filtered = lines.filter((l) => !isQConcursosJunkLine(l));
  const firstSignalIndex = filtered.findIndex((l) => {
    const t = l.trim();
    return /^Q\d{3,}/i.test(t) || questionMetadataLineRegex.test(t) ||
      /^(?:Ano|Banca|Órgão|Orgao|Prova|Disciplina|Assunto)\s*:/i.test(t);
  });
  const usefulLines = firstSignalIndex > 0 ? filtered.slice(firstSignalIndex) : filtered;
  const joined = usefulLines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  return fixBrokenFiLigature(joined);
}

function isPreMetadataContextLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (/^\s*([A-E])\s*[).:]\s*/i.test(trimmed)) return false;
  if (/^(?:[IVXLCDM]+\.?)(?:\s*(?:,|e)\s*[IVXLCDM]+\.?)*\s*(?:,?\s*apenas\.?)?$/i.test(trimmed)) return false;
  if (/^(?:est[aá]\s+corret[ao]|com rela[cç][aã]o|considere|analise|assinale)\b/i.test(trimmed)) return false;
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

function looksLikeQuestionContinuation(value: string) {
  const lines = value.replace(/\r/g, "").replace(/ /g, " ")
    .split("\n").map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || "";
  return (
    !lines.some((l) => questionMetadataLineRegex.test(l)) &&
    (
      /^\s*alternativas?\s*[:\-]?\s*$/i.test(firstLine) ||
      /^\s*([A-E])\s*(?:[).:]|\s+-|\s*$)/i.test(firstLine) ||
      /^(?:[IVXLCDM]+\.?)(?:\s*(?:,|e)\s*[IVXLCDM]+\.?)*\s*(?:,?\s*apenas\.?)?$/i.test(firstLine) ||
      /^\s*\d{1,2}\.\s+\S/.test(firstLine) ||
      // Itens "1) texto..." dentro do enunciado: "1) A lixeira...", "2) Não é..."
      /^\s*[1-9]\d?\)\s+\S/.test(firstLine) ||
      // Afirmativas com algarismo romano + texto: "I.Navegadores funcionam...", "II.É correto..."
      // Difere de "I." sozinho (que é alternativa) — aqui tem texto descritivo logo após o ponto
      /^\s*[IVXivx]{1,4}[.)]\s*\S{4,}/.test(firstLine)
    )
  );
}

function coalesceContinuationBlocks(blocks: string[]) {
  const merged: string[] = [];
  for (const block of blocks) {
    const cleaned = block.trim();
    if (!cleaned) continue;
    if (merged.length > 0 && looksLikeQuestionContinuation(cleaned)) {
      merged[merged.length - 1] = `${merged[merged.length - 1]}\n${cleaned}`.trim();
      continue;
    }
    merged.push(cleaned);
  }
  return merged;
}

export function splitIntoQuestionBlocks(text: string): string[] {
  const normalized = sanitizeImportedText(text);
  if (!normalized) return [];

  // Modo marcado: INICIO DA QUESTÃO ... FIM DA QUESTÃO
  const markedRegex = /\(?IN[IÍ]CIO DA QUEST(?:ÃO|AO)\)?([\s\S]*?)\(?FIM DA QUEST(?:ÃO|AO)\)?/gi;
  const markedBlocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = markedRegex.exec(normalized)) !== null) {
    const block = match[1]?.trim();
    if (block) markedBlocks.push(block);
  }
  if (markedBlocks.length > 0) return markedBlocks;

  // Modo numerado/metadado
  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  const strongQuestionStartRegex = /^\s*(?:Q\d{3,}|Ano\s*:)/i;
  const numberedQuestionStartRegex =
    /^\s*(?:quest(?:ão|ao)?\s*)?(?:n[ºo°.]?\s*)?(?:\d{1,4}|[IVXLCDM]{1,8})[).:-]?\s*$/i;
  const metadataRegex = /^\s*(?:Q\d{3,}|Ano\s*:|Banca\s*:|Órgão\s*:|Orgao\s*:|Provas?\s*:)/i;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    const hasMetadataAhead = lines.slice(index + 1, index + 8)
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
        ? detachPreMetadataContext(current) : [];
      const previousBlock = current.join("\n").trim();
      if (previousBlock) blocks.push(previousBlock);
      current = [...preMetadataContext, line];
      continue;
    }
    current.push(line);
  }

  const lastBlock = current.join("\n").trim();
  if (lastBlock) blocks.push(lastBlock);
  return coalesceContinuationBlocks(blocks.length ? blocks : [normalized]);
}
