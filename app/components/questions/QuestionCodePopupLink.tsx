"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, X, ExternalLink } from "lucide-react";

type Props = {
  questionId?: string | null;
  code?: string | null;
  className?: string;
  // Chamado quando a questão é salva/publicada/arquivada dentro do popup.
  // Se omitido, a página é recarregada via router.refresh() como fallback.
  onSaved?: (questionId: string) => void;
};

export default function QuestionCodePopupLink({ questionId, code, className = "", onSaved }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const prefetchedRef = useRef(false);
  useEffect(() => { setMounted(true); }, []);
  const label = code || "Sem código";
  const editUrl = questionId ? `/questoes/${questionId}/editar?popup=1` : "";

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function prefetchEditor() {
    if (prefetchedRef.current || !editUrl) return;
    prefetchedRef.current = true;
    // Aquece a compilação da rota (modo dev) antes do clique, evitando o atraso visível na primeira abertura.
    fetch(editUrl).catch(() => {});
  }

  useEffect(() => {
    if (!open) return;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== "estudotop-question-popup" || event.data?.type !== "question-saved") return;
      if (!questionId || event.data?.questionId !== questionId) return;
      if (onSaved) onSaved(questionId);
      else router.refresh();
      close();
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open, questionId, router, onSaved]);

  if (!questionId) {
    return <span className={className}>{label}</span>;
  }

  function close() {
    setOpen(false);
    setIframeLoaded(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        onMouseEnter={prefetchEditor}
        onFocus={prefetchEditor}
        className={className}
        title="Abrir questão no banco"
      >
        {label}
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
          <div className="relative flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-orange-300/25 bg-[#07111F] shadow-2xl shadow-slate-950/40">
            <div className="flex items-center justify-between border-b border-white/[0.08] bg-gradient-to-r from-slate-950 via-slate-900 to-orange-950 px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">Questão do banco</p>
                <h3 className="mt-1 flex items-center gap-2 text-lg font-black">
                  {label}
                  <ExternalLink size={16} className="text-orange-200" />
                </h3>
              </div>
              <button
                type="button"
                onClick={close}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-white transition hover:bg-white/20"
                aria-label="Fechar edição da questão"
              >
                <X size={20} />
              </button>
            </div>
            {!iframeLoaded && (
              <div className="absolute inset-x-0 bottom-0 top-[73px] flex flex-col items-center justify-center gap-3 bg-[#07111F]">
                <Loader2 size={28} className="animate-spin text-orange-300" />
                <p className="text-sm font-semibold text-white/50">Carregando questão...</p>
              </div>
            )}
            <iframe
              src={editUrl}
              onLoad={() => setIframeLoaded(true)}
              className="h-full w-full flex-1 bg-[#07111F]"
              title={`Editar questão ${label}`}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
