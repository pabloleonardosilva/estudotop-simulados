export type EmbeddedPdfFont = {
  binary: string;
  widths: string;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  bbox: [number, number, number, number];
};

let cachedFont: Promise<EmbeddedPdfFont> | null = null;

function cp1252CodePoint(byte: number) {
  const special = [0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0xfffd, 0x017d, 0xfffd, 0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd, 0x017e, 0x0178];
  if (byte >= 0x80 && byte <= 0x9f) return special[byte - 0x80];
  return byte;
}

function table(view: DataView, tag: string) {
  const count = view.getUint16(4);
  for (let index = 0; index < count; index += 1) {
    const offset = 12 + index * 16;
    const current = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
    if (current === tag) return view.getUint32(offset + 8);
  }
  throw new Error(`Tabela ${tag} ausente na fonte Inter.`);
}

function cmapGlyph(view: DataView, cmapOffset: number, codePoint: number) {
  const subtableCount = view.getUint16(cmapOffset + 2);
  let format4 = 0;
  for (let index = 0; index < subtableCount; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const offset = cmapOffset + view.getUint32(record + 4);
    if (view.getUint16(offset) === 4 && (platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) {
      format4 = offset;
      if (platform === 3) break;
    }
  }
  if (!format4) return 0;
  const segmentCount = view.getUint16(format4 + 6) / 2;
  const endCodes = format4 + 14;
  const startCodes = endCodes + segmentCount * 2 + 2;
  const deltas = startCodes + segmentCount * 2;
  const ranges = deltas + segmentCount * 2;
  for (let index = 0; index < segmentCount; index += 1) {
    const end = view.getUint16(endCodes + index * 2);
    const start = view.getUint16(startCodes + index * 2);
    if (codePoint < start || codePoint > end) continue;
    const delta = view.getInt16(deltas + index * 2);
    const range = view.getUint16(ranges + index * 2);
    if (range === 0) return (codePoint + delta) & 0xffff;
    const glyphAddress = ranges + index * 2 + range + (codePoint - start) * 2;
    const glyph = view.getUint16(glyphAddress);
    return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
  }
  return 0;
}

async function readInterFont() {
  const response = await fetch("/fonts/Inter.ttf");
  if (!response.ok) throw new Error("Não foi possível carregar a fonte Inter para o PDF.");
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);
  const head = table(view, "head");
  const hhea = table(view, "hhea");
  const hmtx = table(view, "hmtx");
  const cmap = table(view, "cmap");
  const unitsPerEm = view.getUint16(head + 18);
  const metricCount = view.getUint16(hhea + 34);
  const scale = 1000 / unitsPerEm;
  const widths: number[] = [];
  for (let byte = 32; byte <= 255; byte += 1) {
    const glyph = cmapGlyph(view, cmap, cp1252CodePoint(byte));
    const metricIndex = Math.min(glyph, metricCount - 1);
    widths.push(Math.round(view.getUint16(hmtx + metricIndex * 4) * scale));
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return {
    binary,
    widths: widths.join(" "),
    unitsPerEm,
    ascent: Math.round(view.getInt16(hhea + 4) * scale),
    descent: Math.round(view.getInt16(hhea + 6) * scale),
    bbox: [view.getInt16(head + 36), view.getInt16(head + 38), view.getInt16(head + 40), view.getInt16(head + 42)].map((value) => Math.round(value * scale)) as [number, number, number, number],
  };
}

export function loadEmbeddedInter() {
  cachedFont ||= readInterFont();
  return cachedFont;
}
