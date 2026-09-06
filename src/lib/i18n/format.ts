import { useMemo } from "react";
import { useI18n } from "./index";

/** Locale-aware date/number/relative-time helpers. */
export function useFormat() {
  const { intlLocale } = useI18n();
  return useMemo(() => {
    const rtf = new Intl.RelativeTimeFormat(intlLocale, { numeric: "auto", style: "narrow" });
    const nf = new Intl.NumberFormat(intlLocale, { notation: "compact", maximumFractionDigits: 1 });
    return {
      number: (n: number) => new Intl.NumberFormat(intlLocale).format(n),
      compact: (n: number) => nf.format(n),
      money: (n: number, currency = "BRL") =>
        new Intl.NumberFormat(intlLocale, { style: "currency", currency }).format(n),
      date: (d: string | number | Date, opts?: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat(intlLocale, opts ?? { dateStyle: "medium" }).format(new Date(d)),
      time: (d: string | number | Date) =>
        new Intl.DateTimeFormat(intlLocale, { timeStyle: "short" }).format(new Date(d)),
      relative: (d: string | number | Date) => {
        const diff = (new Date(d).getTime() - Date.now()) / 1000;
        const abs = Math.abs(diff);
        if (abs < 60) return rtf.format(Math.round(diff), "second");
        if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
        if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
        if (abs < 2592000) return rtf.format(Math.round(diff / 86400), "day");
        if (abs < 31536000) return rtf.format(Math.round(diff / 2592000), "month");
        return rtf.format(Math.round(diff / 31536000), "year");
      },
    };
  }, [intlLocale]);
}
