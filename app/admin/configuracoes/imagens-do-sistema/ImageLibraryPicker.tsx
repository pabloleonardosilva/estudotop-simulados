"use client";

import { Check } from "lucide-react";
import type { SystemImage, SystemImageType } from "@/lib/system-images";

export default function ImageLibraryPicker({ images, value, onChange, allowEmpty = false }: { images: SystemImage[]; value: string | null; onChange: (id: string | null) => void; allowEmpty?: boolean }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {allowEmpty && <button type="button" onClick={() => onChange(null)} className={`flex h-24 items-center justify-center rounded-2xl border text-sm font-semibold transition ${value === null ? "border-orange-400 bg-orange-500/10 text-orange-300 ring-2 ring-orange-400/20" : "border-white/10 text-slate-400 hover:border-white/25"}`}>Sem banner</button>}
    {images.map((image) => <button key={image.id} type="button" onClick={() => onChange(image.id)} className={`group relative overflow-hidden rounded-2xl border text-left transition ${value === image.id ? "border-orange-400 ring-2 ring-orange-400/20" : "border-white/10 hover:border-white/25"}`}><img src={image.url} alt="" className="h-24 w-full object-cover" /><span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-8 text-xs font-bold text-white">{image.name}</span>{value === image.id && <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-black"><Check size={14} /></span>}</button>)}
  </div>;
}

export async function loadSystemImages(type: SystemImageType): Promise<SystemImage[]> {
  const { adminFetch } = await import("@/app/lib/supabase/adminFetch");
  const response = await adminFetch(`/api/admin/system-images?type=${type}`);
  const json = await response.json();
  return json.ok ? json.images : [];
}
