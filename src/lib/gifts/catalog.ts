export type GiftRarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export type GiftMeta = {
  /** Match by lowercased catalog name */
  match: string;
  emoji?: string;
  rarity: GiftRarity;
  particles?: string[];
  /** Animation style shown in fullscreen overlay */
  style: "float" | "burst" | "orbit" | "meteor" | "throne";
  color: string;
};

export const RARITY_STYLE: Record<GiftRarity, { label: string; ring: string; glow: string; text: string }> = {
  common:    { label: "Comum",     ring: "border-white/20",        glow: "0 0 12px rgba(255,255,255,0.15)",   text: "text-white/80" },
  rare:      { label: "Raro",      ring: "border-[#22B8F2]/60",    glow: "0 0 18px rgba(34,184,242,0.5)",     text: "text-[#8BE9FF]" },
  epic:      { label: "Épico",     ring: "border-[#7C3AED]/70",    glow: "0 0 22px rgba(124,58,237,0.6)",     text: "text-[#C9AAFF]" },
  legendary: { label: "Lendário",  ring: "border-[#F7B733]/80",    glow: "0 0 26px rgba(247,183,51,0.7)",     text: "text-[#FFE27A]" },
  mythic:    { label: "Mítico",    ring: "border-[#FF3D8A]/90",    glow: "0 0 32px rgba(255,61,138,0.75)",    text: "text-[#FF9EC7]" },
};

/** Rich metadata layered on top of the DB gift_catalog rows (matched by name lowercased). */
export const GIFT_META: GiftMeta[] = [
  { match: "coração",     emoji: "❤️", rarity: "common",    style: "float",  color: "#FF3D8A", particles: ["❤️","💗","💓"] },
  { match: "rosa",        emoji: "🌹", rarity: "common",    style: "float",  color: "#FF6B9D", particles: ["🌹","🌸","🌷"] },
  { match: "estrela",     emoji: "⭐", rarity: "common",    style: "burst",  color: "#F7B733", particles: ["⭐","✨","🌟"] },
  { match: "foguete",     emoji: "🚀", rarity: "rare",      style: "meteor", color: "#22B8F2", particles: ["🚀","💨","⭐"] },
  { match: "diamante",    emoji: "💎", rarity: "epic",      style: "burst",  color: "#22E0FF", particles: ["💎","✨","💠"] },
  { match: "coroa",       emoji: "👑", rarity: "epic",      style: "orbit",  color: "#F7B733", particles: ["👑","✨","💫"] },
  { match: "leão",        emoji: "🦁", rarity: "rare",      style: "burst",  color: "#F7B733", particles: ["🦁","🔥","✨"] },
  { match: "dragão",      emoji: "🐉", rarity: "legendary", style: "orbit",  color: "#22E06A", particles: ["🐉","🔥","💥"] },
  { match: "fênix",       emoji: "🦅", rarity: "legendary", style: "burst",  color: "#FF6B00", particles: ["🔥","🦅","✨"] },
  { match: "carro",       emoji: "🏎️", rarity: "rare",      style: "meteor", color: "#FF3D3D", particles: ["🏎️","💨","🔥"] },
  { match: "jato",        emoji: "✈️", rarity: "epic",      style: "meteor", color: "#22B8F2", particles: ["✈️","💨","☁️"] },
  { match: "iate",        emoji: "🛥️", rarity: "epic",      style: "float",  color: "#22B8F2", particles: ["🛥️","🌊","💦"] },
  { match: "castelo",     emoji: "🏰", rarity: "legendary", style: "throne", color: "#B592FF", particles: ["🏰","✨","👑"] },
  { match: "ilha",        emoji: "🏝️", rarity: "legendary", style: "float",  color: "#22E06A", particles: ["🏝️","🌴","🌊"] },
  { match: "meteoro",     emoji: "☄️", rarity: "legendary", style: "meteor", color: "#FF6B00", particles: ["☄️","🔥","💥"] },
  { match: "galáxia",     emoji: "🌌", rarity: "mythic",    style: "orbit",  color: "#7C3AED", particles: ["🌌","✨","💫","⭐"] },
  { match: "planeta",     emoji: "🪐", rarity: "mythic",    style: "orbit",  color: "#7C3AED", particles: ["🪐","⭐","✨"] },
  { match: "constelação", emoji: "✨", rarity: "mythic",    style: "orbit",  color: "#22E0FF", particles: ["✨","⭐","💫"] },
  { match: "robô",        emoji: "🤖", rarity: "epic",      style: "burst",  color: "#8AA9FF", particles: ["🤖","⚡","💥"] },
  { match: "anjo",        emoji: "👼", rarity: "legendary", style: "float",  color: "#FFE27A", particles: ["👼","✨","💛"] },
  { match: "trono",       emoji: "🪑", rarity: "mythic",    style: "throne", color: "#F7B733", particles: ["👑","✨","💎"] },
];

export function getGiftMeta(name: string): GiftMeta {
  const k = (name ?? "").toLowerCase();
  const found = GIFT_META.find((g) => k.includes(g.match));
  if (found) return found;
  return {
    match: k,
    rarity: "common",
    style: "float",
    color: "#22E06A",
    particles: ["✨","💫","⭐"],
  };
}
