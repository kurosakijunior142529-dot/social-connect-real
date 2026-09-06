/**
 * Vibely Studio — modelo de projeto.
 * Um projeto é uma sequência de clipes de mídia (vídeo/foto) mais faixas
 * absolutas de texto, stickers, overlays e áudio. Tudo é serializável:
 * os rascunhos guardam este objeto e os blobs vão para o IndexedDB.
 */

export type AspectId = "9:16" | "16:9" | "1:1" | "4:5" | "4:3" | "3:4";

export const ASPECTS: { id: AspectId; label: string; ratio: number }[] = [
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
];

export const ASPECT_PRESETS: { id: string; label: string; aspect: AspectId }[] = [
  { id: "vibely", label: "Vibely", aspect: "9:16" },
  { id: "tiktok", label: "TikTok", aspect: "9:16" },
  { id: "instagram", label: "Instagram", aspect: "4:5" },
  { id: "story", label: "Story", aspect: "9:16" },
  { id: "youtube", label: "YouTube", aspect: "16:9" },
];

export type AnimProp = "x" | "y" | "scale" | "rotate" | "opacity" | "blur";

export const ANIM_PROPS: { id: AnimProp; label: string; min: number; max: number; def: number; unit?: string }[] = [
  { id: "x", label: "Posição X", min: -100, max: 100, def: 0, unit: "%" },
  { id: "y", label: "Posição Y", min: -100, max: 100, def: 0, unit: "%" },
  { id: "scale", label: "Escala", min: 25, max: 400, def: 100, unit: "%" },
  { id: "rotate", label: "Rotação", min: -180, max: 180, def: 0, unit: "°" },
  { id: "opacity", label: "Opacidade", min: 0, max: 100, def: 100, unit: "%" },
  { id: "blur", label: "Blur", min: 0, max: 30, def: 0, unit: "px" },
];

export type Keyframe = { t: number; v: number };

export type Adjust = {
  brightness: number; // -100..100
  contrast: number;
  exposure: number;
  saturation: number;
  temperature: number;
  hue: number;
  highlights: number;
  shadows: number;
  sharpen: number;
  clarity: number;
  fade: number;
  vignette: number;
  grain: number;
  /** curva de cor: 3 pontos (sombras, médios, luzes) -100..100 */
  curve: [number, number, number];
};

export const NEUTRAL_ADJUST: Adjust = {
  brightness: 0,
  contrast: 0,
  exposure: 0,
  saturation: 0,
  temperature: 0,
  hue: 0,
  highlights: 0,
  shadows: 0,
  sharpen: 0,
  clarity: 0,
  fade: 0,
  vignette: 0,
  grain: 0,
  curve: [0, 0, 0],
};

export type BeautyState = {
  smooth: number; // 0..100 suavização de pele
  faceLight: number; // 0..100 iluminação facial
  glow: number; // 0..100
  warmth: number; // -100..100
  slim: number; // 0..100 deformação (afinar)
  eyes: number; // 0..100 ampliar olhos / clarear
};

export const NEUTRAL_BEAUTY: BeautyState = {
  smooth: 0,
  faceLight: 0,
  glow: 0,
  warmth: 0,
  slim: 0,
  eyes: 0,
};

export type EffectInstance = {
  id: string;
  effectId: string;
  intensity: number; // 0..100
  speed: number; // 0..200 (100 = normal)
  opacity: number; // 0..100
  /** relativo ao início do clipe; null = clipe inteiro */
  from: number | null;
  to: number | null;
};

export type MaskShape = "none" | "circle" | "rect" | "gradient" | "free";

export type Mask = {
  shape: MaskShape;
  x: number; // 0..100 centro
  y: number;
  size: number; // 0..100
  feather: number; // 0..100
  invert: boolean;
  /** pontos da forma livre em % */
  points: { x: number; y: number }[];
};

export const NEUTRAL_MASK: Mask = {
  shape: "none",
  x: 50,
  y: 50,
  size: 60,
  feather: 30,
  invert: false,
  points: [],
};

