"use client";

import { useEffect, useRef, useState } from "react";
import { Move, Radio, RotateCcw, X } from "lucide-react";
import PremiumButton from "@/app/components/ui/PremiumButton";
import ProfessorEventBannerFrame from "@/app/professor/eventos/[id]/ProfessorEventBannerFrame";

const DEFAULT_POSITION = 50;
const clamp = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : DEFAULT_POSITION));

export default function BannerPositionModal({ imageUrl, initialX, initialY, eventName, simuladoTitle, onCancel, onSave }: { imageUrl: string; initialX: number | null; initialY: number | null; eventName: string; simuladoTitle: string; onCancel: () => void; onSave: (x: number, y: number) => void | Promise<void> }) {
  const [position, setPosition] = useState({ x: clamp(initialX ?? DEFAULT_POSITION), y: clamp(initialY ?? DEFAULT_POSITION) });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLElement>(null);
  const dragRef = useRef({ pointerId: 0, clientX: 0, clientY: 0, x: position.x, y: position.y });

  useEffect(() => {
    const image = new Image();
    image.onload = () => setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = imageUrl;
  }, [imageUrl]);

  function move(clientX: number, clientY: number) {
    const frame = frameRef.current;
    if (!frame || !natural.width || !natural.height) return;
    const rect = frame.getBoundingClientRect();
    const scale = Math.max(rect.width / natural.width, rect.height / natural.height);
    const overflowX = Math.max(0, natural.width * scale - rect.width);
    const overflowY = Math.max(0, natural.height * scale - rect.height);
    const deltaX = clientX - dragRef.current.clientX;
    const deltaY = clientY - dragRef.current.clientY;
    setPosition({
      x: overflowX ? clamp(dragRef.current.x - (deltaX / overflowX) * 100) : dragRef.current.x,
      y: overflowY ? clamp(dragRef.current.y - (deltaY / overflowY) * 100) : dragRef.current.y,
    });
  }

  return <div className="fixed inset-0 z-[12000] overflow-y-auto bg-slate-950/75 px-3 py-6 backdrop-blur-md sm:px-6">
    <div className="mx-auto w-full max-w-[1500px] rounded-[30px] border border-white/80 bg-[#f8fafc] p-4 shadow-[0_32px_100px_rgba(2,6,23,0.34)] sm:p-7">
      <div className="mb-6 flex items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Pré-visualização real</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-[#07142f]">Ajustar enquadramento do banner</h2><p className="mt-2 text-sm text-slate-600">Arraste a imagem para escolher a área que ficará visível na dashboard do professor.</p></div><PremiumButton variant="secondary" onClick={onCancel} icon={<X size={17} />}>Fechar</PremiumButton></div>
      {natural.width ? <ProfessorEventBannerFrame imageUrl={imageUrl} positionX={position.x} positionY={position.y} containerRef={frameRef} interactive dragging={dragging} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: position.x, y: position.y }; setDragging(true); }} onPointerMove={(event) => { if (dragging && event.pointerId === dragRef.current.pointerId) move(event.clientX, event.clientY); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false); }}>
        <div className="relative z-10 w-full max-w-[600px] px-7 py-6 sm:max-w-[55%] sm:px-10 md:max-w-[49%] md:px-[clamp(42px,4.4vw,76px)] md:py-5 lg:max-w-[47%]"><span className="inline-flex h-8 items-center gap-2.5 rounded-full border border-emerald-300/70 bg-emerald-50/90 px-3.5 text-[12px] font-bold text-emerald-700"><span className="relative flex h-2.5 w-2.5 items-center justify-center"><span className="absolute h-full w-full rounded-full bg-emerald-400/35 motion-safe:animate-pulse motion-safe:[animation-duration:2s] motion-reduce:animate-none" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span><Radio size={13} className="sr-only" /> Atualização ao vivo</span><p className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-orange-600">Evento de Simulado</p><h3 className="mt-2.5 text-[clamp(32px,3.8vw,56px)] font-bold leading-[0.98] tracking-[-0.055em] text-[#07142f]">{eventName || "Novo Evento"}</h3><div className="mt-4 max-w-[580px] space-y-1 text-[14px] font-medium leading-[1.45] text-slate-700"><p>{simuladoTitle || "Simulado ainda não vinculado"}</p><p className="text-slate-600">Dados consolidados pela tentativa oficial</p></div></div>
        <span className="pointer-events-none absolute bottom-4 right-5 z-30 inline-flex items-center gap-2 rounded-full border border-white/70 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur"><Move size={14} /> Arraste para reposicionar</span>
      </ProfessorEventBannerFrame> : <div className="flex h-[280px] items-center justify-center rounded-[26px] bg-slate-100 text-sm text-slate-500">Carregando imagem...</div>}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between"><PremiumButton variant="secondary" disabled={saving} onClick={() => setPosition({ x: DEFAULT_POSITION, y: DEFAULT_POSITION })} icon={<RotateCcw size={16} />}>Restaurar posição padrão</PremiumButton><div className="flex gap-3"><PremiumButton variant="secondary" disabled={saving} onClick={onCancel}>Cancelar</PremiumButton><PremiumButton disabled={saving} onClick={() => { setSaving(true); void Promise.resolve(onSave(clamp(position.x), clamp(position.y))).finally(() => setSaving(false)); }}>{saving ? "Salvando..." : "Salvar posição"}</PremiumButton></div></div>
    </div>
  </div>;
}
