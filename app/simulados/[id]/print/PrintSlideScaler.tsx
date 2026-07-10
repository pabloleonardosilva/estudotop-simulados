"use client";

import { useLayoutEffect, useRef } from "react";

export default function PrintSlideScaler({
  children,
  minFontSize,
  maxFontSize,
  lineHeight,
}: {
  children: React.ReactNode;
  minFontSize: number;
  maxFontSize: number;
  lineHeight: number;
}) {
  const availableRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const available = availableRef.current;
    const content = contentRef.current;
    if (!available || !content) return;

    function fitsAt(fontSize: number) {
      content!.style.fontSize = `${fontSize}px`;
      return content!.scrollHeight <= available!.clientHeight;
    }

    function adjust() {
      if (!fitsAt(minFontSize)) {
        content!.style.fontSize = `${minFontSize}px`;
        return;
      }

      let lo = minFontSize;
      let hi = maxFontSize;
      let best = minFontSize;

      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (fitsAt(mid)) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
        if (hi - lo < 0.2) break;
      }

      content!.style.fontSize = `${best}px`;
    }

    adjust();

    let frame = 0;
    function onResize() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(adjust);
    }

    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [minFontSize, maxFontSize]);

  return (
    <div ref={availableRef} className="flex min-h-0 flex-1 flex-col justify-start">
      <div ref={contentRef} style={{ fontSize: minFontSize, lineHeight }}>
        {children}
      </div>
    </div>
  );
}
