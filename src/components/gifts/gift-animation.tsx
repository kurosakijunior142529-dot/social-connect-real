import { useEffect, useMemo, useState } from "react";
import { RARITY_STYLE, getGiftMeta } from "@/lib/gifts/catalog";
import { cn } from "@/lib/utils";

export type GiftEvent = {
  id: number;
  name: string;
  emoji: string;
  senderName?: string;
};

type Props = {
  event: GiftEvent | null;
  onDone: () => void;
};

/** Fullscreen premium gift animation overlay with rarity-tinted particles + sound. */
export function GiftAnimation({ event, onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (!event) return;
    setPhase("in");
    const outT = setTimeout(() => setPhase("out"), 2400);
    const doneT = setTimeout(onDone, 3200);
    playGiftSound(getGiftMeta(event.name).rarity);
    return () => { clearTimeout(outT); clearTimeout(doneT); };
  }, [event, onDone]);

  const meta = useMemo(() => (event ? getGiftMeta(event.name) : null), [event]);
  if (!event || !meta) return null;

  const rarity = RARITY_STYLE[meta.rarity];
  const parts = meta.particles ?? [event.emoji];
  const count = meta.rarity === "mythic" ? 90
    : meta.rarity === "legendary" ? 64
    : meta.rarity === "epic" ? 42
    : meta.rarity === "rare" ? 26
    : 16;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {/* Backdrop flash for high tiers */}
      {meta.rarity !== "common" && meta.rarity !== "rare" ? (
        <div
          className={cn("absolute inset-0 transition-opacity duration-500",
            phase === "in" ? "opacity-100" : "opacity-0")}
          style={{
            background: `radial-gradient(60% 60% at 50% 50%, ${meta.color}33 0%, transparent 70%)`,
          }}
        />
      ) : null}

      {/* Particles */}
      {Array.from({ length: count }).map((_, i) => {
        const emoji = parts[i % parts.length];
        const left = 5 + Math.random() * 90;
        const delay = Math.random() * 0.8;
        const dur = 2.4 + Math.random() * 1.1;
        const size = 22 + Math.random() * 28;
        const drift = (Math.random() - 0.5) * 140;
        const rot = (Math.random() - 0.5) * 60;
        const style: React.CSSProperties = {
          left: `${left}%`,
          bottom: `-10%`,
          fontSize: size,
          animationDelay: `${delay}s`,
          animationDuration: `${dur}s`,
          filter: `drop-shadow(0 0 8px ${meta.color})`,
          ["--drift" as unknown as string]: `${drift}px`,
          ["--rot" as unknown as string]: `${rot}deg`,
        };
        const anim = meta.style === "meteor" ? "gift-meteor"
          : meta.style === "burst" ? "gift-burst"
          : meta.style === "orbit" ? "gift-orbit"
          : meta.style === "throne" ? "gift-throne"
          : "gift-float";
        return (
          <span
            key={i}
            className={cn("absolute animate-none", anim)}
            style={style}
            aria-hidden
          >
            {emoji}
          </span>
        );
      })}

      {/* Center hero card */}
      <div className={cn(
        "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "transition-all duration-500",
        phase === "in" ? "opacity-100 scale-100" : "opacity-0 scale-90 translate-y-6",
      )}>
        <div
          className={cn(
            "px-6 py-4 rounded-3xl border backdrop-blur-xl flex items-center gap-4",
            rarity.ring,
          )}
          style={{
            background: `linear-gradient(135deg, ${meta.color}22, rgba(0,0,0,0.55))`,
            boxShadow: rarity.glow,
          }}
        >
          <div
            className="text-6xl leading-none animate-[gift-hero_1.6s_ease-out_infinite]"
            style={{ filter: `drop-shadow(0 0 12px ${meta.color})` }}
          >
            {event.emoji}
          </div>
          <div className="min-w-0">
            <div className={cn("text-[11px] font-bold uppercase tracking-widest", rarity.text)}>
              {rarity.label}
            </div>
            <div className="text-white font-bold text-lg leading-tight truncate">
              {event.name}
            </div>
            {event.senderName ? (
              <div className="text-white/70 text-xs truncate">de {event.senderName}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

let audioCtx: AudioContext | null = null;
function playGiftSound(rarity: string) {
  try {
    if (typeof window === "undefined") return;
    audioCtx = audioCtx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const notes = rarity === "mythic"     ? [523, 659, 784, 1046]
      : rarity === "legendary"            ? [523, 659, 784]
      : rarity === "epic"                 ? [440, 659]
      : rarity === "rare"                 ? [523, 659]
      : [523];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.18, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 0.4);
    });
  } catch { /* noop */ }
}
