import { useEffect, useMemo, useState } from "react";
import { RARITY_STYLE, getGiftMeta } from "@/lib/gifts/catalog";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export type GiftEvent = {
  id: number;
  name: string;
  emoji: string;
  senderName?: string;
  senderId?: string;
  senderAvatar?: string | null;
  /** Quantas vezes seguidas o mesmo presente foi enviado pela mesma pessoa. */
  combo?: number;
  /** Muda a cada novo combo para reiniciar o tempo na tela. */
  bump?: number;
};

type Props = { event: GiftEvent | null; onDone: () => void };

const BIG = new Set(["epic", "legendary", "mythic"]);

/** Presente estilo TikTok: banner com combo no canto + explosão em tela cheia só nos grandes. */
export function GiftAnimation({ event, onDone }: Props) {
  const [phase, setPhase] = useState<"in" | "out">("in");
  const meta = useMemo(() => (event ? getGiftMeta(event.name) : null), [event?.name]);
  const big = !!meta && BIG.has(meta.rarity);

  // Toca som/vibração só no primeiro envio do combo.
  useEffect(() => {
    if (!event || !meta) return;
    try { navigator.vibrate?.(big ? [30, 40, 70] : 15); } catch { /* noop */ }
    playGiftSound(meta.rarity);
  }, [event?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tempo curto na tela; cada combo reinicia o relógio.
  useEffect(() => {
    if (!event) return;
    setPhase("in");
    const life = big && (event.combo ?? 1) === 1 ? 2400 : 1700;
    const outT = setTimeout(() => setPhase("out"), life);
    const doneT = setTimeout(onDone, life + 300);
    return () => { clearTimeout(outT); clearTimeout(doneT); };
  }, [event?.id, event?.bump, big, onDone]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!event || !meta) return null;
  const rarity = RARITY_STYLE[meta.rarity];
  const combo = event.combo ?? 1;
  const parts = meta.particles ?? [event.emoji];
  const count = meta.rarity === "mythic" ? 46 : meta.rarity === "legendary" ? 34 : 22;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {big && (combo === 1) && (
        <div className={cn("absolute inset-0 transition-opacity duration-300", phase === "in" ? "opacity-100" : "opacity-0")}>
          <div className="absolute inset-0" style={{ background: `radial-gradient(55% 45% at 50% 45%, ${meta.color}40 0%, transparent 70%)` }} />
          <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
            {[0, 0.2, 0.4].map((d) => (
              <span key={d} className="gift-ring absolute left-1/2 top-1/2 block h-40 w-40 rounded-full border-2"
                style={{ borderColor: meta.color, animationDelay: `${d}s`, boxShadow: `0 0 40px ${meta.color}` }} />
            ))}
            <span className="gift-rays absolute left-1/2 top-1/2 block h-[140vmax] w-[140vmax]"
              style={{ background: `repeating-conic-gradient(from 0deg, ${meta.color}30 0deg 6deg, transparent 6deg 18deg)`, maskImage: "radial-gradient(circle, black 0%, transparent 55%)", WebkitMaskImage: "radial-gradient(circle, black 0%, transparent 55%)" }} />
            <div className="gift-pop relative -translate-x-1/2 -translate-y-1/2 text-[9rem] leading-none" style={{ filter: `drop-shadow(0 0 28px ${meta.color})` }}>{event.emoji}</div>
          </div>
          {Array.from({ length: count }).map((_, i) => {
            const anim = meta.style === "meteor" ? "gift-meteor" : meta.style === "burst" ? "gift-burst" : meta.style === "orbit" ? "gift-orbit" : meta.style === "throne" ? "gift-throne" : "gift-float";
            const style = {
              left: `${5 + Math.random() * 90}%`, bottom: "-10%", fontSize: 20 + Math.random() * 26,
              animationDelay: `${Math.random() * 0.5}s`, animationDuration: `${1.6 + Math.random() * 0.8}s`,
              filter: `drop-shadow(0 0 8px ${meta.color})`,
              ["--drift" as string]: `${(Math.random() - 0.5) * 140}px`,
              ["--rot" as string]: `${(Math.random() - 0.5) * 60}deg`,
            } as React.CSSProperties;
            return <span key={i} className={cn("absolute", anim)} style={style} aria-hidden>{parts[i % parts.length]}</span>;
          })}
        </div>
      )}

      {/* Banner de combo (todos os presentes) */}
      <div className={cn(
        "absolute left-2 top-[34%] transition-all duration-300",
        phase === "in" ? "translate-x-0 opacity-100" : "-translate-x-6 opacity-0",
      )}>
        <div key={`p-${event.id}`} className="gift-slide flex items-center gap-2 rounded-full py-1 pl-1 pr-3 backdrop-blur-md"
          style={{ background: `linear-gradient(90deg, ${meta.color}cc, rgba(0,0,0,0.45))`, boxShadow: rarity.glow }}>
          <UserAvatar avatarPath={event.senderAvatar ?? null} displayName={event.senderName ?? "?"} className="h-9 w-9 ring-2 ring-white/70" />
          <div className="min-w-0 max-w-[9.5rem] leading-tight">
            <div className="truncate text-[13px] font-bold text-white">{event.senderName ?? "Alguém"}</div>
            <div className="truncate text-[11px] text-white/85">enviou {event.name}</div>
          </div>
          <span className="text-4xl leading-none -my-2 gift-pop" style={{ filter: `drop-shadow(0 0 10px ${meta.color})` }}>{event.emoji}</span>
          <span key={`c-${event.bump ?? 0}`} className="gift-combo ml-1 font-display text-2xl font-black italic text-white"
            style={{ textShadow: `0 0 12px ${meta.color}, 0 2px 0 rgba(0,0,0,0.5)` }}>
            x{combo}
          </span>
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
