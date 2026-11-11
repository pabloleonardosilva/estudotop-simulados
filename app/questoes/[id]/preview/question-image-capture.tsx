"use client";

import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

// Cópia da questão como PNG no padrão visual do cartão da Lista de questões do
// Relatório Final do Raio-X, tema Clean. A captura do Raio-X não foi alterada: as
// técnicas validadas lá (sonda de métricas, decode das imagens, fundo nulo,
// escala alta, ClipboardItem com Promise) são reproduzidas aqui sobre um cartão
// próprio, montado fora da tela só durante a captura e sempre removido.

export const QUESTION_CAPTURE_WIDTH = 960;
export const QUESTION_CAPTURE_SCALE = 3;
const MAX_CANVAS_SIDE = 16384;

export const CAPTURE_IMAGE_ERROR =
  "Não foi possível carregar todas as imagens da questão (a origem de alguma imagem não permite a cópia). Nada foi copiado.";
export const CAPTURE_UNSUPPORTED_ERROR = "Este navegador não permite copiar imagens para a área de transferência.";
export const CAPTURE_BLOCKED_ERROR = "O navegador bloqueou o acesso à área de transferência. Nada foi copiado.";
export const CAPTURE_GENERIC_ERROR = "Não foi possível copiar a questão como imagem.";
const CAPTURE_TOO_LONG_ERROR = "A questão é longa demais para ser copiada como uma única imagem. Nada foi copiado.";

// Mesma sonda usada pelo html2canvas 1.4.1 para medir a linha de base das fontes no documento ORIGINAL.
const H2C_METRICS_PROBE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export type QuestionCaptureAlternative = {
  key: string;
  label: string;
  html: string;
  imageUrl?: string | null;
};

// Por construção não carrega gabarito, comentário nem qualquer marca de acerto.
export type QuestionCaptureData = {
  code: string;
  title: string;
  tags: string[];
  difficulty: { value: number; label: string; tone: string } | null;
  statementHtml: string;
  imageUrl?: string | null;
  alternatives: QuestionCaptureAlternative[];
};

// Imagens precisam carregar com CORS já na primeira requisição: sem ele o html2canvas as omitiria em silêncio
// e a falha de origem não seria detectada pelo decode().
function withCors(html: string) {
  return html.replace(/<img\b(?![^>]*\bcrossorigin\b)/gi, '<img crossorigin="anonymous"');
}