export type SpeedPoint = { t: number; v: number };

export type BaseClip = {
  id: string;
  hidden?: boolean;
  locked?: boolean;
  keyframes?: Partial<Record<AnimProp, Keyframe[]>>;
};

export type MediaClip = BaseClip & {
  kind: "media";
  mediaId: string;
  mediaKind: "video" | "image";
  /** corte da fonte, em segundos (imagem usa 0..stillDuration) */
  trimStart: number;
  trimEnd: number;
  speed: number; // 0.25..4
  ramp: SpeedPoint[]; // vazio = velocidade constante
  filterId: string;
  filterAmount: number; // 0..100
  adjust: Adjust;
  beauty: BeautyState;
  effects: EffectInstance[];
  mask: Mask;
  transitionIn: { id: string; dur: number } | null;
  volume: number; // 0..100
  muted: boolean;
  /** processamento de IA aplicado (data URL) que substitui a fonte */
  aiMediaId?: string | null;
};

export type TextAnim =
  | "none"
  | "fade"
  | "zoom"
  | "slide"
  | "bounce"
  | "typewriter"
  | "glitch"
  | "pop"
  | "shake";

export type TextClip = BaseClip & {
  kind: "text";
  text: string;
  from: number;
  to: number;
  font: string;
  size: number; // % da altura
  color: string;
  stroke: string;
  strokeWidth: number;
  shadow: number;
  bg: string | null;
  align: "left" | "center" | "right";
  rotation: number;
  opacity: number;
  letterSpacing: number;
  anim: TextAnim;
  x: number; // 0..100
  y: number;
};

export type StickerClip = BaseClip & {
  kind: "sticker";
  content: string; // emoji ou data URL
  from: number;
  to: number;
  x: number;
  y: number;
  size: number; // % da altura
  rotation: number;
  opacity: number;
  anim: TextAnim;
};

export type OverlayClip = BaseClip & {
  kind: "overlay";
  overlayId: string;
  from: number;
  to: number;
  opacity: number;
  blend: GlobalCompositeOperation;
  scale: number;
  x: number;
  y: number;
};

export type AudioRole = "music" | "voice" | "sfx";

export type AudioClip = BaseClip & {
  kind: "audio";
  role: AudioRole;
  mediaId: string;
  name: string;
  from: number;
  to: number;
  offset: number; // início dentro da fonte
  volume: number; // 0..100
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
};

export type Clip = MediaClip | TextClip | StickerClip | OverlayClip | AudioClip;

export type StudioProject = {
  id: string;
  name: string;
  aspect: AspectId;
  clips: Clip[];
  /** batidas detectadas da faixa musical, em segundos da timeline */
  beats: number[];
  bpm: number | null;
  originalVolume: number;
  createdAt: number;
  updatedAt: number;
};

export type StudioPreset = {
  id: string;
  name: string;
  filterId: string;
  filterAmount: number;
  adjust: Adjust;
  beauty: BeautyState;
  effects: EffectInstance[];
  transitionId: string | null;
  speed: number;
};

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const STILL_DURATION = 4;

export function emptyProject(name = "Novo projeto"): StudioProject {
  const now = Date.now();
  return {
    id: uid(),
    name,
    aspect: "9:16",
    clips: [],
    beats: [],
    bpm: null,
    originalVolume: 100,
    createdAt: now,
    updatedAt: now,
  };
}

export function newMediaClip(mediaId: string, mediaKind: "video" | "image", duration: number): MediaClip {
  return {
    id: uid(),
    kind: "media",
    mediaId,
    mediaKind,
    trimStart: 0,
    trimEnd: mediaKind === "image" ? STILL_DURATION : duration,
    speed: 1,
    ramp: [],
    filterId: "none",
    filterAmount: 100,
    adjust: { ...NEUTRAL_ADJUST, curve: [0, 0, 0] },
    beauty: { ...NEUTRAL_BEAUTY },
    effects: [],
    mask: { ...NEUTRAL_MASK, points: [] },
    transitionIn: null,
    volume: 100,
    muted: false,
  };
}
