/**
 * Exportação do Vibely Studio.
 * Renderiza a timeline em tempo real num canvas, mixa todas as faixas de áudio
 * no Web Audio e grava tudo com o MediaRecorder do próprio aparelho.
 */

import { audioGainAt, renderFrame, type RenderContext } from "./render";
import { clipDuration, layout, sourceTimeAt } from "./timeline";
import type { AudioClip, StudioProject } from "./types";
import { ASPECTS } from "./types";

export type ExportQuality = { height: 720 | 1080 | 1440 | 2160; fps: 24 | 30 | 60 };

export function supportedHeights(): (720 | 1080 | 1440 | 2160)[] {
  const list: (720 | 1080 | 1440 | 2160)[] = [720, 1080];
  if (typeof document === "undefined") return list;
  // 1440p/4K só quando o canvas do aparelho comporta a textura
  const probe = document.createElement("canvas");
  try {
    probe.width = 2560;
    probe.height = 2560;
    const ok = !!probe.getContext("2d");
    if (ok) list.push(1440);
    probe.width = 3840;
    probe.height = 3840;
    if (probe.getContext("2d") && (navigator as any).deviceMemory !== undefined
      ? ((navigator as any).deviceMemory ?? 4) >= 6
      : false) {
      list.push(2160);
    }
  } catch {
    /* dispositivo limitado: mantém 720/1080 */
  }
  return list;
}

export function pickMime(): string {
  const cands = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  try {
    return cands.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
  } catch {
    return "";
  }
}

function bitrate(w: number, h: number, fps: number) {
  const px = w * h;
  const base = px > 3_000_000 ? 20_000_000 : px > 1_800_000 ? 12_000_000 : px > 900_000 ? 7_000_000 : 4_000_000;
  return Math.round(base * (fps >= 60 ? 1.35 : 1));
}

export function dimensionsFor(aspect: string, height: number) {
  const ratio = ASPECTS.find((a) => a.id === aspect)?.ratio ?? 9 / 16;
  let h = height;
  let w = Math.round(h * ratio);
  w -= w % 2;
  h -= h % 2;
  return { w, h };
}

export type ExportArgs = {
  project: StudioProject;
  quality: ExportQuality;
  sources: Map<string, HTMLVideoElement | HTMLImageElement>;
  audioBlobs: Map<string, Blob>;
  fonts: Map<string, string>;
  stickerImages?: Map<string, HTMLImageElement>;
  watermark?: { username?: string | null } | null;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
};

function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number, username?: string | null) {
  const pad = Math.round(w * 0.035);
  const size = Math.max(14, Math.round(h * 0.022));
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = "#c9ff4b";
  const label = username ? `vibely · @${username}` : "vibely";
  ctx.fillText(label, w - pad, h - pad);
  ctx.restore();
}

export async function exportProject(args: ExportArgs): Promise<Blob> {
  const { project, quality, sources, audioBlobs, fonts, onProgress, signal } = args;
  const { w, h } = dimensionsFor(project.aspect, quality.height);
  const placed = layout(project);
  const total = placed.length ? placed[placed.length - 1]!.end : 0;
  const audioClips = project.clips.filter((c): c is AudioClip => c.kind === "audio");
  const timelineEnd = Math.max(total, ...audioClips.map((c) => c.to), 0.5);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas indisponível neste aparelho");

  const rc: RenderContext = {
    ctx,
    w,
    h,
    sources,
    frameCanvas: document.createElement("canvas"),
    scratch: document.createElement("canvas"),
    fonts,
    stickerImages: args.stickerImages,
  };

  const stream = canvas.captureStream(quality.fps);

  // ---------- áudio ----------
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const scheduled: { source: AudioBufferSourceNode; gain: GainNode; clip: AudioClip }[] = [];
  const originalEls: { el: HTMLVideoElement; gain: GainNode }[] = [];

  for (const clip of audioClips) {
    const blob = audioBlobs.get(clip.mediaId);
    if (!blob) continue;
    try {
      const buffer = await audioCtx.decodeAudioData(await blob.arrayBuffer());
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(dest);
      scheduled.push({ source, gain, clip });
    } catch (err) {
      console.warn("[studio] faixa de áudio ignorada", err);
    }
  }

  // áudio original dos vídeos
  for (const p of placed) {
    const el = sources.get(p.clip.mediaId);
    if (!el || !(el instanceof HTMLVideoElement)) continue;
    if (p.clip.muted || p.clip.volume <= 0) continue;
    try {
      const node = audioCtx.createMediaElementSource(el);
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      node.connect(gain).connect(dest);
      originalEls.push({ el, gain });
    } catch {
      /* já conectado numa exportação anterior */
    }
  }

  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  if (audioCtx.state === "suspended") await audioCtx.resume();

  const mime = pickMime();
  const rec = mime
    ? new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: bitrate(w, h, quality.fps),
        audioBitsPerSecond: 192_000,
      })
    : new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
  });

  const startAt = audioCtx.currentTime + 0.12;
  for (const s of scheduled) {
    try {
      s.source.start(startAt + s.clip.from, Math.max(0, s.clip.offset));
      s.source.stop(startAt + s.clip.to);
    } catch {
      /* ignore */
    }
  }

  rec.start(250);
  const t0 = performance.now();
  let stopped = false;

  const playingVideos = new Set<HTMLVideoElement>();

  await new Promise<void>((resolve) => {
    const step = async () => {
      if (signal?.aborted) {
        stopped = true;
        resolve();
        return;
      }
      const t = (performance.now() - t0) / 1000;
      if (t >= timelineEnd) {
        stopped = true;
        resolve();
        return;
      }

      // posiciona as fontes de vídeo
      const p = placed.find((x) => t >= x.start && t < x.end);
      for (const other of placed) {
        const el = sources.get(other.clip.mediaId);
        if (el instanceof HTMLVideoElement && other !== p && playingVideos.has(el)) {
          el.pause();
          playingVideos.delete(el);
        }
      }
      if (p) {
        const el = sources.get(p.clip.aiMediaId || p.clip.mediaId);
        if (el instanceof HTMLVideoElement) {
          const want = sourceTimeAt(p.clip, t - p.start);
          const rate = Math.max(0.25, Math.min(4, p.clip.speed));
          if (Math.abs(el.currentTime - want) > 0.22) el.currentTime = want;
          if (el.playbackRate !== rate) el.playbackRate = rate;
          if (el.paused) {
            playingVideos.add(el);
            void el.play().catch(() => {});
          }
        }
      }

      // volumes
      for (const s of scheduled) s.gain.gain.value = audioGainAt(s.clip, t);
      for (const o of originalEls) {
        const clip = p?.clip;
        const on = clip && sources.get(clip.mediaId) === o.el && !clip.muted;
        o.gain.gain.value = on ? (clip!.volume / 100) * (project.originalVolume / 100) : 0;
      }

      renderFrame(rc, project, t);
      if (args.watermark) drawWatermark(ctx, w, h, args.watermark.username);
      onProgress?.(Math.min(0.99, t / timelineEnd));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  for (const el of playingVideos) el.pause();
  for (const s of scheduled) {
    try {
      s.source.stop();
    } catch {
      /* já parou */
    }
  }
  if (!stopped) await new Promise((r) => setTimeout(r, 60));
  rec.stop();
  const blob = await done;
  await audioCtx.close().catch(() => {});
  onProgress?.(1);
  return blob;
}

export { clipDuration };
