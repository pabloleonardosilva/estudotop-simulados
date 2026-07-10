"use client";

import { useLayoutEffect, useRef, useState } from "react";

const SLIDE_ASPECT_RATIO = 16 / 9;

export default function PrintSlideFrame({ children }: { children: React.ReactNode }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const parent = anchor?.parentElement;
    if (!anchor || !parent) return;

    function fit() {
      const styles = window.getComputedStyle(parent!);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
      const availableWidth = parent!.clientWidth - paddingX;
      const availableHeight = parent!.clientHeight - paddingY;

      let width = availableWidth;
      let height = width / SLIDE_ASPECT_RATIO;
      if (height > availableHeight) {
        height = availableHeight;
        width = height * SLIDE_ASPECT_RATIO;
      }

      setSize({ width, height });
    }

    fit();

    let frame = 0;
    function onResize() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    }

    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      ref={anchorRef}
      className="bg-white"
      style={size ? { width: size.width, height: size.height } : { width: "100%", height: "100%" }}
    >
      {children}
    </div>
  );
}
