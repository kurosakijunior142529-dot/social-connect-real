/**
 * Catálogo dos modelos de vídeo do Vibely AI.
 *
 * Só entram aqui parâmetros que o modelo/API realmente aceita — a interface
 * monta as opções a partir deste arquivo, então nada de opção decorativa.
 *
 * Custos (definidos pelo dono do app):
 * - Vídeo: preço fixo por geração (VIDEO_COST_CREDITS), qualquer modelo/duração.
 * - Imagem: as primeiras FREE_IMAGES do usuário são grátis; depois cobra IMAGE_COST_CREDITS.
 */

export type VideoModelId = "veo-3.1" | "seedance-2.5";

export type VideoCaps = {
  id: VideoModelId;
  label: string;
  emoji: string;
  tagline: string;
  /** Modelo real usado no backend. */
  backendModel: string;
  aspectRatios: string[];
  resolutions: string[];
  durations: number[];
  /** Durações permitidas por resolução (quando a API restringe). */
  durationsByResolution?: Record<string, number[]>;
  audio: boolean;
  imageReference: boolean;
  negativePrompt: boolean;
  /** Precisa de credencial extra do dono do app. */
  requiresSecret?: string;
};

export const VIDEO_MODELS: Record<VideoModelId, VideoCaps> = {
  "veo-3.1": {
    id: "veo-3.1",
    label: "Veo 3.1",
    emoji: "🎥",
    tagline: "Vídeo realista, ótima compreensão do texto e áudio gerado.",
    backendModel: "google/veo-3.1-fast",
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["720p", "1080p"],
    durations: [4, 6, 8],
    durationsByResolution: { "720p": [4, 6, 8], "1080p": [8] },
    audio: true,
    imageReference: true,
    negativePrompt: true,
  },
  "seedance-2.5": {
    id: "seedance-2.5",
    label: "Seedance 2.5",
    emoji: "🎬",
    tagline: "Vídeo multimodal, narrativa e controle por referências.",
    backendModel: "seedance-2-5-pro",
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p", "1080p"],
    durations: [5, 10],
    audio: true,
    imageReference: true,
    negativePrompt: false,
    requiresSecret: "BYTEPLUS_ARK_API_KEY",
  },
};

export const VIDEO_MODEL_LIST = Object.values(VIDEO_MODELS);

/** Presets de estilo — viram texto no prompt, nunca parâmetro inventado na API. */
export const VIDEO_STYLES = [
  { id: "cinematic", label: "Cinematográfico", hint: "cinematic lighting, shallow depth of field, film grain, smooth camera move" },
  { id: "realistic", label: "Realista", hint: "photorealistic, natural lighting, true-to-life textures" },
  { id: "animation", label: "Animação", hint: "stylized animation, vibrant colors, expressive motion" },
  { id: "dynamic", label: "Dinâmico", hint: "fast dynamic camera, energetic motion, punchy transitions" },
  { id: "smooth", label: "Suave", hint: "slow motion, gentle camera glide, soft light" },
] as const;

export type VideoStyleId = (typeof VIDEO_STYLES)[number]["id"];

/** Preço fixo por vídeo gerado. */
export const VIDEO_COST_CREDITS = 500;
/** Imagens gratuitas por usuário (contadas do total gerado). */
export const FREE_IMAGES = 15;
/** Custo por imagem depois das gratuitas. */
export const IMAGE_COST_CREDITS = 20;

export function allowedDurations(caps: VideoCaps, resolution: string) {
  return caps.durationsByResolution?.[resolution] ?? caps.durations;
}
