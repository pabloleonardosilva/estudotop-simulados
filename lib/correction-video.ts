export const CORRECTION_VIDEO_WATCHED_THRESHOLD = 0.2;
export const CORRECTION_VIDEO_MAX_FIRST_REPORT_SECONDS = 15;
export const CORRECTION_VIDEO_MIN_REPORT_INTERVAL_SECONDS = 2;
export const CORRECTION_VIDEO_REPORT_CLOCK_TOLERANCE_SECONDS = 1.5;

export type CorrectionVideoProvider = "html5" | "youtube" | "vimeo" | "loom" | "google_drive" | "generic";
export type WatchedSegment = [number, number];

export type CorrectionVideoSource = {
  provider: CorrectionVideoProvider;
  identity: string;
  src: string;
  trackable: boolean;
};

const TRANSIENT_QUERY_KEYS = new Set([
  "token", "signature", "sig", "expires", "expiration", "auth", "auth_key",
  "policy", "key-pair-id", "x-amz-signature", "x-amz-credential", "x-amz-date",
  "x-amz-expires", "x-goog-signature", "x-goog-credential", "x-goog-date", "x-goog-expires",
]);

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizedGenericUrl(parsed: URL): string {
  parsed.hash = "";
  for (const key of Array.from(parsed.searchParams.keys())) {
    if (TRANSIENT_QUERY_KEYS.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

export function getCorrectionVideoSource(url?: string | null): CorrectionVideoSource | null {
  const raw = String(url || "").trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const directVideo = /\.(mp4|webm|ogg|mov|m4v)$/i.test(parsed.pathname);

    if (directVideo) {
      const normalized = normalizedGenericUrl(parsed);
      return { provider: "html5", identity: `html5:${stableHash(normalized)}`, src: raw, trackable: true };
    }

    if (host === "youtu.be" || host.includes("youtube.com")) {
      const videoId = host === "youtu.be"
        ? parsed.pathname.replace(/^\//, "").split("/")[0]
        : parsed.searchParams.get("v")
          || parsed.pathname.match(/\/(?:shorts|embed)\/([^/?#]+)/i)?.[1]
          || "";
      if (videoId) {
        return {
          provider: "youtube",
          identity: `youtube:${videoId}`,
          src: `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1`,
          trackable: true,
        };
      }
    }

    if (host.includes("vimeo.com")) {
      const videoId = parsed.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part)) || "";
      if (videoId) {
        return {
          provider: "vimeo",
          identity: `vimeo:${videoId}`,
          src: `https://player.vimeo.com/video/${videoId}?api=1`,
          trackable: true,
        };
      }
    }

    if (host.includes("loom.com")) {
      const videoId = parsed.pathname.split("/").filter(Boolean).pop();
      if (videoId) return { provider: "loom", identity: `loom:${videoId}`, src: `https://www.loom.com/embed/${videoId}`, trackable: false };
    }

    if (host.includes("drive.google.com")) {
      const fileId = parsed.pathname.match(/\/file\/d\/([^/]+)/i)?.[1] || parsed.searchParams.get("id");
      if (fileId) return { provider: "google_drive", identity: `google_drive:${fileId}`, src: `https://drive.google.com/file/d/${fileId}/preview`, trackable: false };
    }

    const normalized = normalizedGenericUrl(parsed);
    return { provider: "generic", identity: `generic:${stableHash(normalized)}`, src: raw, trackable: false };
  } catch {
    return { provider: "generic", identity: `generic:${stableHash(raw)}`, src: raw, trackable: false };
  }
}

export function mergeWatchedSegments(segments: WatchedSegment[]): WatchedSegment[] {
  const sorted = segments
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start)
    .map(([start, end]) => [Math.round(start * 10) / 10, Math.round(end * 10) / 10] as WatchedSegment)
    .sort((left, right) => left[0] - right[0]);

  const merged: WatchedSegment[] = [];
  for (const segment of sorted) {
    const last = merged[merged.length - 1];
    if (!last || segment[0] > last[1] + 0.25) {
      merged.push([...segment]);
    } else {
      last[1] = Math.max(last[1], segment[1]);
    }
  }
  return merged;
}

export function watchedSeconds(segments: WatchedSegment[]): number {
  return mergeWatchedSegments(segments).reduce((total, [start, end]) => total + (end - start), 0);
}

export function watchedProgress(segments: WatchedSegment[], durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.min(1, watchedSeconds(segments) / durationSeconds);
}

export function hasWatchedCorrectionVideo(segments: WatchedSegment[], durationSeconds: number): boolean {
  return watchedProgress(segments, durationSeconds) >= CORRECTION_VIDEO_WATCHED_THRESHOLD;
}

export function isCorrectionVideoCreditPlausible({
  hasExistingProgress,
  newWatchedSeconds,
  elapsedSeconds,
}: {
  hasExistingProgress: boolean;
  newWatchedSeconds: number;
  elapsedSeconds: number;
}): boolean {
  if (!Number.isFinite(newWatchedSeconds) || newWatchedSeconds < 0) return false;
  if (newWatchedSeconds === 0) return true;
  if (!hasExistingProgress) return newWatchedSeconds <= CORRECTION_VIDEO_MAX_FIRST_REPORT_SECONDS;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < CORRECTION_VIDEO_MIN_REPORT_INTERVAL_SECONDS) return false;
  return newWatchedSeconds <= elapsedSeconds + CORRECTION_VIDEO_REPORT_CLOCK_TOLERANCE_SECONDS;
}
