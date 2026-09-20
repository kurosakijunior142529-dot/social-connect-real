import { RenderedRecorder, canvasToBlob } from "./recorder";
import {
  ArEngineError,
  type ArEffect,
  type ArRecording,
  type ArStartOptions,
  type EffectEngine,
} from "./types";

type Lens = { id: string; groupId: string };

/**
 * Implementação real de AR com o Snap Camera Kit (versão web/WebGL).
 * O rastreamento de rosto, mãos, corpo e ambiente, os objetos 3D e as
 * partículas são executados pelo SDK — nada é simulado em CSS.
 *
 * Requer configuração externa (ver src/lib/ar/catalog.functions.ts):
 *  - CAMERA_KIT_API_TOKEN  (token do portal de desenvolvedores da Snap)
 *  - CAMERA_KIT_LENS_GROUPS (IDs de grupos de Lentes, separados por vírgula)
 */
export class CameraKitEngine implements EffectEngine {
  readonly name = "camera-kit";
  readonly supportsLenses = true;

  private apiToken: string;
  private lensGroups: string[];

  private kit: any = null;
  private session: any = null;
  private source: any = null;
  private stream: MediaStream | null = null;
  private lensCache = new Map<string, any>();
  private currentLensId: string | null = null;
  private recorder = new RenderedRecorder();
  private outputStream: MediaStream | null = null;

  constructor(apiToken: string, lensGroups: string[]) {
    this.apiToken = apiToken;
    this.lensGroups = lensGroups;
  }

  async initialize() {
    if (this.kit) return;
    if (typeof window === "undefined") {
      throw new ArEngineError("sdk-unavailable", "SDK indisponível neste ambiente");
    }
    if (!this.apiToken) {
      throw new ArEngineError("sdk-not-configured", "Camera Kit sem token configurado");
    }
    // Carregamento sob demanda: o SDK (WebGL/WASM) só entra na memória
    // quando a câmera com efeitos é realmente aberta.
    const mod = await import("@snap/camera-kit").catch(() => null);
    if (!mod) throw new ArEngineError("sdk-unavailable", "Não foi possível carregar o SDK de AR");
    try {
      this.kit = await mod.bootstrapCameraKit({ apiToken: this.apiToken });
    } catch {
      throw new ArEngineError("device-incompatible", "Seu aparelho não suporta os efeitos AR");
    }
  }

  async startCamera(options: ArStartOptions) {
    await this.initialize();
    const mod = await import("@snap/camera-kit");
    this.stopCamera();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: options.facing,
          width: { ideal: options.width ?? 1280 },
          height: { ideal: options.height ?? 720 },
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

    if (!this.session) {
      this.session = await this.kit.createSession();
      this.session.events?.addEventListener?.("error", () => {
        /* erros de lente são tratados na troca de efeito */
      });
    }

    this.source = mod.createMediaStreamSource(this.stream, {
      cameraType: options.facing,
      transform: options.facing === "user" ? mod.Transform2D.MirrorX : undefined,
      disableSourceAudio: true,
    });
    await this.session.setSource(this.source);
    await this.source.setRenderSize(options.width ?? 1280, options.height ?? 720);
    await this.session.play("live");
    this.outputStream = null;
  }

  stopCamera() {
    try {
      this.session?.pause?.();
    } catch {
      /* noop */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source = null;
    this.outputStream = null;
  }

  private async resolveLens(effect: ArEffect): Promise<any> {
    const cached = this.lensCache.get(effect.lensId);
    if (cached) return cached;
    const groups = effect.lensGroupId ? [effect.lensGroupId] : this.lensGroups;
    if (!groups.length) {
      throw new ArEngineError("sdk-not-configured", "Nenhum grupo de Lentes configurado");
    }
    let lens: Lens | null = null;
    for (const groupId of groups) {
      lens = await this.kit.lensRepository
        .loadLens(effect.lensId, groupId)
        .catch(() => null);
      if (lens) break;
    }
    if (!lens) throw new ArEngineError("effect-incompatible", "Efeito indisponível");
    this.lensCache.set(effect.lensId, lens);
    // Cache enxuto: mantém apenas as últimas lentes usadas na memória.
    if (this.lensCache.size > 6) {
      const oldest = this.lensCache.keys().next().value as string | undefined;
      if (oldest && oldest !== effect.lensId) this.lensCache.delete(oldest);
    }
    return lens;
  }

  async loadEffect(effect: ArEffect) {
    if (!this.session) throw new ArEngineError("camera-unavailable", "Câmera não está ativa");
    if (!effect.lensId) return this.unloadEffect();
    const lens = await this.resolveLens(effect);
    await this.session.applyLens(lens);
    this.currentLensId = effect.lensId;
  }

  async unloadEffect() {
    if (!this.session || !this.currentLensId) return;
    await this.session.removeLens().catch(() => {});
    this.currentLensId = null;
  }

  /** Troca sem reiniciar a câmera: a sessão segue rodando com a mesma fonte. */
  async switchEffect(effect: ArEffect) {
    if (!effect.lensId) return this.unloadEffect();
    await this.loadEffect(effect);
  }

  getOutputCanvas(): HTMLCanvasElement | null {
    return (this.session?.output?.live as HTMLCanvasElement | undefined) ?? null;
  }

  getOutputStream(fps = 30) {
    const canvas = this.getOutputCanvas();
    if (!canvas) return null;
    if (!this.outputStream) {
      const out = canvas.captureStream(fps);
      this.stream?.getAudioTracks().forEach((t) => out.addTrack(t));
      this.outputStream = out;
    }
    return this.outputStream;
  }

  async capturePhoto() {
    const canvas = this.getOutputCanvas();
    if (!canvas) throw new ArEngineError("camera-unavailable", "Câmera não está ativa");
    return canvasToBlob(canvas);
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
    try {
      this.session?.destroy?.();
    } catch {
      /* noop */
    }
    this.session = null;
    this.lensCache.clear();
    this.currentLensId = null;
    this.kit = null;
  }
}
