import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CHANNEL = "vibely-reels-watching";

/** Publica qual Reel o usuário está vendo agora (só enquanto está na tela de Reels). */
export function useBroadcastReel(userId: string | undefined, postId: string | null) {
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ready = useRef(false);
  const latest = useRef(postId);
  latest.current = postId;

  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(CHANNEL, { config: { presence: { key: userId } } });
    chRef.current = ch;
    ch.subscribe((st) => {
      if (st !== "SUBSCRIBED") return;
      ready.current = true;
      if (latest.current) void ch.track({ postId: latest.current, at: Date.now() });
    });
    return () => {
      ready.current = false;
      chRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => {
    const ch = chRef.current;
    if (!ch || !ready.current || !postId) return;
    void ch.track({ postId, at: Date.now() });
  }, [postId]);
}

/** Retorna o Reel que outra pessoa está vendo agora, ou null. */
export function useFriendReel(userId: string | undefined, otherId: string | undefined) {
  const [postId, setPostId] = useState<string | null>(null);
  useEffect(() => {
    if (!userId || !otherId) return;
    const ch = supabase.channel(CHANNEL, { config: { presence: { key: userId } } });
    const sync = () => {
      const raw = ch.presenceState() as Record<string, Array<Record<string, unknown>>>;
      const entries = raw[otherId] ?? [];
      const last = entries[entries.length - 1];
      setPostId(typeof last?.postId === "string" ? last.postId : null);
    };
    ch.on("presence", { event: "sync" }, sync);
    ch.on("presence", { event: "join" }, sync);
    ch.on("presence", { event: "leave" }, sync);
    ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [userId, otherId]);
  return postId;
}