function QuestionCaptureCard({ data }: { data: QuestionCaptureData }) {
  return (
    <article className="qcap-card" data-question-capture-card>
      <style>{CAPTURE_STYLES}</style>
      <div className={`qcap-head${data.difficulty ? "" : " qcap-head-no-status"}`}>
        <span className="qcap-number">{data.code}</span>
        <div className="qcap-head-main">
          {data.title ? <h3>{data.title}</h3> : null}
          {data.tags.length ? (
            <div className="qcap-tags">
              {data.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          ) : null}
        </div>
        {data.difficulty ? (
          <div className="qcap-status">
            <span style={{ color: data.difficulty.tone }}>{data.difficulty.value} / 5</span>
            <small>{data.difficulty.label}</small>
          </div>
        ) : null}
      </div>
      {data.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="qcap-statement-image" src={data.imageUrl} crossOrigin="anonymous" alt="" />
      ) : null}
      <div className="qcap-statement qcap-rich" dangerouslySetInnerHTML={{ __html: withCors(data.statementHtml) }} />
      {data.alternatives.length ? (
        <div className="qcap-alternatives">
          {data.alternatives.map((alternative) => (
            <div className="qcap-alternative" key={alternative.key}>
              <span>{alternative.label}</span>
              <div className="qcap-alternative-body">
                {alternative.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="qcap-alternative-image" src={alternative.imageUrl} crossOrigin="anonymous" alt="" />
                ) : null}
                <div className="qcap-rich" dangerouslySetInnerHTML={{ __html: withCors(alternative.html) }} />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

async function waitForImages(card: HTMLElement) {
  await Promise.all(
    Array.from(card.querySelectorAll("img")).map(async (img) => {
      try {
        await img.decode();
      } catch {
        throw new Error(CAPTURE_IMAGE_ERROR);
      }
      if (!img.naturalWidth) throw new Error(CAPTURE_IMAGE_ERROR);
    }),
  );
}

async function renderCardPng(card: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const { width, height } = card.getBoundingClientRect();
  const scale = Math.min(QUESTION_CAPTURE_SCALE, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
  if (scale < 1) throw new Error(CAPTURE_TOO_LONG_ERROR);
  // O preflight do Tailwind (img { display: block }) joga a sonda de métricas para outra linha e todo texto
  // do PNG desce ~8 px (diagnóstico do Raio-X, Sprint-raio-x §13.8). A regra atinge só a sonda, durante a captura.
  const probeFix = document.createElement("style");
  probeFix.textContent = `img[src="${H2C_METRICS_PROBE}"] { display: inline; }`;
  document.head.appendChild(probeFix);
  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(card, {
      backgroundColor: null,
      scale,
      logging: false,
      useCORS: true,
      onclone: (doc, clone) => {
        // SVG vira imagem isolada no html2canvas; sem cor explícita, currentColor sai preto.
        clone.querySelectorAll("svg").forEach((svg) => svg.setAttribute("color", doc.defaultView!.getComputedStyle(svg).color));
      },
    });
  } finally {
    probeFix.remove();
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível gerar a imagem da questão."))), "image/png");
  });
}

export async function renderQuestionCapture(data: QuestionCaptureData): Promise<Blob> {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-question-capture-host", "");
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${QUESTION_CAPTURE_WIDTH}px;pointer-events:none;`;
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<QuestionCaptureCard data={data} />));
    const card = host.querySelector<HTMLElement>("[data-question-capture-card]")!;
    await waitForImages(card);
    await document.fonts?.ready;
    return await renderCardPng(card);
  } finally {
    root.unmount();
    host.remove();
  }
}

// Precisa ser chamada diretamente no handler do clique: o Blob entra como Promise no ClipboardItem para
// preservar o gesto do usuário (exigência do Safari).
export async function copyQuestionCaptureToClipboard(data: QuestionCaptureData) {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error(CAPTURE_UNSUPPORTED_ERROR);
  const png = renderQuestionCapture(data);
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  } catch (error) {
    const renderError = await png.then(() => null, (err: unknown) => err);
    if (renderError instanceof Error) throw renderError;
    throw new Error(error instanceof Error && error.name === "NotAllowedError" ? CAPTURE_BLOCKED_ERROR : CAPTURE_GENERIC_ERROR);
  }
}

// Valores do cartão .rx-question-card do Raio-X com os overrides do tema Clean (.rx-theme-clean): mesma
// estrutura, tipografia e espaçamentos; superfícies brancas, linhas #e2e8f0 e texto grafite.
const CAPTURE_STYLES = `
  .qcap-card { box-sizing: border-box; width: ${QUESTION_CAPTURE_WIDTH}px; border-radius: 18px; border: 1px solid #e2e8f0; background: #fff; padding: 22px; color: #334155; font-family: var(--font-estudotop-inter), Inter, sans-serif; text-align: left; }
  .qcap-head { display: grid; grid-template-columns: auto 1fr auto; gap: 18px; align-items: flex-start; border-bottom: 1px solid #eef2f6; padding-bottom: 16px; margin-bottom: 16px; }
  .qcap-head-no-status { grid-template-columns: auto 1fr; }
  .qcap-number { min-width: 58px; height: 58px; padding: 0 14px; display: grid; place-items: center; color: #07111f; background: linear-gradient(135deg,#f97316,#f59e0b); border-radius: 16px; font-weight: 1000; white-space: nowrap; }
  .qcap-head-main { min-width: 0; }
  .qcap-head h3 { margin: 0; color: #0b1220; font-size: 20px; text-transform: uppercase; }
  .qcap-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
  .qcap-head-main > .qcap-tags:first-child { margin-top: 0; }
  .qcap-tags span { border: 1px solid #e2e8f0; background: #f8fafc; color: #334155; border-radius: 999px; padding: 5px 8px; font-size: 10px; font-weight: 800; }
  .qcap-status { text-align: right; font-weight: 1000; white-space: nowrap; }
  .qcap-status small { display: block; color: #64748b; margin-top: 4px; }
  .qcap-statement-image { display: block; max-width: 100%; max-height: 520px; width: auto; height: auto; margin: 0 auto 16px; border-radius: 12px; }
  .qcap-statement { color: #1e293b; font-size: 15px; line-height: 1.65; margin: 0; }
  .qcap-alternatives { display: grid; gap: 9px; margin: 18px 0 0; }
  .qcap-alternative { display: grid; grid-template-columns: 34px 1fr; gap: 12px; align-items: flex-start; border-radius: 14px; border: 1px solid #e2e8f0; background: #f8fafc; padding: 11px 13px; }
  .qcap-alternative > span { width: 30px; height: 30px; border-radius: 999px; display: grid; place-items: center; background: #fff; color: #334155; border: 1px solid #e2e8f0; font-weight: 1000; }
  .qcap-alternative-body { min-width: 0; color: #1e293b; font-size: 13px; line-height: 1.55; }
  .qcap-alternative-image { display: block; max-width: 100%; max-height: 320px; width: auto; height: auto; margin: 0 0 8px; border-radius: 10px; }
  .qcap-rich { overflow-wrap: break-word; white-space: pre-wrap; }
  .qcap-rich * { color: inherit !important; font-family: inherit !important; font-size: inherit !important; line-height: inherit !important; }
  .qcap-rich p { margin: 0; }
  .qcap-rich p + p { margin-top: .5em; }
  .qcap-rich ol { list-style: decimal; padding-left: 1.5em; }
  .qcap-rich ul { list-style: disc; padding-left: 1.5em; }
  .qcap-rich img { display: inline-block; max-width: 100%; height: auto; vertical-align: middle; margin: 2px 3px; }
  .qcap-rich table { width: 100%; border-collapse: collapse; margin: .6em 0; }
  .qcap-rich th, .qcap-rich td { border: 1px solid #e2e8f0; padding: .3em .6em; overflow-wrap: anywhere; }
  .qcap-rich th { background: #f8fafc; font-weight: 800; }
  .qcap-rich mark { background-color: #fde68a !important; color: #0b1220 !important; padding: 0 .2em; border-radius: 4px; }
`;
