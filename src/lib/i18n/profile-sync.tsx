import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "./index";
import { LOCALE_STORAGE_KEY, normalizeLocale } from "./config";

/**
 * Keeps the account language and the local UI language in sync:
 * - on sign-in, the saved account language wins over the device language
 * - when the user picks a language locally, it is saved to the account
 */
export function ProfileLocaleSync() {
  const { locale, setLocale } = useI18n();
  const pulled = useRef(false);
  const lastPushed = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user?.id;
      if (!userId || cancelled) return;
      const { data } = await (supabase as any)
        .from("profiles")
        .select("language")
        .eq("id", userId)
        .maybeSingle();
      const saved = normalizeLocale(data?.language as string | null);
      pulled.current = true;
      if (saved && !cancelled) {
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
        } catch {
          /* storage blocked */
        }
        // Account preference wins unless the user changed it on this device.
        if (!stored) setLocale(saved);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pulled.current) return;
    if (lastPushed.current === locale) return;
    lastPushed.current = locale;
    (async () => {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user?.id;
      if (!userId) return;
      await (supabase as any).from("profiles").update({ language: locale }).eq("id", userId);
    })();
  }, [locale]);

  return null;
}
