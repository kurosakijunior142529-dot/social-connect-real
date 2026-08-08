/**
 * Client-side video export: trim, filter, mute and (optional) vertical crop.
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

export type ExportOptions = {
  /** css filter string, e.g. "saturate(1.2)" */
  filterCss?: string;
  from?: number;
  to?: number;
  muted?: boolean;
  /** "original" keeps source ratio, "vertical" crops to 9:16 */
  aspect?: "original" | "vertical";
  onProgress?: (p: number) => void;
};

export function needsReencode(opts: ExportOptions, duration: number): boolean {
  const from = opts.from ?? 0;
  const to = opts.to ?? duration;
  if (opts.filterCss && opts.filterCss !== "none") return true;
  if (opts.muted) return true;
  if (opts.aspect === "vertical") return true;
  if (duration > 0 && (from > 0.05 || to < duration - 0.05)) return true;
  return false;
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

export async function exportVideo(
  srcUrl: string,
  opts: ExportOptions = {},
): Promise<{ blob: Blob; ext: string }> {
  const { filterCss = "none", muted = false, aspect = "original", onProgress } = opts;

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

  const canvasStream = canvas.captureStream(30);
  if (!muted) {
    try {
      const ms = (src as any).captureStream?.() as MediaStream | undefined;
      ms?.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
    } catch (err) {
      console.warn("[video-export] audio capture unavailable", err);
    }
  }

  const mime = pickVideoMime();
  const rec = mime
    ? new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 })
    : new MediaRecorder(canvasStream, { audioBitsPerSecond: 128_000 });
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

  let raf = 0;
  const draw = () => {
    ctx.save();
    (ctx as any).filter = filterCss || "none";
    ctx.drawImage(src, dx, dy, dw, dh);
    ctx.restore();
    onProgress?.(Math.min(1, (src.currentTime - from) / total));
    raf = requestAnimationFrame(draw);
  };

  const done = new Promise<Blob>((res) => {
    rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
  });

  rec.start(200);
  raf = requestAnimationFrame(draw);
  try {
    await src.play();
  } catch (err) {
    cancelAnimationFrame(raf);
    rec.stop();
    throw new Error("Não foi possível processar o vídeo neste dispositivo");
  }

  await new Promise<void>((res) => {
    const check = () => {
      if (src.currentTime >= to || src.ended) return res();
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });

  src.pause();
  cancelAnimationFrame(raf);
  rec.stop();
  const blob = await done;
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  return { blob, ext };
}
