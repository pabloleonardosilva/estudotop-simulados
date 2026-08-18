import { expect, test } from "@playwright/test";
import {
  getCorrectionVideoSource,
  hasWatchedCorrectionVideo,
  isCorrectionVideoCreditPlausible,
  mergeWatchedSegments,
  watchedSeconds,
} from "../lib/correction-video";

test.describe("progresso do vídeo de correção", () => {
  test("19,9% não conta e 20,0% conta", () => {
    expect(hasWatchedCorrectionVideo([[0, 119.4]], 600)).toBe(false);
    expect(hasWatchedCorrectionVideo([[0, 120]], 600)).toBe(true);
  });

  test("trechos repetidos não são contados duas vezes", () => {
    const merged = mergeWatchedSegments([[0, 30], [0, 30], [20, 40]]);
    expect(merged).toEqual([[0, 40]]);
    expect(watchedSeconds(merged)).toBe(40);
  });

  test("trechos diferentes acumulam entre sessões", () => {
    expect(hasWatchedCorrectionVideo([[0, 60], [480, 540]], 600)).toBe(true);
  });

  test("ausência de URL não produz identidade de vídeo", () => {
    expect(getCorrectionVideoSource(null)).toBeNull();
  });

  test("troca de vídeo gera identidade diferente", () => {
    const first = getCorrectionVideoSource("https://vimeo.com/123456");
    const second = getCorrectionVideoSource("https://vimeo.com/654321");
    expect(first?.identity).not.toBe(second?.identity);
  });

  test("somente provedores com telemetria disponível são rastreáveis", () => {
    expect(getCorrectionVideoSource("https://youtu.be/abc123")?.trackable).toBe(true);
    expect(getCorrectionVideoSource("https://vimeo.com/123456")?.trackable).toBe(true);
    expect(getCorrectionVideoSource("https://cdn.example.com/video.mp4")?.trackable).toBe(true);
    expect(getCorrectionVideoSource("https://drive.google.com/file/d/file123/view")?.trackable).toBe(false);
  });

  test("primeiro envio não pode creditar mais de 15 segundos", () => {
    expect(isCorrectionVideoCreditPlausible({ hasExistingProgress: false, newWatchedSeconds: 15, elapsedSeconds: 0 })).toBe(true);
    expect(isCorrectionVideoCreditPlausible({ hasExistingProgress: false, newWatchedSeconds: 15.1, elapsedSeconds: 0 })).toBe(false);
  });

  test("envios seguintes respeitam intervalo e relógio do servidor", () => {
    expect(isCorrectionVideoCreditPlausible({ hasExistingProgress: true, newWatchedSeconds: 10, elapsedSeconds: 10 })).toBe(true);
    expect(isCorrectionVideoCreditPlausible({ hasExistingProgress: true, newWatchedSeconds: 10, elapsedSeconds: 1 })).toBe(false);
    expect(isCorrectionVideoCreditPlausible({ hasExistingProgress: true, newWatchedSeconds: 20, elapsedSeconds: 10 })).toBe(false);
  });
});
