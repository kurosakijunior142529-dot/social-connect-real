/**
 * Tipos compartilhados do sistema de efeitos AR do Vibely.
 * Nenhum tipo aqui depende de um SDK específico — é a linguagem comum
 * entre a interface da câmera e a implementação do motor de efeitos.
 */

export const AR_CATEGORIES = [
  "populares",
  "novos",
  "rosto",
  "maquiagem",
  "engracados",
  "mascaras",
  "animais",
  "3d",
  "ambiente",
  "particulas",
  "corpo",
  "maos",
  "tendencia",
] as const;

export type ArCategory = (typeof AR_CATEGORIES)[number];

export const AR_CATEGORY_LABELS: Record<ArCategory, string> = {
  populares: "Populares",
  novos: "Novos",
  rosto: "Rosto",
  maquiagem: "Maquiagem",
  engracados: "Engraçados",
  mascaras: "Máscaras",
  animais: "Animais",
  "3d": "3D",
  ambiente: "Ambiente",
  particulas: "Partículas",
  corpo: "Corpo",
  maos: "Mãos",
  tendencia: "Tendência",
};

/** Um efeito do catálogo. `lensId` vazio = efeito "Normal" (sem lente). */
export type ArEffect = {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  category: ArCategory;
  lensId: string;
  lensGroupId: string | null;
  version: number;
  sortOrder: number;
  usageCount: number;
};

export const NORMAL_EFFECT: ArEffect = {
  id: "normal",
  name: "Normal",
  thumbnailUrl: null,
  category: "populares",
  lensId: "",
  lensGroupId: null,
  version: 1,
  sortOrder: -1,
  usageCount: 0,
};

export type ArEngineStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "loading-effect"
  | "recording"
  | "error";

export type ArEngineErrorKind =
  | "sdk-unavailable"
  | "sdk-not-configured"
  | "permission-denied"
  | "camera-unavailable"
  | "effect-incompatible"
  | "device-incompatible"
  | "unknown";

export class ArEngineError extends Error {
  kind: ArEngineErrorKind;
  constructor(kind: ArEngineErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "ArEngineError";
  }
}

export type CameraFacing = "user" | "environment";

export type ArStartOptions = {
  facing: CameraFacing;
  fps: 30 | 60;
  width?: number;
  height?: number;
  audio?: boolean;
};

export type ArRecording = { blob: Blob; duration: number; mimeType: string };

/**
 * Camada de abstração: o resto do Vibely fala apenas com esta interface,
 * de modo que o SDK por trás (Snap Camera Kit hoje) possa ser trocado.
 */
export interface EffectEngine {
  readonly name: string;
  /** true quando o motor consegue aplicar lentes de verdade (rastreamento). */
  readonly supportsLenses: boolean;
  initialize(): Promise<void>;
  startCamera(options: ArStartOptions): Promise<void>;
  stopCamera(): void;
  loadEffect(effect: ArEffect): Promise<void>;
  unloadEffect(): Promise<void>;
  switchEffect(effect: ArEffect): Promise<void>;
  capturePhoto(): Promise<Blob>;
  startRecording(): Promise<void>;
  stopRecording(): Promise<ArRecording>;
  /** Canvas com o resultado já renderizado (preview, gravação e live). */
  getOutputCanvas(): HTMLCanvasElement | null;
  /** true quando o preview deve ser espelhado só na exibição (câmera frontal). */
  isPreviewMirrored(): boolean;
  /** Fluxo renderizado — usado para gravação e para publicar na live. */
  getOutputStream(fps?: number): MediaStream | null;
  dispose(): void;
}
