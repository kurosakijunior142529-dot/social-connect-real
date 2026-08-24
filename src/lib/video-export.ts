/**
 * Client-side video export: trim, filter, mute, vertical crop,
 * AI-style watermark removal (content-aware patch) and music overlay.
 * Runs entirely on the device using canvas + MediaRecorder so uploads are
 * smaller and faster. Falls back gracefully when re-encoding isn't needed.
 */

export function pickVideoMime(): string {
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

export type WatermarkCorner = "br" | "bl" | "tr" | "tl";

export type MusicTrack = {
  url: string;
  name: string;
  /** 0..1 music level in the final mix */
  volume: number;
  /** seconds into the track where playback starts */
  offset: number;
  /** 0..1 original video audio level */
  originalVolume: number;
};

export type ExportOptions = {
  /** css filter string, e.g. "saturate(1.2)" */
  filterCss?: string;
  from?: number;
  to?: number;
  muted?: boolean;
  /** "original" keeps source ratio, "vertical" crops to 9:16 */
  aspect?: "original" | "vertical";
  /** corners to clean up with the content-aware watermark remover */
  dewatermark?: WatermarkCorner[];
  /** strength 0..1 of the watermark removal patch */
  dewatermarkStrength?: number;
  music?: MusicTrack | null;
  onProgress?: (p: number) => void;
};

export function needsReencode(opts: ExportOptions, duration: number): boolean {
  const from = opts.from ?? 0;
  const to = opts.to ?? duration;
  if (opts.filterCss && opts.filterCss !== "none") return true;
  if (opts.muted) return true;
  if (opts.aspect === "vertical") return true;
  if (opts.dewatermark && opts.dewatermark.length > 0) return true;
  if (opts.music) return true;
  if (duration > 0 && (from > 0.05 || to < duration - 0.05)) return true;
  return false;
}

/**
 * Vídeos vindos direto da câmera chegavam com 8–28 MB e bitrate de 10–20 Mbps.
 * Além do tamanho, muitos têm o índice (`moov`) no fim do arquivo, o que obriga
 * o player a baixar o arquivo inteiro antes do primeiro frame. Reprocessar no
 * device resolve os dois problemas (o MediaRecorder sempre escreve o índice no
 * começo) sem perda visual perceptível até 1080p.
 */
export function shouldCompress(file: File, duration: number): boolean {
  if (!file.type.startsWith("video/")) return false;
  if (file.size > 6 * 1024 * 1024) return true;
  if (duration > 0) {
    const bitrate = (file.size * 8) / duration;
    if (bitrate > 3_000_000) return true;
  }
  return false;
}

/** Bitrate alvo proporcional à resolução (~3,3 Mbps em 1080p, ~1,5 em 720p). */
function targetBitrate(w: number, h: number): number {
  return Math.min(4_500_000, Math.max(1_200_000, Math.round(w * h * 1.6)));
}

/** Grabs a single frame (used as cover thumbnail) as a JPEG blob. */
export async function captureFrame(srcUrl: string, at: number): Promise<Blob | null> {
  try {
    const v = document.createElement("video");
    v.src = srcUrl;
    v.muted = true;
    v.playsInline = true;
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error("metadata"));
    });
    v.currentTime = Math.max(0, Math.min(at, (v.duration || 1) - 0.05));
    await new Promise<void>((res) => {
      v.onseeked = () => res();
    });
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth || 720;
    canvas.height = v.videoHeight || 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.85));
  } catch (err) {
    console.warn("[video-export] captureFrame failed", err);
    return null;
  }
}

/** Region (in canvas px) covered by a corner watermark. */
function cornerRect(corner: WatermarkCorner, w: number, h: number) {
  const rw = Math.round(w * 0.34);
  const rh = Math.round(h * 0.12);
  const m = Math.round(Math.min(w, h) * 0.015);
  const x = corner === "br" || corner === "tr" ? w - rw - m : m;
  const y = corner === "br" || corner === "bl" ? h - rh - m : m;
  return { x, y, w: rw, h: rh };
}

