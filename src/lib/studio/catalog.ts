/** Catálogo do Vibely Studio: filtros, efeitos, transições, overlays, fontes e stickers. */

export type FilterDef = {
  id: string;
  label: string;
  category: string;
  css: string;
};

export const FILTER_CATEGORIES = [
  "Cinematic",
  "Film",
  "Vintage",
  "Retro",
  "Neon",
  "Cyber",
  "Dark",
  "Dream",
  "Portrait",
  "Street",
  "Travel",
  "Night",
  "Warm",
  "Cold",
  "P&B",
  "Vibrant",
] as const;

export const FILTERS: FilterDef[] = [
  { id: "none", label: "Original", category: "Cinematic", css: "none" },
  // Cinematic
  { id: "cine-teal", label: "Teal & Orange", category: "Cinematic", css: "contrast(1.18) saturate(1.15) hue-rotate(-6deg) brightness(0.98)" },
  { id: "cine-flat", label: "Flat Log", category: "Cinematic", css: "contrast(0.85) saturate(0.85) brightness(1.06)" },
  { id: "cine-noir", label: "Noir Cine", category: "Cinematic", css: "grayscale(0.85) contrast(1.3) brightness(0.92)" },
  { id: "cine-blockbuster", label: "Blockbuster", category: "Cinematic", css: "contrast(1.25) saturate(1.25) brightness(1.02) hue-rotate(4deg)" },
  // Film
  { id: "film-kodak", label: "Kodak", category: "Film", css: "sepia(0.18) saturate(1.25) contrast(1.08) brightness(1.03)" },
  { id: "film-fuji", label: "Fuji", category: "Film", css: "saturate(1.1) hue-rotate(-8deg) contrast(1.05)" },
  { id: "film-portra", label: "Portra", category: "Film", css: "sepia(0.12) saturate(0.95) brightness(1.06) contrast(0.98)" },
  { id: "film-grainy", label: "Super 8", category: "Film", css: "sepia(0.3) contrast(1.12) saturate(0.9) brightness(1.02)" },
  // Vintage
  { id: "vintage-70", label: "70s", category: "Vintage", css: "sepia(0.45) saturate(1.2) contrast(0.95) brightness(1.04)" },
  { id: "vintage-fade", label: "Fade", category: "Vintage", css: "sepia(0.25) contrast(0.82) brightness(1.12) saturate(0.85)" },
  { id: "vintage-polaroid", label: "Polaroid", category: "Vintage", css: "sepia(0.35) brightness(1.08) contrast(0.9) saturate(1.05)" },
  // Retro
  { id: "retro-vhs", label: "VHS", category: "Retro", css: "saturate(1.4) contrast(1.1) hue-rotate(-14deg) brightness(1.05)" },
  { id: "retro-arcade", label: "Arcade", category: "Retro", css: "saturate(1.6) contrast(1.2) hue-rotate(15deg)" },
  // Neon
  { id: "neon-lime", label: "Neon Lime", category: "Neon", css: "saturate(1.7) contrast(1.15) hue-rotate(70deg) brightness(1.05)" },
  { id: "neon-pink", label: "Neon Pink", category: "Neon", css: "saturate(1.8) hue-rotate(-40deg) contrast(1.12)" },
  { id: "neon-glow", label: "Glow", category: "Neon", css: "brightness(1.15) saturate(1.45) contrast(1.05)" },
  // Cyber
  { id: "cyber-blue", label: "Cyber Blue", category: "Cyber", css: "hue-rotate(190deg) saturate(1.5) contrast(1.2) brightness(0.98)" },
  { id: "cyber-matrix", label: "Matrix", category: "Cyber", css: "hue-rotate(90deg) saturate(1.4) contrast(1.25) brightness(0.95)" },
  // Dark
  { id: "dark-moody", label: "Moody", category: "Dark", css: "brightness(0.85) contrast(1.25) saturate(0.9)" },
  { id: "dark-shadow", label: "Shadow", category: "Dark", css: "brightness(0.78) contrast(1.35) saturate(0.8)" },
  // Dream
  { id: "dream-soft", label: "Sonho", category: "Dream", css: "blur(0.7px) brightness(1.12) saturate(1.2) contrast(0.95)" },
  { id: "dream-pastel", label: "Pastel", category: "Dream", css: "saturate(0.8) brightness(1.15) contrast(0.9) sepia(0.1)" },
  // Portrait
  { id: "portrait-soft", label: "Suave", category: "Portrait", css: "brightness(1.08) contrast(0.97) saturate(1.05)" },
  { id: "portrait-glam", label: "Glam", category: "Portrait", css: "brightness(1.12) contrast(1.08) saturate(1.15) sepia(0.08)" },
  // Street
  { id: "street-raw", label: "Raw", category: "Street", css: "contrast(1.3) saturate(0.95) brightness(0.98)" },
  { id: "street-urban", label: "Urbano", category: "Street", css: "contrast(1.2) saturate(1.1) hue-rotate(-5deg)" },
  // Travel
  { id: "travel-sun", label: "Sunny", category: "Travel", css: "brightness(1.1) saturate(1.35) contrast(1.05)" },
  { id: "travel-ocean", label: "Ocean", category: "Travel", css: "hue-rotate(170deg) saturate(1.25) brightness(1.03)" },
  // Night
  { id: "night-city", label: "City Night", category: "Night", css: "brightness(0.92) contrast(1.25) saturate(1.3) hue-rotate(200deg)" },
  { id: "night-lift", label: "Night Lift", category: "Night", css: "brightness(1.2) contrast(1.1) saturate(1.1)" },
  // Warm / Cold
  { id: "warm-gold", label: "Gold", category: "Warm", css: "sepia(0.3) saturate(1.3) brightness(1.06) hue-rotate(-10deg)" },
  { id: "warm-sunset", label: "Sunset", category: "Warm", css: "hue-rotate(340deg) saturate(1.5) brightness(1.08)" },
  { id: "cold-ice", label: "Ice", category: "Cold", css: "hue-rotate(200deg) saturate(1.1) brightness(1.04)" },
  { id: "cold-steel", label: "Steel", category: "Cold", css: "hue-rotate(210deg) saturate(0.8) contrast(1.15)" },
  // P&B
  { id: "bw-classic", label: "Clássico", category: "P&B", css: "grayscale(1) contrast(1.2)" },
  { id: "bw-high", label: "Alto contraste", category: "P&B", css: "grayscale(1) contrast(1.6) brightness(0.95)" },
  { id: "bw-soft", label: "P&B Suave", category: "P&B", css: "grayscale(1) contrast(0.95) brightness(1.08)" },
  // Vibrant
  { id: "vib-pop", label: "Pop", category: "Vibrant", css: "saturate(1.7) contrast(1.15)" },
  { id: "vib-hdr", label: "HDR", category: "Vibrant", css: "saturate(1.45) contrast(1.3) brightness(1.05)" },
];

