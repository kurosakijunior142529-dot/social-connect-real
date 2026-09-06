import { useCallback, useEffect, useState } from "react";

const KEY = "vibely:ai-smart-replies";
const EVT = "vibely:ai-smart-replies-changed";
const AUTO_TRANSLATE_KEY = "vibely:auto-translate";
const AUTO_TRANSLATE_EVT = "vibely:auto-translate-changed";

function readFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v !== "off";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, evt: string, on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(evt));
}

function useFlag(key: string, evt: string, fallback: boolean): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(fallback);

  useEffect(() => {
    const sync = () => setOn(readFlag(key, fallback));
    sync();
    window.addEventListener(evt, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(evt, sync);
      window.removeEventListener("storage", sync);
    };
  }, [key, evt, fallback]);

  const update = useCallback(
    (next: boolean) => {
      writeFlag(key, evt, next);
      setOn(next);
    },
    [key, evt],
  );

  return [on, update];
}

export function getSmartRepliesEnabled(): boolean {
  return readFlag(KEY, false);
}

export function setSmartRepliesEnabled(on: boolean) {
  writeFlag(KEY, EVT, on);
}

export function useSmartRepliesEnabled(): [boolean, (on: boolean) => void] {
  return useFlag(KEY, EVT, false);
}

// Tradução automática: mensagens recebidas são traduzidas para o idioma do perfil.
export function getAutoTranslateEnabled(): boolean {
  return readFlag(AUTO_TRANSLATE_KEY, false);
}

export function useAutoTranslateEnabled(): [boolean, (on: boolean) => void] {
  return useFlag(AUTO_TRANSLATE_KEY, AUTO_TRANSLATE_EVT, false);
}

export const TRANSLATE_LANGUAGES: { code: string; label: string }[] = [
  { code: "pt-BR", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "ru", label: "Русский" },
];
