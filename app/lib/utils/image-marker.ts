/**
 * Utilitário compartilhado para marcadores de imagem em questões.
 *
 * Regra de negócio:
 *   Quando o texto de uma questão contém "Imagem associada para resolução da questão"
 *   (ou referência a arquivo de imagem como .png, .jpg, etc.), essa frase deve ser
 *   destacada em VERMELHO (#dc2626), tamanho 30% maior (1.3em) e negrito,
 *   para alertar o professor/aluno de que a questão depende de uma imagem.
 *
 * Locais que usam esta função:
 *   - app/api/admin/exam-analyses/analyze/route.ts
 *   - app/api/admin/exam-analyses/[id]/reprocess/route.ts
 *   - app/api/admin/questions/import/analyze-batch/route.ts
 *   - app/lib/utils/apply-image-marker.tsx (display-only, client-side)
 */

export const IMAGE_MARKER_STYLE =
  "font-weight:700;color:#dc2626;font-size:1.3em;background:none;display:inline;line-height:1.4;";

/**
 * Aplica o destaque de imagem a um texto HTML (server-side ou string pura).
 * Substitui ocorrências da frase sentinela E nomes de arquivos de imagem.
 */
export function applyImageMarkerToHtml(value: string): string {
  if (!value) return value;
  const style = IMAGE_MARKER_STYLE;
  return String(value)
    .replace(/\r/g, "")
    .replace(
      /imagem\s+associada\s+para\s+resolu[cç][aã]o\s+da\s+quest[aã]o/gi,
      (m) => `<span data-image-marker="true" style="${style}">${m}</span>`,
    )
    // Sem \s no grupo principal — evita cruzar quebras de linha e colapsar parágrafos
    .replace(
      /\b([\w][\w.-]*\.(?:png|jpe?g|gif|bmp|webp|tiff?|svg)(?:\s*\(\d+\s*[×x]\s*\d+\))?)/gi,
      (m) => `<span data-image-marker="true" style="${style}">${m}</span>`,
    );
}

/**
 * Verifica se um HTML contém marcador de imagem (já processado ou texto bruto).
 */
export function htmlHasImageMarker(html: string): boolean {
  return (
    /data-image-marker/i.test(html) ||
    /imagem\s+associada\s+para\s+resolu/i.test(html) ||
    /<img\b/i.test(html)
  );
}
