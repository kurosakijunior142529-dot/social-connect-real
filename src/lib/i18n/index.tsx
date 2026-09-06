import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  detectLocale,
  localeMeta,
  normalizeLocale,
  type LocaleCode,
} from "./config";
import pt from "./locales/pt.json";
import en from "./locales/en.json";

export type Dict = Record<string, string>;
export type TranslationKey = keyof typeof pt;

const BUILTIN: Partial<Record<LocaleCode, Dict>> = { pt, en };

const loaders: Record<string, () => Promise<{ default: Dict }>> = {
  es: () => import("./locales/es.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
  it: () => import("./locales/it.json"),
  ar: () => import("./locales/ar.json"),
  hi: () => import("./locales/hi.json"),
  ja: () => import("./locales/ja.json"),
  ko: () => import("./locales/ko.json"),
  zh: () => import("./locales/zh.json"),
  ru: () => import("./locales/ru.json"),
};

const cache = new Map<LocaleCode, Dict>(Object.entries(BUILTIN) as [LocaleCode, Dict][]);

export async function loadDict(code: LocaleCode): Promise<Dict> {
  const hit = cache.get(code);
  if (hit) return hit;
  const loader = loaders[code];
  if (!loader) return en as Dict;
  try {
    const mod = await loader();
    cache.set(code, mod.default);
    return mod.default;
  } catch {
    return en as Dict;
  }
}

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    vars[k] === undefined ? m : String(vars[k]),
  );
}

type Ctx = {
  locale: LocaleCode;
  intlLocale: string;
  dir: "ltr" | "rtl";
  setLocale: (code: LocaleCode) => void;
  t: (key: TranslationKey | (string & {}), vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx | null>(null);

function readStoredLocale(): LocaleCode | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR always renders the default locale, then the client switches on mount.
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);
  const [dict, setDict] = useState<Dict>((BUILTIN[DEFAULT_LOCALE] ?? en) as Dict);

  useEffect(() => {
    const initial = detectLocale([
      readStoredLocale(),
      ...(typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : []),
    ]);
    if (initial !== DEFAULT_LOCALE) applyLocale(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyLocale = useCallback((code: LocaleCode) => {
    void loadDict(code).then((d) => {
      setDict(d);
      setLocaleState(code);
    });
  }, []);

  const setLocale = useCallback(
    (code: LocaleCode) => {
      try {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, code);
      } catch {
        /* storage blocked */
      }
      applyLocale(code);
    },
    [applyLocale],
  );

  const meta = localeMeta(locale);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = meta.intl;
    document.documentElement.dir = meta.dir;
  }, [meta.intl, meta.dir]);

  const value = useMemo<Ctx>(
    () => ({
      locale,
      intlLocale: meta.intl,
      dir: meta.dir as "ltr" | "rtl",
      setLocale,
      t: (key, vars) => {
        const raw = dict[key as string] ?? (en as Dict)[key as string] ?? (key as string);
        return interpolate(raw, vars);
      },
    }),
    [locale, meta.intl, meta.dir, setLocale, dict],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // Safe fallback so components never crash outside the provider (tests, isolated renders).
  return {
    locale: DEFAULT_LOCALE,
    intlLocale: "en-US",
    dir: "ltr",
    setLocale: () => {},
    t: (key, vars) => interpolate((en as Dict)[key as string] ?? (key as string), vars),
  };
}

/** Shorthand: const t = useT(); t("nav.home") */
export function useT() {
  return useI18n().t;
}

export { LOCALES, localeMeta, type LocaleCode } from "./config";
