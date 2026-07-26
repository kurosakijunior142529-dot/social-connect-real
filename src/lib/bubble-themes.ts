import { useEffect, useState } from "react";

export type BubbleThemeId =
  | "classic"
  | "modern"
  | "neon"
  | "glass"
  | "gradient"
  | "minimal"
  | "gamer"
  | "cyberpunk"
  | "premium"
  | "custom";

export type BubbleTheme = {
  id: BubbleThemeId;
  label: string;
  swatch: string;
  mine: string;
  theirs: string;
};

export const BUBBLE_THEMES: BubbleTheme[] = [
  {
    id: "classic",
    label: "Clássico",
    swatch: "linear-gradient(135deg,#22E06A,#0BA85B)",
    mine: "bg-primary text-primary-foreground rounded-br-[6px]",
    theirs: "bg-[color:var(--surface-2)] text-foreground rounded-bl-[6px]",
  },
  {
    id: "modern",
    label: "Moderno",
    swatch: "linear-gradient(135deg,#F5F5F7,#8E8E93)",
    mine: "bg-white text-black rounded-br-[6px] shadow-[0_6px_20px_-8px_rgba(255,255,255,0.35)]",
    theirs: "bg-[#1c1c1e] text-white rounded-bl-[6px] border border-white/5",
  },
  {
    id: "neon",
    label: "Neon",
    swatch: "linear-gradient(135deg,#22E06A,#22B8F2)",
    mine: "text-white rounded-br-[6px] shadow-[0_0_18px_rgba(34,224,106,0.65)] border border-[#22E06A]/70 bg-[linear-gradient(135deg,rgba(34,224,106,0.25),rgba(34,184,242,0.25))]",
    theirs: "text-white rounded-bl-[6px] shadow-[0_0_14px_rgba(255,61,138,0.4)] border border-[#FF3D8A]/60 bg-[linear-gradient(135deg,rgba(255,61,138,0.18),rgba(124,58,237,0.18))]",
  },
  {
    id: "glass",
    label: "Vidro",
    swatch: "linear-gradient(135deg,rgba(255,255,255,0.5),rgba(255,255,255,0.1))",
    mine: "bubble-glass bubble-glass-mine rounded-br-[6px]",
    theirs: "bubble-glass bubble-glass-theirs rounded-bl-[6px]",
  },
  {
    id: "gradient",
    label: "Gradiente",
    swatch: "linear-gradient(135deg,#FF3D8A,#7C3AED,#22B8F2)",
    mine: "text-white rounded-br-[6px] bg-[linear-gradient(135deg,#22E06A,#22B8F2,#7C3AED)]",
    theirs: "text-white rounded-bl-[6px] bg-[linear-gradient(135deg,#FF3D8A,#7C3AED)]",
  },
  {
    id: "minimal",
    label: "Minimalista",
    swatch: "linear-gradient(135deg,#F5F5F7,#3a3a3c)",
    mine: "bg-transparent border border-primary/70 text-primary rounded-br-[6px]",
    theirs: "bg-transparent border border-white/15 text-foreground rounded-bl-[6px]",
  },
  {
    id: "gamer",
    label: "Gamer",
    swatch: "linear-gradient(135deg,#22E06A,#0f0f11)",
    mine: "font-mono text-[#0aff9d] rounded-br-[6px] bg-[#001a0d] border border-[#0aff9d]/60 shadow-[0_0_14px_rgba(10,255,157,0.35)]",
    theirs: "font-mono text-[#8be9ff] rounded-bl-[6px] bg-[#001522] border border-[#8be9ff]/50 shadow-[0_0_14px_rgba(139,233,255,0.25)]",
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    swatch: "linear-gradient(135deg,#FF00E5,#00E5FF)",
    mine: "text-white rounded-br-[6px] bg-[linear-gradient(135deg,#ff00c8,#7a00ff)] shadow-[0_0_20px_rgba(255,0,200,0.55)] border border-[#ff00c8]/70",
    theirs: "text-[#e6faff] rounded-bl-[6px] bg-[linear-gradient(135deg,#001a2a,#00303a)] border border-[#00e5ff]/60 shadow-[0_0_18px_rgba(0,229,255,0.4)]",
  },
  {
    id: "premium",
    label: "Premium",
    swatch: "linear-gradient(135deg,#FFE27A,#B8791A)",
    mine: "text-[#2a1a00] rounded-br-[6px] bg-[linear-gradient(135deg,#FFE27A,#F7B733,#B8791A)] shadow-[0_6px_20px_-8px_rgba(247,183,51,0.7)] border border-[#F7B733]/60",
    theirs: "text-[#f8ecd0] rounded-bl-[6px] bg-[linear-gradient(135deg,#2a1e08,#3d2a0d)] border border-[#F7B733]/40",
  },
  {
    id: "custom",
    label: "Personalizado",
    swatch: "conic-gradient(from 210deg,#22E06A,#FF3D8A,#22B8F2,#22E06A)",
    mine: "text-white rounded-br-[6px] bg-[conic-gradient(from_210deg,#22E06A,#22B8F2,#7C3AED,#FF3D8A,#22E06A)] shadow-[0_0_16px_rgba(124,58,237,0.5)]",
    theirs: "text-white rounded-bl-[6px] bg-[linear-gradient(135deg,#0f0f11,#1a1a1d)] border border-white/10",
  },
];

const STORAGE_KEY = "vibely.bubbleTheme";

export function getStoredBubbleTheme(chatId: string): BubbleThemeId {
  if (typeof window === "undefined") return "classic";
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}.${chatId}`)
      ?? window.localStorage.getItem(STORAGE_KEY);
    if (raw && BUBBLE_THEMES.some((t) => t.id === raw)) return raw as BubbleThemeId;
  } catch { /* noop */ }
  return "classic";
}

export function useBubbleTheme(chatId: string) {
  const [themeId, setThemeId] = useState<BubbleThemeId>("classic");

  useEffect(() => {
    setThemeId(getStoredBubbleTheme(chatId));
  }, [chatId]);

  const set = (id: BubbleThemeId) => {
    setThemeId(id);
    try {
      window.localStorage.setItem(`${STORAGE_KEY}.${chatId}`, id);
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch { /* noop */ }
  };

  const theme = BUBBLE_THEMES.find((t) => t.id === themeId) ?? BUBBLE_THEMES[0];
  return { themeId, theme, setTheme: set };
}
