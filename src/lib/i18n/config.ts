export const LOCALES = [
  { code: "pt", label: "Português", nativeLabel: "Português", dir: "ltr", intl: "pt-BR" },
  { code: "en", label: "Inglês", nativeLabel: "English", dir: "ltr", intl: "en-US" },
  { code: "es", label: "Espanhol", nativeLabel: "Español", dir: "ltr", intl: "es-ES" },
  { code: "fr", label: "Francês", nativeLabel: "Français", dir: "ltr", intl: "fr-FR" },
  { code: "de", label: "Alemão", nativeLabel: "Deutsch", dir: "ltr", intl: "de-DE" },
  { code: "it", label: "Italiano", nativeLabel: "Italiano", dir: "ltr", intl: "it-IT" },
  { code: "ar", label: "Árabe", nativeLabel: "العربية", dir: "rtl", intl: "ar" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", dir: "ltr", intl: "hi-IN" },
  { code: "ja", label: "Japonês", nativeLabel: "日本語", dir: "ltr", intl: "ja-JP" },
  { code: "ko", label: "Coreano", nativeLabel: "한국어", dir: "ltr", intl: "ko-KR" },
  { code: "zh", label: "Chinês", nativeLabel: "中文", dir: "ltr", intl: "zh-CN" },
  { code: "ru", label: "Russo", nativeLabel: "Русский", dir: "ltr", intl: "ru-RU" },
] as const;

export type LocaleCode = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: LocaleCode = "en";
export const LOCALE_STORAGE_KEY = "vibely:locale";

export function localeMeta(code: LocaleCode) {
  return LOCALES.find((l) => l.code === code) ?? LOCALES[1];
}

/** Maps anything like "pt-BR", "zh-Hant", "en_US" to one of our locales. */
export function normalizeLocale(input?: string | null): LocaleCode | null {
  if (!input) return null;
  const base = input.toLowerCase().replace("_", "-").split("-")[0];
  const found = LOCALES.find((l) => l.code === base);
  return found ? found.code : null;
}

export function detectLocale(candidates: readonly (string | null | undefined)[]): LocaleCode {
  for (const c of candidates) {
    const n = normalizeLocale(c);
    if (n) return n;
  }
  return DEFAULT_LOCALE;
}