export const filterById = (id: string) => FILTERS.find((f) => f.id === id) ?? FILTERS[0]!;

export type EffectCategory =
  | "Glitch"
  | "Câmera"
  | "Luz"
  | "Blur"
  | "Cor"
  | "Distorção"
  | "Atmosfera";

export type EffectDef = {
  id: string;
  label: string;
  category: EffectCategory;
  /** parâmetros que o efeito realmente usa */
  params: ("intensity" | "speed" | "opacity")[];
};

export const EFFECTS: EffectDef[] = [
  // Glitch
  { id: "rgb-split", label: "RGB Split", category: "Glitch", params: ["intensity", "speed", "opacity"] },
  { id: "digital-glitch", label: "Digital Glitch", category: "Glitch", params: ["intensity", "speed", "opacity"] },
  { id: "vhs", label: "VHS", category: "Glitch", params: ["intensity", "speed", "opacity"] },
  { id: "scanline", label: "Scanline", category: "Glitch", params: ["intensity", "speed", "opacity"] },
  { id: "distortion", label: "Distortion", category: "Glitch", params: ["intensity", "speed"] },
  { id: "pixel", label: "Pixel", category: "Glitch", params: ["intensity"] },
  { id: "signal", label: "Signal Loss", category: "Glitch", params: ["intensity", "speed", "opacity"] },
  // Câmera
  { id: "shake", label: "Shake", category: "Câmera", params: ["intensity", "speed"] },
  { id: "handheld", label: "Handheld", category: "Câmera", params: ["intensity", "speed"] },
  { id: "zoom-pulse", label: "Zoom Pulse", category: "Câmera", params: ["intensity", "speed"] },
  { id: "push-in", label: "Push In", category: "Câmera", params: ["intensity"] },
  { id: "pull-out", label: "Pull Out", category: "Câmera", params: ["intensity"] },
  { id: "cam-rotate", label: "Rotação", category: "Câmera", params: ["intensity", "speed"] },
  { id: "cam-move", label: "Movimento", category: "Câmera", params: ["intensity", "speed"] },
  // Luz
  { id: "flash", label: "Flash", category: "Luz", params: ["intensity", "speed", "opacity"] },
  { id: "lens-flare", label: "Lens Flare", category: "Luz", params: ["intensity", "speed", "opacity"] },
  { id: "glow", label: "Glow", category: "Luz", params: ["intensity", "opacity"] },
  { id: "light-leak", label: "Light Leak", category: "Luz", params: ["intensity", "speed", "opacity"] },
  { id: "strobe", label: "Strobe", category: "Luz", params: ["intensity", "speed"] },
  { id: "bloom", label: "Bloom", category: "Luz", params: ["intensity", "opacity"] },
  // Blur
  { id: "motion-blur", label: "Motion Blur", category: "Blur", params: ["intensity", "speed"] },
  { id: "radial-blur", label: "Radial Blur", category: "Blur", params: ["intensity"] },
  { id: "gaussian-blur", label: "Gaussian Blur", category: "Blur", params: ["intensity"] },
  { id: "directional-blur", label: "Directional Blur", category: "Blur", params: ["intensity", "speed"] },
  // Cor
  { id: "color-cinematic", label: "Cinematic", category: "Cor", params: ["intensity"] },
  { id: "color-neon", label: "Neon", category: "Cor", params: ["intensity"] },
  { id: "color-cyber", label: "Cyber", category: "Cor", params: ["intensity"] },
  { id: "color-dark", label: "Dark", category: "Cor", params: ["intensity"] },
  { id: "color-vibrant", label: "Vibrant", category: "Cor", params: ["intensity"] },
  { id: "color-mono", label: "Monocromático", category: "Cor", params: ["intensity"] },
  // Distorção
  { id: "wave", label: "Wave", category: "Distorção", params: ["intensity", "speed"] },
  { id: "ripple", label: "Ripple", category: "Distorção", params: ["intensity", "speed"] },
  { id: "swirl", label: "Swirl", category: "Distorção", params: ["intensity", "speed"] },
  { id: "warp", label: "Warp", category: "Distorção", params: ["intensity", "speed"] },
  { id: "fisheye", label: "Fisheye", category: "Distorção", params: ["intensity"] },
  // Atmosfera
  { id: "rain", label: "Chuva", category: "Atmosfera", params: ["intensity", "speed", "opacity"] },
  { id: "snow", label: "Neve", category: "Atmosfera", params: ["intensity", "speed", "opacity"] },
  { id: "smoke", label: "Fumaça", category: "Atmosfera", params: ["intensity", "speed", "opacity"] },
  { id: "dust", label: "Poeira", category: "Atmosfera", params: ["intensity", "speed", "opacity"] },
  { id: "particles", label: "Partículas", category: "Atmosfera", params: ["intensity", "speed", "opacity"] },
  { id: "sparks", label: "Faíscas", category: "Atmosfera", params: ["intensity", "speed", "opacity"] },
  { id: "stars", label: "Estrelas", category: "Atmosfera", params: ["intensity", "speed", "opacity"] },
];