/**
 * Content-aware clean-up: replaces the watermark area with a reconstruction
 * built from neighbouring pixels (clone + mirrored blend + blur), so logos and
 * usernames dissolve into the background instead of being covered by a box.
 */
function cleanRegion(
  ctx: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement,
  sctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  canvasW: number,
  canvasH: number,
  strength: number,
) {
  const { x, y, w, h } = rect;
  if (w <= 2 || h <= 2) return;

  // pick a donor strip just outside the region (above when possible)
  const donorY = y - h >= 0 ? y - h : Math.min(canvasH - h, y + h);
  const donorX = Math.max(0, Math.min(canvasW - w, x));

  scratch.width = w;
  scratch.height = h;
  sctx.clearRect(0, 0, w, h);

  // 1. clone the donor strip
  sctx.drawImage(ctx.canvas, donorX, donorY, w, h, 0, 0, w, h);
  // 2. blend a vertically mirrored copy to kill visible seams
  sctx.save();
  sctx.globalAlpha = 0.5;
  sctx.translate(0, h);
  sctx.scale(1, -1);
  sctx.drawImage(ctx.canvas, donorX, donorY, w, h, 0, 0, w, h);
  sctx.restore();
  // 3. low-pass the patch so residual texture matches a soft background
  sctx.save();
  sctx.filter = `blur(${Math.max(2, Math.round(Math.min(w, h) * 0.12))}px)`;
  sctx.globalAlpha = 0.9;
  sctx.drawImage(scratch, 0, 0);
  sctx.restore();

  // 4. feathered composite over the watermark
  ctx.save();
  ctx.globalAlpha = Math.max(0.5, Math.min(1, strength));
  ctx.filter = "blur(0.4px)";
  ctx.drawImage(scratch, x, y, w, h);
  ctx.restore();
}

