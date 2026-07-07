import { useEffect, useRef } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";

type Props = {
  incoming: {
    id: string;
    type: "audio" | "video";
    other: {
      id: string;
      username?: string | null;
      display_name?: string | null;
      avatar_url?: string | null;
    };
  };
  onAccept: () => void;
  onReject: () => void;
};

// Simple ringtone via WebAudio (no asset needed)
function useRingtone(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const AudioCtx = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    ctxRef.current = ctx;
    const play = () => {
      if (stopped) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 480;
      g.gain.value = 0.15;
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine";
      o2.frequency.value = 620;
      g2.gain.value = 0.15;
      o2.connect(g2).connect(ctx.destination);
      o2.start(ctx.currentTime + 0.45);
      o2.stop(ctx.currentTime + 0.85);
    };
    play();
    const id = setInterval(play, 2000);
    return () => {
      stopped = true;
      clearInterval(id);
      ctx.close().catch(() => {});
    };
  }, [active]);
}

export function IncomingCallDialog({ incoming, onAccept, onReject }: Props) {
  useRingtone(true);
  const name =
    incoming.other.display_name ?? incoming.other.username ?? "Alguém";

  return (
    <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-2xl border animate-in slide-in-from-bottom-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            {incoming.type === "video" ? <Video className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
            Chamada de {incoming.type === "video" ? "vídeo" : "voz"} recebida
          </div>
          <UserAvatar
            avatarPath={incoming.other.avatar_url ?? null}
            displayName={name}
            className="h-24 w-24 ring-4 ring-primary/30 animate-pulse"
          />
          <div className="text-xl font-semibold">{name}</div>
          {incoming.other.username && (
            <div className="text-sm text-muted-foreground">@{incoming.other.username}</div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-around">
          <button
            onClick={onReject}
            className="flex flex-col items-center gap-2"
            aria-label="Recusar"
          >
            <span className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg">
              <PhoneOff className="h-6 w-6" />
            </span>
            <span className="text-xs">Recusar</span>
          </button>
          <button
            onClick={onAccept}
            className="flex flex-col items-center gap-2"
            aria-label="Atender"
          >
            <span className="h-14 w-14 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center text-white shadow-lg animate-pulse">
              <Phone className="h-6 w-6" />
            </span>
            <span className="text-xs">Atender</span>
          </button>
        </div>
      </div>
    </div>
  );
}
