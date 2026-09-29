import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/** Player de vídeo enxuto, no visual do app (sem a barra cinza do navegador). */
export function SimpleVideo({
  src,
  className,
  maxHeight = "58dvh",
}: {
  src: string;
  className?: string;
  maxHeight?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setPct(0);
  }, [src]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play().then(() => setPlaying(true)).catch(() => {});
    else {
      v.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = ref.current;
    if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };

  return (
    <div className={cn("relative overflow-hidden bg-black", className)}>
      <video
        ref={ref}
        src={src}
        playsInline
        muted={muted}
        loop
        onClick={toggle}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration) setPct((v.currentTime / v.duration) * 100);
        }}
        onEnded={() => setPlaying(false)}
        className="mx-auto w-full object-contain"
        style={{ maxHeight }}
      />
      {!playing ? (
        <button
          type="button"
          onClick={toggle}
          aria-label="Reproduzir"
          className="absolute inset-0 grid place-items-center bg-black/20"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-black/55 text-white backdrop-blur-md transition active:scale-90">
            <Play className="ml-0.5 h-6 w-6 fill-current" />
          </span>
        </button>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2.5 pt-6">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pausar" : "Reproduzir"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-90"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div onClick={seek} className="h-1.5 flex-1 cursor-pointer rounded-full bg-white/25">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Ativar som" : "Silenciar"}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-90"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
