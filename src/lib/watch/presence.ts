import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CHANNEL = "vibely-watch-rooms-presence";

export type WatchingInfo = { roomId: string; title: string | null };

/** Publica em qual sala do Streaming Amigo o usuário está agora. */
export function useBroadcastWatching(userId: string | undefined, info: WatchingInfo | null) {
  const roomId = info?.roomId ?? null;
  const title = info?.title ?? null;
  useEffect(() => {
    if (!userId || !roomId) return;
    const ch = supabase.channel(CHANNEL, { config: { presence: { key: userId } } });
    ch.subscribe((st) => {
      if (st === "SUBSCRIBED") void ch.track({ roomId, title, at: Date.now() });
    });
    return () => void supabase.removeChannel(ch);
  }, [userId, roomId, title]);
}

/** Sala em que outra pessoa está assistindo agora, ou null. */
export function useFriendWatching(userId: string | undefined, otherId: string | undefined) {
  const [info, setInfo] = useState<WatchingInfo | null>(null);
  useEffect(() => {
    if (!userId || !otherId) return;
    const ch = supabase.channel(CHANNEL, { config: { presence: { key: `${userId}-viewer` } } });
    const sync = () => {
      const raw = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const last = (raw[otherId] ?? []).slice(-1)[0];
      setInfo(typeof last?.roomId === "string" ? { roomId: last.roomId, title: (last.title as string) ?? null } : null);
    };
    ch.on("presence", { event: "sync" }, sync);
    ch.on("presence", { event: "join" }, sync);
    ch.on("presence", { event: "leave" }, sync);
    ch.subscribe();
    return () => void supabase.removeChannel(ch);
  }, [userId, otherId]);
  return info;
}
