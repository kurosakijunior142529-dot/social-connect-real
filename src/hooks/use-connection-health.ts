import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  backoffDelay,
  isOnline,
  onForeground,
  onOnlineChange,
} from "@/lib/app-lifecycle";

export type ConnectionState = "online" | "reconnecting" | "offline";

/**
 * Detecta desconexão silenciosa (aba oculta, celular bloqueado, rede caiu) e
 * refaz tudo ao voltar: socket do Realtime, sessão e dados em cache.
 */
export function useConnectionHealth(): ConnectionState {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [state, setState] = useState<ConnectionState>("online");

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    let timer: number | undefined;

    const socketAlive = () => {
      const rt = supabase.realtime as unknown as { isConnected?: () => boolean };
      return typeof rt.isConnected === "function" ? rt.isConnected() : true;
    };

    const resync = async () => {
      if (cancelled) return;
      if (!isOnline()) {
        setState("offline");
        return;
      }

      const needsSocket = !socketAlive();
      if (needsSocket) setState("reconnecting");

      try {
        // 1) sessão válida (token pode ter expirado enquanto estava em background)
        await supabase.auth.getSession();

        // 2) socket do Realtime: reconectar e reassinar canais caídos
        if (needsSocket) {
          supabase.realtime.connect();
          supabase
            .getChannels()
            .filter((c) => c.state !== "joined")
            .forEach((c) => c.subscribe());
        }

        // 3) dados: revalida tudo que está montado (stale-while-revalidate)
        await queryClient.invalidateQueries({ type: "active" });
        router.invalidate();

        if (cancelled) return;
        attempt = 0;
        setState("online");
      } catch {
        if (cancelled) return;
        setState("reconnecting");
        attempt += 1;
        timer = window.setTimeout(resync, backoffDelay(attempt));
      }
    };

    const offForeground = onForeground(() => void resync());
    const offOnline = onOnlineChange((online) => {
      if (!online) return setState("offline");
      setState("reconnecting");
      void resync();
    });

    // Heartbeat leve: detecta socket morto mesmo sem trocar de aba.
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !isOnline()) return;
      if (!socketAlive()) void resync();
    }, 15_000);

    return () => {
      cancelled = true;
      offForeground();
      offOnline();
      window.clearInterval(heartbeat);
      if (timer) window.clearTimeout(timer);
    };
  }, [queryClient, router]);

  return state;
}
