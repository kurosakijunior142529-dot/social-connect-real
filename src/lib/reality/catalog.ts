/** Estilos de transformação do Vibely Reality. */

export type RealityStyleId =
  | "cinema"
  | "praia"
  | "espaco"
  | "cidade"
  | "festa"
  | "gamer"
  | "escritorio"
  | "universo"
  | "aconchegante"
  | "fantasia"
  | "custom";

export type RealityStyle = {
  id: RealityStyleId;
  emoji: string;
  label: string;
  prompt: string;
};

export const REALITY_STYLES: RealityStyle[] = [
  {
    id: "cinema",
    emoji: "🎬",
    label: "Cinema",
    prompt:
      "Transform this real room into a private cinema: large screen, tiered seating, warm dim lighting, acoustic panels.",
  },
  {
    id: "praia",
    emoji: "🌴",
    label: "Praia",
    prompt:
      "Transform this real place into a calm tropical beach setting with sand, palm trees, ocean horizon and golden hour light.",
  },
  {
    id: "espaco",
    emoji: "🚀",
    label: "Espaço",
    prompt:
      "Transform this real place into a spacecraft interior with panoramic windows showing planets and stars.",
  },
  {
    id: "cidade",
    emoji: "🌃",
    label: "Cidade futurista",
    prompt:
      "Transform this real place into a futuristic city apartment with skyline view, glass, rain and subtle neon reflections.",
  },
  {
    id: "festa",
    emoji: "🎵",
    label: "Festa",
    prompt:
      "Transform this real place into a stylish party venue with DJ setup, colored lighting and a lively atmosphere.",
  },
  {
    id: "gamer",
    emoji: "🎮",
    label: "Sala gamer",
    prompt:
      "Transform this real room into a premium gaming room with ultrawide monitors, RGB accents and modern furniture.",
  },
  {
    id: "escritorio",
    emoji: "🏢",
    label: "Escritório moderno",
    prompt:
      "Transform this real room into a modern minimal office with wood, plants, soft daylight and clean desks.",
  },
  {
    id: "universo",
    emoji: "🌌",
    label: "Universo",
    prompt:
      "Transform this real place into a dreamlike cosmic environment: nebulas, floating light, deep space colors.",
  },
  {
    id: "aconchegante",
    emoji: "🏠",
    label: "Aconchegante",
    prompt:
      "Transform this real room into a cozy hygge space: warm lamps, blankets, wood, soft textures, rainy window.",
  },
  {
    id: "fantasia",
    emoji: "✨",
    label: "Fantasia",
    prompt:
      "Transform this real place into a magical fantasy environment with soft glowing particles and enchanted architecture.",
  },
];

export function styleById(id?: string | null): RealityStyle | undefined {
  return REALITY_STYLES.find((s) => s.id === id);
}

export function styleEmoji(id?: string | null) {
  return styleById(id)?.emoji ?? "✨";
}

export function styleLabel(id?: string | null) {
  return styleById(id)?.label ?? "Personalizada";
}

export const PRIVACY_OPTIONS: { id: RealityPrivacy; label: string; hint: string }[] = [
  { id: "public", label: "Pública", hint: "Aparece em Explorar realidades." },
  { id: "invite", label: "Somente convidados", hint: "Só entra quem receber o link." },
  { id: "friends", label: "Somente amigos", hint: "Quem você segue e te segue de volta." },
];

export type RealityPrivacy = "public" | "invite" | "friends";
