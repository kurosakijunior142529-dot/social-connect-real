/**
 * Client-side upload hygiene. This is a UX convenience only — the real
 * enforcement lives in the backend (moderateMedia + storage policies).
 */

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

const MAGIC: Array<{ mime: string; test: (b: Uint8Array) => boolean }> = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  {
    mime: "image/webp",
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57,
  },
  {
    mime: "video/mp4",
    test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  },
  { mime: "video/webm", test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
];

/** Reads the real magic bytes instead of trusting `file.type`. */
export async function sniffMime(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  for (const m of MAGIC) if (m.test(head)) return m.mime;
  return null;
}

export async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type FileCheck = { ok: true; mime: string } | { ok: false; error: string };

export async function checkFile(file: File): Promise<FileCheck> {
  const real = await sniffMime(file);
  if (!real) return { ok: false, error: "Arquivo não reconhecido ou corrompido" };
  const declared = file.type || real;
  const sameFamily = declared.split("/")[0] === real.split("/")[0];
  if (!sameFamily) return { ok: false, error: "O arquivo não corresponde ao tipo informado" };
  const limit = real.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > limit) {
    return { ok: false, error: `Arquivo maior que ${Math.round(limit / 1024 / 1024)}MB` };
  }
  return { ok: true, mime: real };
}

/** Small JPEG preview (max 512px) used only for moderation classification. */
export async function previewDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.src = url;
      v.muted = true;
      v.playsInline = true;
      await new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error("video"));
      });
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
      await new Promise<void>((res) => { v.onseeked = () => res(); });
      return draw(v, v.videoWidth, v.videoHeight);
    }
    const img = new Image();
    img.src = url;
    await img.decode();
    return draw(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function draw(src: CanvasImageSource, w: number, h: number) {
  const scale = Math.min(1, 512 / Math.max(w || 1, h || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((w || 512) * scale));
  canvas.height = Math.max(1, Math.round((h || 512) * scale));
  canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}
