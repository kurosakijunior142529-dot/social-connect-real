import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type PresenceState = "idle" | "typing" | "recording";

export function useConversationPresence(
  channelKey: string,
  userId: string,
): { others: PresenceState; setMe: (s: PresenceState) => void } {
  const [others, setOthers] = useState<PresenceState>("idle");
  const chRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const ch = supabase.channel(`presence:${channelKey}`, {
      config: { presence: { key: userId } },
    });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, { state?: PresenceState }[]>;
      let next: PresenceState = "idle";
      for (const [key, arr] of Object.entries(state)) {
        if (key === userId) continue;
        const s = arr[0]?.state;
        if (s === "recording") next = "recording";
        else if (s === "typing" && next !== "recording") next = "typing";
      }
      setOthers(next);
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") ch.track({ state: "idle" });
    });
    chRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      chRef.current = null;
    };
  }, [channelKey, userId]);

  function setMe(s: PresenceState) {
    chRef.current?.track({ state: s });
  }

  return { others, setMe };
}

export function TypingIndicator({ state, name }: { state: PresenceState; name?: string | null }) {
  if (state === "idle") return null;
  const label = state === "recording" ? "gravando áudio…" : "digitando…";
  return (
    <div className="px-4 pb-1 text-[11px] text-muted-foreground italic flex items-center gap-1">
      <span className="flex gap-0.5">
        <span className="h-1 w-1 rounded-full bg-primary animate-bounce" />
        <span className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:.1s]" />
        <span className="h-1 w-1 rounded-full bg-primary animate-bounce [animation-delay:.2s]" />
      </span>
      {name ? <>{name} {label}</> : label}
    </div>
  );
}
