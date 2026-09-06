import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Languages, Loader2 } from "lucide-react";
import { translateText } from "@/lib/ai.functions";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Heuristic language guess — good enough to decide whether to offer the
 * "Translate" affordance. Never blocks: when unsure we show the button.
 */
function looksLikeLocale(text: string, locale: string) {
  const t = text.toLowerCase();
  if (/[\u0600-\u06ff]/.test(t)) return locale === "ar";
  if (/[\u0900-\u097f]/.test(t)) return locale === "hi";
  if (/[\u3040-\u30ff]/.test(t)) return locale === "ja";
  if (/[\uac00-\ud7af]/.test(t)) return locale === "ko";
  if (/[\u4e00-\u9fff]/.test(t)) return locale === "zh";
  if (/[\u0400-\u04ff]/.test(t)) return locale === "ru";
  const marks: Record<string, RegExp> = {
    pt: /\b(não|você|obrigado|muito|para|com|que|amanhã|hoje|gente|vamos)\b|[ãõç]/,
    es: /\b(no|gracias|muy|para|con|que|hoy|mañana|nosotros|vamos)\b|[¿¡ñ]/,
    fr: /\b(pas|merci|très|pour|avec|que|aujourd'hui|demain|nous)\b|[çœ]/,
    de: /\b(nicht|danke|sehr|für|mit|dass|heute|morgen|wir)\b|[äöüß]/,
    it: /\b(non|grazie|molto|per|con|che|oggi|domani|noi)\b/,
    en: /\b(the|and|you|thanks|today|tomorrow|with|that|we're|it's)\b/,
  };
  const hit = Object.entries(marks).find(([, re]) => re.test(t));
  return hit ? hit[0] === locale : true; // unknown script/langs: assume same
}

export function TranslatableText({
  text,
  className,
  buttonClassName,
}: {
  text: string;
  className?: string;
  buttonClassName?: string;
}) {
  const { locale, t } = useI18n();
  const run = useServerFn(translateText);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showing, setShowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const trimmed = text.trim();
  const offer = trimmed.length > 1 && !looksLikeLocale(trimmed, locale);

  async function onToggle() {
    if (showing) {
      setShowing(false);
      return;
    }
    if (translated) {
      setShowing(true);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const res = await run({ data: { text: trimmed, target: locale } });
      if (res?.text) {
        setTranslated(res.text);
        setShowing(true);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className={className}>
      <span className="whitespace-pre-wrap">{showing && translated ? translated : text}</span>
      {offer && (
        <button
          type="button"
          onClick={() => void onToggle()}
          disabled={loading}
          className={cn(
            "mt-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-primary disabled:opacity-60",
            buttonClassName,
          )}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Languages className="h-3 w-3" />
          )}
          {loading
            ? t("translate.translating")
            : failed
              ? t("translate.failed")
              : showing
                ? t("translate.showOriginal")
                : t("translate.action")}
        </button>
      )}
    </span>
  );
}

/**
 * Hook version: lets a caller keep its own renderer (emoji parsing, mentions)
 * while still offering the Translate / Show original toggle.
 */
export function useTranslatable(text: string | null | undefined) {
  const { locale, t } = useI18n();
  const run = useServerFn(translateText);
  const [translated, setTranslated] = useState<string | null>(null);
  const [showing, setShowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const trimmed = (text ?? "").trim();
  const offer = trimmed.length > 1 && !looksLikeLocale(trimmed, locale);

  async function toggle() {
    if (showing) return setShowing(false);
    if (translated) return setShowing(true);
    setLoading(true);
    setFailed(false);
    try {
      const res = await run({ data: { text: trimmed, target: locale } });
      if (res?.text) {
        setTranslated(res.text);
        setShowing(true);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const button = offer ? (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={loading}
      className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-primary disabled:opacity-60"
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
      {loading
        ? t("translate.translating")
        : failed
          ? t("translate.failed")
          : showing
            ? t("translate.showOriginal")
            : t("translate.action")}
    </button>
  ) : null;

  return { value: showing && translated ? translated : (text ?? ""), button };
}
