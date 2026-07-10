/** Detecta se o conteúdo é HTML ou Markdown */
export function isHtmlContent(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith("<") || /<[a-zA-Z]+[\s>]/.test(trimmed.slice(0, 400));
}

function processInline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tablePhase: "none" | "header" | "separator" | "body" = "none";
  let pBuf: string[] = [];

  const flushP = () => {
    if (!pBuf.length) return;
    out.push(`<p>${pBuf.join(" ")}</p>`);
    pBuf = [];
  };
  const closeUl = () => { if (inUl) { out.push("</ul>"); inUl = false; } };
  const closeOl = () => { if (inOl) { out.push("</ol>"); inOl = false; } };
  const closeTable = () => {
    if (inTable) {
      if (tablePhase === "body") out.push("</tbody>");
      out.push("</table>");
      inTable = false;
      tablePhase = "none";
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Headings
    const h1 = line.match(/^# (.+)$/);
    const h2 = line.match(/^## (.+)$/);
    const h3 = line.match(/^### (.+)$/);
    if (h1) { flushP(); closeUl(); closeOl(); closeTable(); out.push(`<h1>${processInline(h1[1])}</h1>`); continue; }
    if (h2) { flushP(); closeUl(); closeOl(); closeTable(); out.push(`<h2>${processInline(h2[1])}</h2>`); continue; }
    if (h3) { flushP(); closeUl(); closeOl(); closeTable(); out.push(`<h3>${processInline(h3[1])}</h3>`); continue; }

    // Tables
    if (line.startsWith("|")) {
      flushP(); closeUl(); closeOl();
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (!inTable) {
        out.push(`<table><thead><tr>${cells.map((c) => `<th>${processInline(c)}</th>`).join("")}</tr></thead>`);
        inTable = true;
        tablePhase = "header";
      } else if (tablePhase === "header" && cells.every((c) => /^[-:]+$/.test(c))) {
        tablePhase = "separator";
      } else {
        if (tablePhase !== "body") { out.push("<tbody>"); tablePhase = "body"; }
        out.push(`<tr>${cells.map((c) => `<td>${processInline(c)}</td>`).join("")}</tr>`);
      }
      continue;
    } else {
      closeTable();
    }

    // Unordered list
    const ul = line.match(/^[-*] (.+)$/);
    if (ul) {
      flushP(); closeOl();
      if (!inUl) { out.push("<ul>"); inUl = true; }
      out.push(`<li>${processInline(ul[1])}</li>`);
      continue;
    }

    // Ordered list
    const ol = line.match(/^\d+[.)]\s+(.+)$/);
    if (ol) {
      flushP(); closeUl();
      if (!inOl) { out.push("<ol>"); inOl = true; }
      out.push(`<li>${processInline(ol[1])}</li>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      flushP(); closeUl(); closeOl();
      out.push("<hr>");
      continue;
    }

    // Empty line
    if (!line.trim()) {
      flushP(); closeUl(); closeOl();
      continue;
    }

    // Paragraph accumulator
    closeUl(); closeOl();
    pBuf.push(processInline(line.trim()));
  }

  flushP(); closeUl(); closeOl(); closeTable();
  return out.join("\n");
}

/** Renderiza HTML ou Markdown dependendo do conteúdo detectado */
export function renderReport(content: string): string {
  if (!content?.trim()) return "";
  return isHtmlContent(content) ? content : markdownToHtml(content);
}

/** CSS premium para o relatório (fundo branco, tipografia clara e espaçamentos compactos) */
export const REPORT_CSS = `
  .raio-x-report { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #1e293b; line-height: 1.65; }
  .raio-x-report h1 { font-size: 1.3rem; font-weight: 800; color: #0f172a; margin: 0 0 1.25rem; padding-bottom: 10px; border-bottom: 3px solid #f97316; }
  .raio-x-report h2 { font-size: 1rem; font-weight: 700; color: #0f172a; margin: 1.5rem 0 0.5rem; padding: 5px 12px; border-left: 4px solid #f97316; background: linear-gradient(90deg,#fff7ed,transparent); border-radius: 0 6px 6px 0; }
  .raio-x-report h3 { font-size: 0.9rem; font-weight: 700; color: #1e293b; margin: 1rem 0 0.35rem; }
  .raio-x-report p { color: #334155; margin: 0 0 0.6rem; line-height: 1.65; }
  .raio-x-report p:empty { display: none; }
  .raio-x-report ul, .raio-x-report ol { margin: 0.35rem 0 0.6rem 1.5rem; }
  .raio-x-report ul { list-style: disc; }
  .raio-x-report ol { list-style: decimal; }
  .raio-x-report li { color: #334155; margin-bottom: 0.2rem; line-height: 1.55; }
  .raio-x-report table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.875rem; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .raio-x-report thead { background: #f8fafc; }
  .raio-x-report th { padding: 8px 14px; text-align: left; font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.07em; border-bottom: 2px solid #e2e8f0; }
  .raio-x-report td { padding: 8px 14px; color: #334155; border-bottom: 1px solid #f1f5f9; }
  .raio-x-report tr:last-child td { border-bottom: none; }
  .raio-x-report tr:hover td { background: #fafbfc; }
  .raio-x-report strong { font-weight: 700; color: #0f172a; }
  .raio-x-report em { font-style: italic; color: #475569; }
  .raio-x-report code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.82em; color: #1e293b; }
  .raio-x-report hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.25rem 0; }
  @media print { .raio-x-report { color: #000; } .raio-x-report h1, .raio-x-report h2, .raio-x-report h3 { color: #000; } }
`;
