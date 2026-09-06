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
    <div className="fixed inset-0 z-[110] flex flex-col items-center justify-between bg-[#050505] px-8 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))] text-white">
      <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
        <div className="relative grid place-items-center">
          <span className="absolute h-64 w-64 rounded-full bg-primary/20 blur-[70px]" />
          <div className="relative rounded-full bg-white/10 p-[2px]">
            <UserAvatar
              avatarPath={incoming.other.avatar_url ?? null}
              displayName={name}
              className="h-36 w-36 border-2 border-black"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-[28px] font-semibold tracking-tight">{name}</h1>
          {incoming.other.username && (
            <p className="text-[13px] text-white/40">@{incoming.other.username}</p>
          )}
          <p className="flex items-center justify-center gap-1.5 pt-1 text-[13px] text-white/55">
            {incoming.type === "video" ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
            Chamada de {incoming.type === "video" ? "vídeo" : "voz"}
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-xs items-center justify-between">
        <button onClick={onReject} className="flex flex-col items-center gap-2.5" aria-label="Recusar">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-red-600 transition active:scale-90">
            <PhoneOff className="h-6 w-6" />
          </span>
          <span className="text-[12px] text-white/50">Recusar</span>
        </button>
        <button onClick={onAccept} className="flex flex-col items-center gap-2.5" aria-label="Atender">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-90">
            <Phone className="h-6 w-6" />
          </span>
          <span className="text-[12px] text-white/50">Atender</span>
        </button>
      </div>
    </div>
  );
}
