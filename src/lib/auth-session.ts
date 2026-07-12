import type { QueryClient } from "@tanstack/react-query";
import type { NavigateFn } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export async function signOutAndClearSession(queryClient: QueryClient, navigate: NavigateFn) {
  await queryClient.cancelQueries();
  queryClient.clear();
  try {
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    // Local cleanup below still protects the current device if the network fails.
  }

  if (typeof window !== "undefined") {
    try {
      const wipe = (store: Storage) => {
        const keys: string[] = [];
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          if (k && (k.startsWith("sb-") || k.includes("supabase"))) keys.push(k);
        }
        keys.forEach((k) => store.removeItem(k));
      };
      wipe(window.localStorage);
      wipe(window.sessionStorage);

      const host = window.location.hostname;
      const parent = host.split(".").slice(-2).join(".");
      document.cookie.split(";").forEach((c) => {
        const name = c.split("=")[0].trim();
        if (!name || (!name.startsWith("sb-") && !name.includes("supabase"))) return;
        for (const domain of [undefined, host, `.${host}`, parent, `.${parent}`]) {
          const d = domain ? `; domain=${domain}` : "";
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
        }
      });
    } catch {
      // Storage can be unavailable in strict browser modes.
    }
  }

  navigate({ to: "/auth", replace: true });
}