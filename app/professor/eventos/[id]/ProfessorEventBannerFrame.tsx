"use client";

import type { PointerEventHandler, ReactNode, Ref } from "react";

export default function ProfessorEventBannerFrame({ imageUrl, positionX = 50, positionY = 50, children, containerRef, interactive = false, dragging = false, onPointerDown, onPointerMove, onPointerUp }: { imageUrl: string; positionX?: number; positionY?: number; children: ReactNode; containerRef?: Ref<HTMLElement>; interactive?: boolean; dragging?: boolean; onPointerDown?: PointerEventHandler<HTMLElement>; onPointerMove?: PointerEventHandler<HTMLElement>; onPointerUp?: PointerEventHandler<HTMLElement> }) {
  return <header ref={containerRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} className={`relative isolate flex h-[340px] items-center overflow-hidden rounded-[26px] border border-slate-900/[0.04] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.10),0_3px_10px_rgba(15,23,42,0.05)] sm:h-[300px] md:h-[280px] xl:h-[320px] 2xl:h-[340px] ${interactive ? `touch-none select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}` : ""}`}>
    <img src={imageUrl} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${positionX}% ${positionY}%` }} />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/75 sm:bg-transparent sm:bg-[linear-gradient(90deg,rgba(255,255,255,0.94)_0%,rgba(255,255,255,0.84)_22%,rgba(255,255,255,0.58)_34%,rgba(255,255,255,0.24)_44%,rgba(255,255,255,0.08)_56%,rgba(255,255,255,0.08)_100%)]" />
    <svg aria-hidden="true" viewBox="0 0 1600 340" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-[5] h-full w-full" fill="none">
      <defs>
        <linearGradient id="professor-banner-ornament-primary" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#786f64" stopOpacity="0.32" />
          <stop offset="0.3" stopColor="#8a8176" stopOpacity="0.22" />
          <stop offset="0.46" stopColor="#f8f5ef" stopOpacity="0.26" />
          <stop offset="1" stopColor="#fffdf8" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="professor-banner-ornament-secondary" x1="0" y1="0" x2="1600" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#685f55" stopOpacity="0.2" />
          <stop offset="0.34" stopColor="#857b70" stopOpacity="0.14" />
          <stop offset="0.52" stopColor="#f4efe7" stopOpacity="0.17" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      <g stroke="url(#professor-banner-ornament-primary)" strokeWidth="0.75" vectorEffect="non-scaling-stroke">
        <path d="M0 46h72V17h116M214 17h46" />
        <path d="M26 92v-18h24M78 74h34v12M144 28v22h28" />
        <path d="M0 291h54v31h102M184 322h68M92 298v-19h31" />
        <path d="M28 238h36v18H47M82 270h22v16" />
        <path d="M1320 17h62v19h35M1452 36h62v28h86" />
        <path d="M1538 84v22h34M1494 112h19v17h31" />
        <path d="M1518 222h30v-17h52M1468 250h44v25h27" />
        <path d="M1364 322h72v-27h44M1512 295h88M1560 276v-26h40" />
        <path d="M314 0v16h47M392 0v28h30M1118 0v17h-56" />
        <path d="M332 340v-18h38M404 340v-27h47M1210 340v-16h-42" />
        <path d="M506 0v12h34M584 0v20h24M748 0v13h42" />
        <path d="M548 340v-14h28M706 340v-19h36M884 340v-12h42" />
        <path d="M962 0v16h31M1018 324h34v16M1268 0v12h28" />
        <path d="M612 54h36v17h24M716 82h22v-15h31" />
        <path d="M806 44h28v19h38M918 76h42v-16h20" />
        <path d="M676 286h30v-18h22M792 302h43v-16h25" />
        <path d="M902 278h24v18h36M1036 294h34v-20h18" />
        <path d="M758 122h14m-7-7v14M968 118h12m-6-6v12" />
        <path d="M18 151h14m-7-7v14M1566 166h18m-9-9v18" />
        <path d="M1288 72h16m-8-8v16M238 286h12m-6-6v12" />
        <path d="M116 112h18l8 8h22M1444 88h20l7 7h18" />
        <path d="M1424 304h16l7-7h21M126 312h15l7-7h18" />
        <circle cx="54" cy="184" r="3.5" /><circle cx="69" cy="184" r="1.5" />
        <circle cx="1542" cy="196" r="3.5" /><circle cx="1558" cy="196" r="1.5" />
      </g>
      <g stroke="url(#professor-banner-ornament-secondary)" strokeWidth="0.7" vectorEffect="non-scaling-stroke">
        <path d="M18 119h31M61 119h19M18 128h48" strokeDasharray="10 5" />
        <path d="M20 214h58M91 214h27M42 224h46" strokeDasharray="15 7" />
        <path d="M1480 139h34M1525 139h53M1506 149h72" strokeDasharray="12 6" />
        <path d="M1452 286h31M1495 286h18M1530 286h48" strokeDasharray="9 5" />
        <path d="M278 20h24v14M286 306h22v-13M1300 307h26v-16M1387 54h20v14" />
        <path d="M0 176c22-14 42-14 64 0M1536 64c20 13 41 13 64 0" />
        <path d="M0 268c30-18 58-18 86 0M1514 314c28-16 56-16 86 0" />
        <path d="M470 16h29M620 326h38M806 18h24M934 326h31M1152 20h36" strokeDasharray="11 6" />
        <path d="M566 102h25M604 102h16M842 92h31M888 92h18M986 252h26M1024 252h17" strokeDasharray="9 5" />
        <path d="M746 246h20l7 7h18M874 112h17l7-7h20" />
        <circle cx="196" cy="35" r="2.5" /><circle cx="274" cy="322" r="2.5" />
        <circle cx="1436" cy="36" r="2.5" /><circle cx="1488" cy="304" r="2.5" />
      </g>
    </svg>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-1 ring-inset ring-slate-900/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.40)]" />
    {children}
  </header>;
}