export const effectById = (id: string) => EFFECTS.find((e) => e.id === id) ?? null;

/** Efeitos de beat: efeitos curtos disparados nos marcadores de batida. */
export type BeatEffectDef = {
  id: string;
  label: string;
  /** o que é criado no marcador */
  kind: "effect" | "cut" | "transition" | "zoom";
  effectId?: string;
  transitionId?: string;
  dur: number;
};

export const BEAT_EFFECTS: BeatEffectDef[] = [
  { id: "beat-flash", label: "Beat Flash", kind: "effect", effectId: "flash", dur: 0.18 },
  { id: "beat-zoom", label: "Beat Zoom", kind: "zoom", dur: 0.22 },
  { id: "beat-shake", label: "Beat Shake", kind: "effect", effectId: "shake", dur: 0.24 },
  { id: "beat-blur", label: "Beat Blur", kind: "effect", effectId: "motion-blur", dur: 0.18 },
  { id: "beat-rgb", label: "Beat RGB", kind: "effect", effectId: "rgb-split", dur: 0.2 },
  { id: "beat-glitch", label: "Beat Glitch", kind: "effect", effectId: "digital-glitch", dur: 0.2 },
  { id: "beat-cut", label: "Beat Cut", kind: "cut", dur: 0 },
  { id: "beat-transition", label: "Beat Transition", kind: "transition", transitionId: "flash", dur: 0.3 },
  { id: "beat-rotation", label: "Beat Rotation", kind: "effect", effectId: "cam-rotate", dur: 0.25 },
];

