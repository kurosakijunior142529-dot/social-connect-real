export type VideoFilter = {
  id: string;
  label: string;
  /** CSS filter string, also used by canvas ctx.filter */
  css: string;
};

export const VIDEO_FILTERS: VideoFilter[] = [
  { id: "none", label: "Original", css: "none" },
  { id: "glow", label: "Glow", css: "brightness(1.1) saturate(1.35) contrast(1.05)" },
  { id: "vivid", label: "Vívido", css: "saturate(1.6) contrast(1.15)" },
  { id: "warm", label: "Calor", css: "sepia(0.35) saturate(1.3) hue-rotate(-8deg) brightness(1.05)" },
  { id: "cold", label: "Frio", css: "hue-rotate(200deg) saturate(1.2) brightness(0.98)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.55) contrast(0.95) brightness(0.95) saturate(0.9)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.35) brightness(0.95)" },
  { id: "dream", label: "Sonho", css: "blur(0.6px) brightness(1.1) saturate(1.25) contrast(0.95)" },
  { id: "vhs", label: "VHS", css: "saturate(1.35) contrast(1.1) hue-rotate(-15deg) brightness(1.05)" },
  { id: "sunset", label: "Sunset", css: "hue-rotate(340deg) saturate(1.5) brightness(1.1) contrast(1.05)" },
];

export function filterById(id: string): VideoFilter {
  return VIDEO_FILTERS.find((f) => f.id === id) ?? VIDEO_FILTERS[0];
}
