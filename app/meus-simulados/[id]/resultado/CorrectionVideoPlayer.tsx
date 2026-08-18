"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { supabase } from "@/app/lib/supabase/client";
import { getCorrectionVideoSource, type WatchedSegment } from "@/lib/correction-video";

type YouTubePlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

type VimeoTimeData = { seconds: number; duration: number };
type VimeoPlayer = {
  on: (event: string, callback: (data: VimeoTimeData) => void) => void;
  off: (event: string) => void;
  destroy: () => Promise<void>;
};

declare global {
  interface Window {
    YT?: {
      Player: new (elementId: string, options: { videoId: string; playerVars: { playsinline: number }; events: { onReady: () => void } }) => YouTubePlayer;
      PlayerState: { PLAYING: number };
    };
    Vimeo?: {
      Player: new (element: HTMLIFrameElement) => VimeoPlayer;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youTubeApiPromise: Promise<void> | null = null;
let vimeoApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (youTubeApiPromise) return youTubeApiPromise;
  youTubeApiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return youTubeApiPromise;
}

function loadVimeoApi(): Promise<void> {
  if (window.Vimeo?.Player) return Promise.resolve();
  if (vimeoApiPromise) return vimeoApiPromise;
  vimeoApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://player.vimeo.com/api/player.js"]');
    const script = existing || document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("vimeo api unavailable")), { once: true });
    if (!existing) {
      script.src = "https://player.vimeo.com/api/player.js";
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return vimeoApiPromise;
}

export default function CorrectionVideoPlayer({ simuladoId, correctionVideoUrl }: { simuladoId: string; correctionVideoUrl: string }) {
  const source = getCorrectionVideoSource(correctionVideoUrl);
  const playerId = `correction-video-${useId().replace(/:/g, "")}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pendingSegmentsRef = useRef<WatchedSegment[]>([]);
  const pendingSecondsRef = useRef(0);
  const durationRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (flushingRef.current || pendingSegmentsRef.current.length === 0 || durationRef.current <= 0) return;
    flushingRef.current = true;
    const segments = pendingSegmentsRef.current;
    pendingSegmentsRef.current = [];
    pendingSecondsRef.current = 0;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("missing session");
      const response = await fetch(`/api/student/simulados/${simuladoId}/correction-video-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ durationSeconds: durationRef.current, segments }),
        keepalive: true,
      });
      if (!response.ok) throw new Error("progress rejected");
    } catch {
      pendingSegmentsRef.current = [...segments, ...pendingSegmentsRef.current].slice(-120);
      pendingSecondsRef.current = pendingSegmentsRef.current.reduce((total, [start, end]) => total + end - start, 0);
    } finally {
      flushingRef.current = false;
    }
  }, [simuladoId]);

  const recordTime = useCallback((currentTime: number, duration: number) => {
    if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;
    durationRef.current = duration;
    const previous = lastTimeRef.current;
    lastTimeRef.current = currentTime;
    if (previous === null) return;
    const delta = currentTime - previous;
    if (delta <= 0 || delta > 2) return;
    pendingSegmentsRef.current.push([previous, currentTime]);
    pendingSecondsRef.current += delta;
    if (pendingSecondsRef.current >= 10) void flush();
  }, [flush]);

  useEffect(() => {
    const handlePageHide = () => void flush();
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (source?.provider !== "youtube") return;
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    let timer: number | null = null;
    void loadYouTubeApi().then(() => {
      if (cancelled || !window.YT?.Player) return;
      player = new window.YT.Player(playerId, {
        videoId: source.identity.slice("youtube:".length),
        playerVars: { playsinline: 1 },
        events: {
          onReady: () => {
            timer = window.setInterval(() => {
              if (!player || player.getPlayerState() !== window.YT?.PlayerState.PLAYING) {
                lastTimeRef.current = null;
                return;
              }
              recordTime(player.getCurrentTime(), player.getDuration());
            }, 500);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      player?.destroy();
      void flush();
    };
  }, [flush, playerId, recordTime, source?.identity, source?.provider]);

  useEffect(() => {
    if (source?.provider !== "vimeo") return;
    let cancelled = false;
    let player: VimeoPlayer | null = null;
    void loadVimeoApi().then(() => {
      if (cancelled || !window.Vimeo?.Player || !iframeRef.current) return;
      player = new window.Vimeo.Player(iframeRef.current);
      player.on("timeupdate", (data) => recordTime(data.seconds, data.duration));
      player.on("seeking", () => { lastTimeRef.current = null; });
      player.on("pause", () => { lastTimeRef.current = null; void flush(); });
      player.on("ended", () => { lastTimeRef.current = null; void flush(); });
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      player?.off("timeupdate");
      player?.off("seeking");
      player?.off("pause");
      player?.off("ended");
      void player?.destroy().catch(() => undefined);
      void flush();
    };
  }, [flush, recordTime, source?.provider]);

  if (!source) return null;
  if (source.provider === "html5") {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        controlsList="nodownload noplaybackrate"
        className="h-full w-full bg-slate-950 object-contain"
        onPlay={(event) => { lastTimeRef.current = event.currentTarget.currentTime; durationRef.current = event.currentTarget.duration; }}
        onTimeUpdate={(event) => recordTime(event.currentTarget.currentTime, event.currentTarget.duration)}
        onSeeking={() => { lastTimeRef.current = null; }}
        onPause={() => void flush()}
        onEnded={() => void flush()}
      >
        <source src={source.src} />
        Seu navegador não suporta a reprodução deste vídeo.
      </video>
    );
  }

  if (source.provider === "youtube") return <div id={playerId} className="h-full w-full bg-slate-950" />;

  return (
    <iframe
      ref={iframeRef}
      src={source.src}
      title="Vídeo de correção do simulado"
      className="h-full w-full bg-slate-950"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}