export type TransitionDef = { id: string; label: string };

export const TRANSITIONS: TransitionDef[] = [
  { id: "cut", label: "Cut" },
  { id: "fade", label: "Fade" },
  { id: "blur", label: "Blur" },
  { id: "flash", label: "Flash" },
  { id: "zoom", label: "Zoom" },
  { id: "spin", label: "Spin" },
  { id: "glitch", label: "Glitch" },
  { id: "light", label: "Light" },
  { id: "slide", label: "Slide" },
  { id: "distortion", label: "Distortion" },
  { id: "cube3d", label: "3D" },
];

export type OverlayDef = {
  id: string;
  label: string;
  category: string;
  blend: GlobalCompositeOperation;
};

export const OVERLAYS: OverlayDef[] = [
  { id: "film", label: "Film", category: "film", blend: "overlay" },
  { id: "leak-warm", label: "Light Leak", category: "light leaks", blend: "screen" },
  { id: "leak-cold", label: "Leak Frio", category: "light leaks", blend: "screen" },
  { id: "particles", label: "Partículas", category: "particles", blend: "screen" },
  { id: "dust", label: "Poeira", category: "dust", blend: "screen" },
  { id: "rain", label: "Chuva", category: "rain", blend: "screen" },
  { id: "snow", label: "Neve", category: "snow", blend: "screen" },
  { id: "vhs", label: "VHS", category: "VHS", blend: "overlay" },
  { id: "grain", label: "Grain", category: "grain", blend: "overlay" },
  { id: "glow", label: "Glow", category: "glow", blend: "screen" },
  { id: "cinematic", label: "Cinemascope", category: "cinematic", blend: "source-over" },
];

export const FONTS = [
  { id: "grotesk", label: "Vibely", css: '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif' },
  { id: "sans", label: "Clean", css: '"DM Sans Variable", "DM Sans", system-ui, sans-serif' },
  { id: "jakarta", label: "Soft", css: '"Plus Jakarta Sans Variable", system-ui, sans-serif' },
  { id: "syne", label: "Bold", css: '"Syne", system-ui, sans-serif' },
  { id: "mono", label: "Mono", css: '"Geist Mono", ui-monospace, monospace' },
  { id: "serif", label: "Serif", css: 'Georgia, "Times New Roman", serif' },
];

export const STICKER_PACK = [
  "🔥", "✨", "💚", "😂", "😍", "🥹", "😎", "🤯", "💥", "⚡", "🌟", "🎧",
  "🎬", "📸", "🕹️", "🏆", "💎", "🚀", "🌈", "☁️", "🌙", "☀️", "❤️", "👀",
  "👑", "🎯", "🍀", "🧿", "💫", "🫶", "🤙", "🙌",
];

export const TEXT_ANIMS: { id: string; label: string }[] = [
  { id: "none", label: "Nenhuma" },
  { id: "fade", label: "Fade" },
  { id: "zoom", label: "Zoom" },
  { id: "slide", label: "Slide" },
  { id: "bounce", label: "Bounce" },
  { id: "typewriter", label: "Máquina" },
  { id: "glitch", label: "Glitch" },
  { id: "pop", label: "Pop" },
  { id: "shake", label: "Shake" },
];

export const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
