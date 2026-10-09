import { useEffect, useState, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getConversationMeta, setConversationMeta, getChatMeta, setChatMeta } from "@/lib/chat-prefs.functions";

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
  { id: "modern", label: "Vibely", swatch: "linear-gradient(135deg,#1F8F55,#2a2a2e)",
    mine: "bubble-v-mine rounded-br-[6px]", theirs: "bubble-v-theirs rounded-bl-[6px]" },
  { id: "classic", label: "Clássico", swatch: "linear-gradient(135deg,#005C4B,#202C33)",
    mine: "bubble-wa-mine rounded-br-[6px]", theirs: "bubble-wa-theirs rounded-bl-[6px]" },
  { id: "minimal", label: "Grafite", swatch: "linear-gradient(135deg,#3a3a3f,#1c1c1f)",
    mine: "bubble-g-mine rounded-br-[6px]", theirs: "bubble-g-theirs rounded-bl-[6px]" },
  { id: "glass", label: "Vidro", swatch: "linear-gradient(135deg,rgba(255,255,255,0.4),rgba(255,255,255,0.08))",
    mine: "bubble-glass bubble-glass-mine rounded-br-[6px]", theirs: "bubble-glass bubble-glass-theirs rounded-bl-[6px]" },
  { id: "neon", label: "Oceano", swatch: "linear-gradient(135deg,#1E5E8C,#1c2530)",
    mine: "bubble-o-mine rounded-br-[6px]", theirs: "bubble-o-theirs rounded-bl-[6px]" },
  { id: "premium", label: "Areia", swatch: "linear-gradient(135deg,#C9A66B,#2b2620)",
    mine: "bubble-a-mine rounded-br-[6px]", theirs: "bubble-a-theirs rounded-bl-[6px]" },
];

export type ChatFontId = "system" | "serif" | "mono" | "rounded";
export const CHAT_FONTS: { id: ChatFontId; label: string; className: string }[] = [
  { id: "system", label: "Padrão", className: "font-sans" },
  { id: "serif", label: "Serifada", className: "font-serif" },
  { id: "mono", label: "Mono", className: "font-mono" },
  { id: "rounded", label: "Arredondada", className: "[font-family:ui-rounded,'SF_Pro_Rounded','Nunito',system-ui,sans-serif]" },
];

export type ChatPrefs = {
  themeId: BubbleThemeId;
  font: ChatFontId;
  radius: number; // 8-28 px
  animations: boolean;
};

const DEFAULTS: ChatPrefs = {
  themeId: "modern",
  font: "system",
  radius: 20,
  animations: true,
};

const STORAGE_KEY = "vibely.chatPrefs";

function readPrefs(chatId: string): ChatPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}.${chatId}`);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...DEFAULTS, ...p };
    }
    // legacy: bubble theme only
    const legacyKey = window.localStorage.getItem(`vibely.bubbleTheme.${chatId}`)
      ?? window.localStorage.getItem("vibely.bubbleTheme");
    if (legacyKey && BUBBLE_THEMES.some((t) => t.id === legacyKey)) {
      return { ...DEFAULTS, themeId: legacyKey as BubbleThemeId };
    }
  } catch { /* noop */ }
  return DEFAULTS;
}

function writePrefs(chatId: string, prefs: ChatPrefs) {
  try {
    window.localStorage.setItem(`${STORAGE_KEY}.${chatId}`, JSON.stringify(prefs));
    // notify same-tab listeners (storage event only fires cross-tab)
    window.dispatchEvent(new CustomEvent("vibely:chatPrefs", { detail: { chatId } }));
  } catch { /* noop */ }
}

export function getStoredBubbleTheme(chatId: string): BubbleThemeId {
  return readPrefs(chatId).themeId;
}

export function useChatPrefs(chatId: string) {
  const [prefs, setPrefs] = useState<ChatPrefs>(DEFAULTS);
  const fetchConversationMeta = useServerFn(getConversationMeta);
  const saveConversationMeta = useServerFn(setConversationMeta);
  const fetchChatMeta = useServerFn(getChatMeta);
  const saveChatMeta = useServerFn(setChatMeta);

  const { storageKey, isDm, realId } = useMemo(() => {
    const isDm = chatId.startsWith("dm-");
    const realId = isDm ? chatId.slice(3) : chatId;
    const storageKey = isDm ? `dm-${realId}` : realId;
    return { storageKey, isDm, realId };
  }, [chatId]);

  // 1) Load: localStorage first (instant), then merge server meta in background.
  useEffect(() => {
    let cancelled = false;
    setPrefs(readPrefs(storageKey));

    const fetcher = isDm
      ? fetchConversationMeta({ data: { conversationId: realId } })
      : fetchChatMeta({ data: { chatId: realId } });

    fetcher
      .then((server) => {
        if (cancelled) return;
        if (server && Object.keys(server).length > 0) {
          setPrefs((prev) => {
            const merged = { ...prev, ...server };
            writePrefs(storageKey, merged);
            return merged;
          });
        }
      })
      .catch(() => {
        // offline / unauthenticated — localStorage remains authoritative
      });

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.chatId === storageKey) setPrefs(readPrefs(storageKey));
    };
    window.addEventListener("vibely:chatPrefs", onChange as EventListener);
    window.addEventListener("storage", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("vibely:chatPrefs", onChange as EventListener);
      window.removeEventListener("storage", onChange);
    };
  }, [storageKey, isDm, realId, fetchConversationMeta, fetchChatMeta]);

  const update = useCallback(
    (patch: Partial<ChatPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        writePrefs(storageKey, next);
        // Sync to server in background; do not block UI on failures.
        const saver = isDm
          ? saveConversationMeta({ data: { conversationId: realId, patch } })
          : saveChatMeta({ data: { chatId: realId, patch } });
        saver.catch(() => {});
        return next;
      });
    },
    [storageKey, isDm, realId, saveConversationMeta, saveChatMeta],
  );

  const theme = BUBBLE_THEMES.find((t) => t.id === prefs.themeId) ?? BUBBLE_THEMES[0];
  const font = CHAT_FONTS.find((f) => f.id === prefs.font) ?? CHAT_FONTS[0];
  return { prefs, update, theme, font };
}

// Back-compat wrapper for existing callers
export function useBubbleTheme(chatId: string) {
  const { prefs, update, theme } = useChatPrefs(chatId);
  return {
    themeId: prefs.themeId,
    theme,
    setTheme: (id: BubbleThemeId) => update({ themeId: id }),
  };
}
