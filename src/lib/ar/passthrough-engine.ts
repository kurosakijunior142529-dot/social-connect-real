import { RenderedRecorder, canvasToBlob } from "./recorder";
import {
  ArEngineError,
  type ArEffect,
  type ArRecording,
  type ArStartOptions,
  type EffectEngine,
} from "./types";

/**
 * Motor de reserva: mostra a câmera crua (efeito "Normal") quando o SDK de AR
 * não está configurado ou o aparelho não aguenta. Mantém a mesma interface,
 * então a tela da câmera não precisa saber a diferença.
 */
export class PassthroughEngine implements EffectEngine {
  readonly name = "passthrough";
  readonly supportsLenses = false;

  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private recorder = new RenderedRecorder();
  private outputStream: MediaStream | null = null;
  private mirrored = false;
  private captureFps: 30 | 60 = 30;

  async initialize() {
    if (typeof window === "undefined") {
      throw new ArEngineError("sdk-unavailable", "Câmera indisponível neste ambiente");
    }
  }

  async startCamera(options: ArStartOptions) {
    await this.initialize();
    this.stopCamera();
    const width = options.width ?? 1280;
    const height = options.height ?? 720;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: options.facing,
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: options.fps, max: options.fps },
        },
        audio:
          options.audio === false
            ? false
            : { echoCancellation: true, noiseSuppression: true, sampleRate: 48000, channelCount: 1 },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new ArEngineError("permission-denied", "Permissão de câmera negada");
      }
      throw new ArEngineError("camera-unavailable", "Não foi possível acessar a câmera");
    }

    // Espelhamento é só de exibição (CSS) — o arquivo gravado precisa sair
    // com a imagem real, senão textos aparecem invertidos no vídeo publicado.
    this.mirrored = options.facing === "user";
    this.captureFps = options.fps;
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = this.stream;
    await video.play().catch(() => {});
    this.video = video;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    this.canvas = canvas;

    const ctx = canvas.getContext("2d");
    const draw = () => {
      this.raf = requestAnimationFrame(draw);
      if (!ctx || !this.video || this.video.readyState < 2) return;
      const vw = this.video.videoWidth || width;
      const vh = this.video.videoHeight || height;
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width = vw;
        canvas.height = vh;
      }
      ctx.save();
      if (this.mirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };
    draw();
  }

  stopCamera() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.outputStream = null;
  }

  async loadEffect(_effect: ArEffect) {
    /* sem lentes: o efeito "Normal" é o único suportado */
  }

  async unloadEffect() {
    /* noop */
  }

  async switchEffect(_effect: ArEffect) {
    /* noop */
  }

  getOutputCanvas() {
    return this.canvas;
  }

  getOutputStream(fps = 30) {
    if (!this.canvas) return null;
    if (!this.outputStream) {
      const out = this.canvas.captureStream(fps);
      this.stream?.getAudioTracks().forEach((t) => out.addTrack(t));
      this.outputStream = out;
    }
    return this.outputStream;
  }

  async capturePhoto() {
    if (!this.canvas) throw new ArEngineError("camera-unavailable", "Câmera não está ativa");
    return canvasToBlob(this.canvas);
  }

  async startRecording() {
    const stream = this.getOutputStream(30);
    if (!stream) throw new ArEngineError("camera-unavailable", "Câmera não está ativa");
    this.recorder.start(stream);
  }

  stopRecording(): Promise<ArRecording> {
    return this.recorder.stop();
  }

  dispose() {
    this.recorder.dispose();
    this.stopCamera();
    this.canvas = null;
  }
}