export async function exportVideo(
  srcUrl: string,
  opts: ExportOptions = {},
): Promise<{ blob: Blob; ext: string }> {
  const {
    filterCss = "none",
    muted = false,
    aspect = "original",
    dewatermark = [],
    dewatermarkStrength = 1,
    music = null,
    onProgress,
  } = opts;

  const src = document.createElement("video");
  src.src = srcUrl;
  src.crossOrigin = "anonymous";
  src.playsInline = true;
  src.muted = muted;
  await new Promise<void>((res, rej) => {
    src.onloadedmetadata = () => res();
    src.onerror = () => rej(new Error("Falha ao carregar vídeo"));
  });

  const duration = Number.isFinite(src.duration) ? src.duration : 0;
  const from = Math.max(0, opts.from ?? 0);
  const to = Math.min(duration || Number.MAX_SAFE_INTEGER, opts.to && opts.to > from ? opts.to : duration);

  const sw = src.videoWidth || 720;
  const sh = src.videoHeight || 1280;

  let w: number;
  let h: number;
  if (aspect === "vertical") {
    w = Math.min(1080, sw);
    h = Math.round((w * 16) / 9);
  } else {
    w = Math.min(1080, sw);
    h = Math.round((sh / sw) * w) || 1280;
  }
  // even dimensions keep encoders happy
  w -= w % 2;
  h -= h % 2;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste dispositivo");

  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d");

  const canvasStream = canvas.captureStream(30);

  // ---- audio graph (original + music) ----
  let audioCtx: AudioContext | null = null;
  let musicEl: HTMLAudioElement | null = null;
  const wantsAudio = !muted || !!music;
  if (wantsAudio) {
    try {
      audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();

      if (!muted) {
        const sourceNode = audioCtx.createMediaElementSource(src);
        const gain = audioCtx.createGain();
        gain.gain.value = music ? Math.max(0, Math.min(1, music.originalVolume)) : 1;
        sourceNode.connect(gain).connect(dest);
      }

      if (music) {
        musicEl = document.createElement("audio");
        musicEl.src = music.url;
        musicEl.crossOrigin = "anonymous";
        musicEl.loop = true;
        await new Promise<void>((res) => {
          musicEl!.oncanplay = () => res();
          musicEl!.onerror = () => res();
          setTimeout(res, 4000);
        });
        musicEl.currentTime = Math.max(0, music.offset);
        const mNode = audioCtx.createMediaElementSource(musicEl);
        const mGain = audioCtx.createGain();
        mGain.gain.value = Math.max(0, Math.min(1, music.volume));
        mNode.connect(mGain).connect(dest);
      }

      dest.stream.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
      if (audioCtx.state === "suspended") await audioCtx.resume();
    } catch (err) {
      console.warn("[video-export] audio graph unavailable", err);
    }
  }

  const mime = pickVideoMime();
  const rec = mime
    ? new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: targetBitrate(w, h), audioBitsPerSecond: 160_000 })
    : new MediaRecorder(canvasStream, { audioBitsPerSecond: 192_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  src.currentTime = from;
  await new Promise<void>((res) => {
    src.onseeked = () => res();
  });

  const total = Math.max(0.1, to - from);
  // cover-fit source into the target canvas
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;

  const rects = dewatermark.map((c) => cornerRect(c, w, h));

  let raf = 0;
  let vfc = 0;
  const hasVFC = typeof (src as any).requestVideoFrameCallback === "function";

  const paint = () => {
    ctx.save();
    (ctx as any).filter = filterCss || "none";
    ctx.drawImage(src, dx, dy, dw, dh);
    ctx.restore();
    if (sctx) {
      for (const r of rects) cleanRegion(ctx, scratch, sctx, r, w, h, dewatermarkStrength);
    }
    onProgress?.(Math.min(1, (src.currentTime - from) / total));
  };

  // Desenhar por frame *do vídeo* (não por frame da tela) mantém a cadência
  // idêntica à origem; com rAF o canvas repetia/perdia quadros e o áudio,
  // gravado em tempo real, saía dessincronizado.
  const startDrawLoop = () => {
    if (hasVFC) {
      const step = () => {
        paint();
        vfc = (src as any).requestVideoFrameCallback(step);
      };
      vfc = (src as any).requestVideoFrameCallback(step);
    } else {
      const step = () => {
        paint();
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
  };
  const stopDrawLoop = () => {
    if (raf) cancelAnimationFrame(raf);
    if (vfc && typeof (src as any).cancelVideoFrameCallback === "function") {
      (src as any).cancelVideoFrameCallback(vfc);
    }
  };

  const done = new Promise<Blob>((res) => {
    rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
  });

  // Primeiro quadro no canvas antes de gravar: evita um trecho preto inicial.
  paint();

  try {
    await src.play();
    if (musicEl) await musicEl.play().catch(() => undefined);
  } catch (err) {
    throw new Error("Não foi possível processar o vídeo neste dispositivo");
  }

  // Só começa a gravar quando o vídeo realmente está rolando, para que o
  // relógio do áudio e o do vídeo partam do mesmo instante.
  await new Promise<void>((res) => {
    if (src.readyState >= 2 && !src.paused && src.currentTime > from) return res();
    const on = () => { src.removeEventListener("timeupdate", on); res(); };
    src.addEventListener("timeupdate", on);
    setTimeout(res, 500);
  });

  startDrawLoop();
  rec.start(200);


  await new Promise<void>((res) => {
    const check = () => {
      if (src.currentTime >= to || src.ended) return res();
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });

  src.pause();
  musicEl?.pause();
  stopDrawLoop();
  rec.stop();

  const blob = await done;
  try {
    await audioCtx?.close();
  } catch {
    /* noop */
  }
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  return { blob, ext };
}
