import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PresenceInfo = {
  userId: string;
  activity: string;
  at: number;
};

const GLOBAL_CHANNEL = "vibely-online";

/**
 * Presença global do app: publica que o usuário está online (quando ele permite)
 * e devolve quem mais está online agora, em tempo real.
 */
export function useGlobalPresence(userId: string | undefined, options?: { share?: boolean; activity?: string }) {
  const share = options?.share ?? true;
  const activity = options?.activity ?? "online";
  const [online, setOnline] = useState<Record<string, PresenceInfo>>({});

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(GLOBAL_CHANNEL, {
      config: { presence: { key: userId } },
    });

    const sync = () => {
      const raw = channel.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const next: Record<string, PresenceInfo> = {};
      for (const [key, entries] of Object.entries(raw)) {
        const entry = entries?.[0] ?? {};
        next[key] = {
          userId: key,
          activity: typeof entry.activity === "string" ? entry.activity : "online",
          at: typeof entry.at === "number" ? entry.at : Date.now(),
        };
      }
      setOnline(next);
    };

    channel.on("presence", { event: "sync" }, sync);
    channel.on("presence", { event: "join" }, sync);
    channel.on("presence", { event: "leave" }, sync);

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      if (share) await channel.track({ activity, at: Date.now() });
      else await channel.untrack();
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, share, activity]);

  const onlineIds = useMemo(() => Object.keys(online), [online]);
  return { online, onlineIds };
}
