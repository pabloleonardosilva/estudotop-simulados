"use client";

/**
 * Renderiza HTML destacando automaticamente "Imagem associada para resolução da questão"
 * em VERMELHO (#dc2626), tamanho 1.3em e negrito — mesmo que o HTML salvo no banco
 * não contenha a marcação inline.
 *
 * Preserve quebras de parágrafo com whitespace-pre-wrap.
 * Usado em todos os contextos de exibição (não edição) de enunciados e alternativas.
 */

const IMAGE_MARKER_STYLE =
  "font-weight:700;color:#dc2626;font-size:1.3em;background:none;display:inline;line-height:1.4;";

const IMAGE_PHRASE_REGEX =
  /imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/gi;

const FILE_EXT_REGEX =
  /\b([\w][\w.-]*\.(?:png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?)/gi;

/**
 * Insere <br> antes de itens de lista quando o texto não tem tags de bloco.
 * Detecta padrões como: "I –", "II –", "III –", "1.", "A)", etc.
 * no meio de um parágrafo contínuo.
 */
export function insertListItemBreaks(text: string): string {
  // Já tem estrutura HTML de bloco — não modifica
  if (/<(?:p|br|div|ul|ol|li|h[1-6])[^>]*>/i.test(text)) return text;

  // Insere <br> antes de algarismos romanos seguidos de – ou ) ou .
  // Ex: "texto: I – algo" → "texto:<br>I – algo"
  let result = text.replace(
    /([^<])\s+((?:I{1,3}|IV|VI{0,3}|IX|X{0,3})+)\s+([–\-])\s+/g,
    (_, before, numeral, dash) => `${before}<br><strong>${numeral}</strong> ${dash} `,
  );

  // Insere <br> antes de itens numerados: "1.", "2.", etc. no meio do texto
  result = result.replace(
    /([.!?:;])\s+(\d{1,2}[.)]\s+)/g,
    (_, punct, item) => `${punct}<br>${item}`,
  );

  // Converte \n que ainda restarem em <br>
  result = result.replace(/\n/g, "<br>");

  return result;
}

// DOM-based approach — imune a &nbsp;, quebras de tag, e entidades HTML.
// Funciona como o RichTextEditor para garantir consistência.
function applyMarkers(html: string): string {
  if (!html || typeof document === "undefined") return html;
  if (html.includes("data-image-marker")) return html;

  const root = document.createElement("div");
  root.innerHTML = html;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const parent = node.parentElement;
    if (parent && !parent.closest("[data-image-marker]")) {
      const val = node.nodeValue || "";
      IMAGE_PHRASE_REGEX.lastIndex = 0;
      FILE_EXT_REGEX.lastIndex = 0;
      if (IMAGE_PHRASE_REGEX.test(val) || FILE_EXT_REGEX.test(val)) {
        textNodes.push(node);
      }
    }
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const value = textNode.nodeValue || "";
    const combined = new RegExp(
      `(${IMAGE_PHRASE_REGEX.source}|${FILE_EXT_REGEX.source})`,
      "gi",
    );
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    value.replace(combined, (match, _g, _g2, offset: number) => {
      if (offset > lastIndex) {
        fragment.appendChild(document.createTextNode(value.slice(lastIndex, offset)));
      }
      const span = document.createElement("span");
      span.setAttribute("data-image-marker", "true");
      span.style.cssText = IMAGE_MARKER_STYLE;
      span.textContent = match;
      fragment.appendChild(span);
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex)));
    }
    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return root.innerHTML;
}

export default function HtmlWithImageMarkers({
  html,
  className = "",
  onClick,
  preserveLineBreaks = true,
}: {
  html: string;
  className?: string;
  onClick?: () => void;
  /** Preserva quebras de linha (\n) como <br> — padrão true */
  preserveLineBreaks?: boolean;
}) {
  let processed = applyMarkers(html || "");

  // Aplica formatação de lista (I –, II –, itens numerados) e preserva \n
  if (preserveLineBreaks) {
    processed = insertListItemBreaks(processed);
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: processed }}
      onClick={onClick}
    />
  );
}
