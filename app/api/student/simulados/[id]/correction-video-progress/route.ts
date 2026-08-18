import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getStudentFromRequest } from "@/lib/server/supabaseStudentAuth";
import {
  CORRECTION_VIDEO_WATCHED_THRESHOLD,
  getCorrectionVideoSource,
  isCorrectionVideoCreditPlausible,
  mergeWatchedSegments,
  watchedProgress,
  watchedSeconds,
  type WatchedSegment,
} from "@/lib/correction-video";

const MAX_VIDEO_DURATION_SECONDS = 86_400;
const MAX_SEGMENTS_PER_REQUEST = 120;
const MAX_REPORTED_SEGMENT_SECONDS = 15;

type ProgressBody = {
  durationSeconds?: unknown;
  segments?: unknown;
};

function parseBody(body: ProgressBody): { durationSeconds: number; segments: WatchedSegment[] } | null {
  const durationSeconds = Number(body.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_VIDEO_DURATION_SECONDS) return null;
  if (!Array.isArray(body.segments) || body.segments.length === 0 || body.segments.length > MAX_SEGMENTS_PER_REQUEST) return null;

  const segments: WatchedSegment[] = [];
  for (const value of body.segments) {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const start = Number(value[0]);
    const end = Number(value[1]);
    if (
      !Number.isFinite(start)
      || !Number.isFinite(end)
      || start < 0
      || end <= start
      || end > durationSeconds + 1
      || end - start > MAX_REPORTED_SEGMENT_SECONDS
    ) return null;
    segments.push([start, Math.min(end, durationSeconds)]);
  }

  return { durationSeconds, segments: mergeWatchedSegments(segments) };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const student = await getStudentFromRequest(request);
  if (!student) return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });

  let body: ProgressBody;
  try {
    body = await request.json() as ProgressBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Payload inválido." }, { status: 400 });
  }

  const parsed = parseBody(body);
  if (!parsed) return NextResponse.json({ ok: false, message: "Progresso de vídeo inválido." }, { status: 400 });

  const { id: simuladoId } = await params;
  const supabase = createSupabaseAdminClient();

  const [{ data: simulado }, { data: completedAttempt }] = await Promise.all([
    supabase.from("simulados").select("id, correction_video_url").eq("id", simuladoId).maybeSingle(),
    supabase
      .from("simulado_attempts")
      .select("id")
      .eq("student_id", student.id)
      .eq("simulado_id", simuladoId)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle(),
  ]);

  if (!simulado) return NextResponse.json({ ok: false, message: "Simulado não encontrado." }, { status: 404 });
  if (!completedAttempt) return NextResponse.json({ ok: false, message: "O resultado deste simulado ainda não está disponível." }, { status: 403 });

  const video = getCorrectionVideoSource(simulado.correction_video_url);
  if (!video || !video.trackable) {
    return NextResponse.json({ ok: false, message: "Este provedor não permite rastreamento confiável." }, { status: 400 });
  }

  const { data: existing, error: readError } = await supabase
    .from("student_correction_video_progress")
    .select("id, watched_segments, video_duration_seconds, completed_threshold_at, first_started_at, last_watched_at")
    .eq("student_id", student.id)
    .eq("simulado_id", simuladoId)
    .eq("video_identity", video.identity)
    .maybeSingle();

  if (readError) return NextResponse.json({ ok: false, message: "Não foi possível registrar o progresso do vídeo." }, { status: 500 });

  const previousDuration = Number(existing?.video_duration_seconds || 0);
  if (previousDuration > 0 && Math.abs(previousDuration - parsed.durationSeconds) / previousDuration > 0.05) {
    return NextResponse.json({ ok: false, message: "Duração do vídeo inconsistente." }, { status: 400 });
  }

  const storedSegments = Array.isArray(existing?.watched_segments)
    ? (existing.watched_segments as WatchedSegment[])
    : [];
  const mergedSegments = mergeWatchedSegments([...storedSegments, ...parsed.segments]);
  const effectiveDuration = previousDuration || parsed.durationSeconds;
  const previousWatchedSeconds = watchedSeconds(storedSegments);
  const totalWatchedSeconds = watchedSeconds(mergedSegments);
  const newWatchedSeconds = Math.max(0, totalWatchedSeconds - previousWatchedSeconds);
  const lastWatchedAt = existing ? new Date(existing.last_watched_at).getTime() : Number.NaN;
  const elapsedSeconds = Number.isFinite(lastWatchedAt) ? Math.max(0, (Date.now() - lastWatchedAt) / 1000) : 0;
  if (!isCorrectionVideoCreditPlausible({ hasExistingProgress: Boolean(existing), newWatchedSeconds, elapsedSeconds })) {
    return NextResponse.json({ ok: false, message: "Progresso enviado em frequência incompatível com a reprodução." }, { status: 429 });
  }
  const progress = watchedProgress(mergedSegments, effectiveDuration);
  const now = new Date().toISOString();
  const completedThresholdAt = existing?.completed_threshold_at
    || (progress >= CORRECTION_VIDEO_WATCHED_THRESHOLD ? now : null);

  const { error: writeError } = await supabase
    .from("student_correction_video_progress")
    .upsert({
      student_id: student.id,
      simulado_id: simuladoId,
      video_identity: video.identity,
      video_provider: video.provider,
      watched_segments: mergedSegments,
      watched_seconds: totalWatchedSeconds,
      video_duration_seconds: effectiveDuration,
      max_progress_percent: Math.min(100, progress * 100),
      first_started_at: existing?.first_started_at || now,
      last_watched_at: now,
      completed_threshold_at: completedThresholdAt,
    }, { onConflict: "student_id,simulado_id,video_identity" });

  if (writeError) return NextResponse.json({ ok: false, message: "Não foi possível registrar o progresso do vídeo." }, { status: 500 });

  return NextResponse.json({
    ok: true,
    message: "Progresso registrado.",
    watched: Boolean(completedThresholdAt),
    watchedSeconds: totalWatchedSeconds,
  });
}
