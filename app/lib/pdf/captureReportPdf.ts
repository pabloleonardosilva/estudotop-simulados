"use client";

const A4_W_PT = 595;
const A4_H_PT = 842;

/**
 * Captura cada elemento .report-page individualmente e monta o PDF.
 * Garante que cada página renderizada vire exatamente uma folha A4,
 * sem risco de quebra no meio de seções.
 */
export async function captureAndDownloadPdf(
  elementId: string,
  filename: string,
  onStart?: () => void,
  onEnd?: () => void,
) {
  onStart?.();
  try {
    const container = document.getElementById(elementId);
    if (!container) throw new Error(`Elemento #${elementId} não encontrado.`);

    const pageEls = Array.from(container.querySelectorAll<HTMLElement>(".report-page"));
    if (!pageEls.length) throw new Error("Nenhuma página .report-page encontrada.");

    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const SCALE = 2;
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
      compress: true,
    });

    for (let i = 0; i < pageEls.length; i++) {
      const el = pageEls[i];

      const canvas = await html2canvas(el, {
        scale: SCALE,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.93);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, 0, A4_W_PT, A4_H_PT);
    }

    pdf.save(`${filename}.pdf`);
  } finally {
    onEnd?.();
  }
}
