"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Download, ExternalLink, FileText, Loader2, Monitor, RefreshCw } from "lucide-react";
import type { ReportProps } from "./report-model";

type Generated = { blob: Blob; url: string; fileName: string; missingAssets: string[] };

// Versão PDF do relatório final do Raio-X. A pré-visualização é o próprio arquivo gerado
// (mesmo Blob exibido no visualizador e baixado em "Gerar PDF") — nunca uma representação à parte.
export default function RelatorioPdfClient(props: ReportProps) {
  const { analysis } = props;
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const propsRef = useRef(props);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { generateRaioXReportPdf } = await import("@/app/lib/pdf/raio-x-report-pdf");
        const result = await generateRaioXReportPdf(propsRef.current);
        if (cancelled) return;
        const url = URL.createObjectURL(result.blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setGenerated({ blob: result.blob, url, fileName: result.fileName, missingAssets: result.missingAssets });
        setStatus("ready");
      } catch (generationError) {
        if (cancelled) return;
        console.error("Erro ao gerar PDF do Raio-X:", generationError);
        setError(generationError instanceof Error && generationError.message ? generationError.message : "Erro inesperado ao gerar o PDF.");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const download = useCallback(async () => {
    if (!generated) return;
    const { downloadPdfBlob } = await import("@/app/lib/pdf/raio-x-report-pdf");
    downloadPdfBlob(generated.blob, generated.fileName);
  }, [generated]);

  return (
    <main className="min-h-screen bg-[#030b16] text-slate-100">
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#03080f]/95 px-4 py-3 backdrop-blur sm:px-6">
        <Link href={`/admin/raio-x-provas/${analysis.id}`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-white/[0.08]">
          <ArrowLeft size={15} /> Voltar
        </Link>
        <strong className="min-w-0 flex-1 truncate text-[13px] text-slate-100">{analysis.title}</strong>
        <nav aria-label="Versão do relatório" className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <Link href={`/admin/raio-x-provas/${analysis.id}/relatorio`} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black text-slate-400 transition hover:text-slate-100">
            <Monitor size={14} /> Versão Tela
          </Link>
          <span aria-current="page" className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500/15 px-3 py-1.5 text-xs font-black text-orange-200">
            <FileText size={14} /> Versão PDF
          </span>
        </nav>
        <button
          type="button"
          onClick={download}
          disabled={status !== "ready"}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 px-4 py-2 text-xs font-black text-[#07111f] shadow-md shadow-orange-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Gerar PDF
        </button>
      </header>

      {status === "ready" && generated?.missingAssets.length ? (
        <div className="mx-auto mt-3 max-w-5xl rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-xs font-bold text-amber-200">
          Algumas imagens não puderam ser carregadas e o PDF foi gerado sem elas. O conteúdo do relatório está completo.
        </div>
      ) : null}

      <section className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6">
        {status === "loading" ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] text-center">
            <Loader2 size={28} className="animate-spin text-orange-400" />
            <p className="text-sm font-black text-slate-100">Preparando o PDF do relatório…</p>
            <p className="max-w-sm text-xs text-slate-400">A pré-visualização exibida a seguir é o próprio arquivo que será baixado.</p>
          </div>
        ) : null}

        {status === "error" ? (
          <div role="alert" className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-6 text-center">
            <AlertTriangle size={28} className="text-red-300" />
            <p className="text-sm font-black text-red-100">Não foi possível gerar o PDF.</p>
            <p className="max-w-md text-xs text-red-200/80">{error}</p>
            <button type="button" onClick={() => { setStatus("loading"); setError(null); setAttempt((n) => n + 1); }} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-black text-slate-100 transition hover:bg-white/[0.1]">
              <RefreshCw size={14} /> Tentar novamente
            </button>
          </div>
        ) : null}

        {status === "ready" && generated ? (
          <>
            <iframe title={`Pré-visualização do PDF — ${analysis.title}`} src={`${generated.url}#view=FitH`} className="h-[calc(100vh-150px)] min-h-[520px] w-full rounded-2xl border border-white/10 bg-white" />
            <p className="mt-2 text-center text-[11px] text-slate-500">
              Se a pré-visualização não aparecer neste dispositivo,{" "}
              <a href={generated.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-orange-300 hover:text-orange-200">
                abra o PDF em nova aba <ExternalLink size={11} />
              </a>{" "}
              ou use &quot;Gerar PDF&quot;.
            </p>
          </>
        ) : null}
      </section>
    </main>
  );
}
