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

    // O SDK do Supabase já reconecta sozinho. Só consideramos o socket "morto"
    // quando existem canais inscritos e nenhum deles está ativo — assim a faixa
    // não fica presa em "Reconectando…" por causa de estados intermediários.
    const socketAlive = () => {
      const channels = supabase.getChannels();
      if (channels.length === 0) return true;
      return channels.some((c) => c.state === "joined" || c.state === "joining");
    };


    let running = false;

    const resync = async () => {
      if (cancelled || running) return;
      if (!isOnline()) {
        setState("offline");
        return;
      }
      running = true;

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
            .filter((c) => c.state === "closed" || c.state === "errored")
            .forEach((c) => c.subscribe());
        }

        // 3) dados: revalida tudo que está montado (stale-while-revalidate)
        await queryClient.invalidateQueries({ type: "active" });
        router.invalidate();

        if (cancelled) return;
        attempt = 0;
        // Chegamos até aqui: a rede respondeu. Nunca deixamos a faixa presa.
        setState(isOnline() ? "online" : "offline");
      } catch {
        if (cancelled) return;
        attempt += 1;
        setState(isOnline() ? "reconnecting" : "offline");
        timer = window.setTimeout(resync, Math.min(backoffDelay(attempt), 30_000));
      } finally {
        running = false;
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
      if (document.visibilityState !== "visible") return;
      if (!isOnline()) return setState("offline");
      if (!socketAlive()) void resync();
      else setState((s) => (s === "reconnecting" ? "online" : s));
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
