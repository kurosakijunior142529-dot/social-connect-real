import type { ArRecording } from "./types";

const MIMES = [
  "video/mp4;codecs=avc1.4d002a,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function bestMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

/** Grava um fluxo já renderizado (canvas + áudio) mantendo o efeito na imagem. */
export class RenderedRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private startedAt = 0;

  start(stream: MediaStream) {
    const mimeType = bestMime();
    const rec = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 192_000,
    });
    this.chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.recorder = rec;
    this.startedAt = performance.now();
    rec.start(250);
  }

  get active() {
    return this.recorder?.state === "recording";
  }

  stop(): Promise<ArRecording> {
    const rec = this.recorder;
    if (!rec) return Promise.reject(new Error("Nenhuma gravação em andamento"));
    return new Promise<ArRecording>((resolve) => {
      rec.onstop = () => {
        const mimeType = rec.mimeType || bestMime() || "video/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        const duration = (performance.now() - this.startedAt) / 1000;
        this.chunks = [];
        this.recorder = null;
        resolve({ blob, duration, mimeType });
      };
      rec.stop();
    });
  }

  dispose() {
    try {
      if (this.recorder?.state === "recording") this.recorder.stop();
    } catch {
      /* noop */
    }
    this.recorder = null;
    this.chunks = [];
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar a foto"))),
      "image/jpeg",
      quality,
    );
  });
}
