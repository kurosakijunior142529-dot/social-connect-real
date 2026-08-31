import { useEffect } from "react";
import { useAchievements, useSyncAchievements } from "@/lib/gamification";
import { cn } from "@/lib/utils";
import { Trophy, Sparkles } from "lucide-react";

const TIER_STYLE: Record<string, { ring: string; glow: string; label: string }> = {
  bronze: {
    ring: "ring-amber-500/50",
    glow: "shadow-[0_0_18px_-4px_rgba(217,119,6,0.55)]",
    label: "text-amber-500",
  },
  prata: {
    ring: "ring-slate-200/60",
    glow: "shadow-[0_0_18px_-4px_rgba(203,213,225,0.55)]",
    label: "text-slate-300",
  },
  ouro: {
    ring: "ring-primary/70",
    glow: "shadow-[0_0_22px_-4px_color-mix(in_oklab,var(--primary)_60%,transparent)]",
    label: "text-primary",
  },
  diamante: {
    ring: "ring-cyan-300/70",
    glow: "shadow-[0_0_26px_-3px_rgba(103,232,249,0.6)]",
    label: "text-cyan-300",
  },
  lendario: {
    ring: "ring-fuchsia-400/70",
    glow: "shadow-[0_0_30px_-2px_rgba(232,121,249,0.65)]",
    label: "text-fuchsia-300",
  },
};

export function AchievementsCard({ userId, isMe }: { userId: string; isMe: boolean }) {
  const { data } = useAchievements(userId);
  const sync = useSyncAchievements();

  // O dono sincroniza ao abrir o próprio perfil: nada é concedido sem que a
  // métrica real no banco já tenha atingido o limite.
  useEffect(() => {
    if (isMe) sync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMe, userId]);

  if (!data) return null;

  const pct = Math.min(100, Math.round(((data.points % 100) / 100) * 100));

  return (
    <div className="relative overflow-hidden rounded-2xl p-4 space-y-3 glass ring-1 ring-[color:var(--hairline)]">
      {/* brilho ambiente do card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 h-40 w-64 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--gradient-brand, var(--primary))" }}
      />

      <div className="relative flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary achv-pulse">
          <Trophy className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold">Conquistas</span>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          {data.unlockedCount}/{data.total}
          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--surface-2)] px-2 py-0.5 font-semibold text-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> nível {data.level}
          </span>
        </span>
      </div>

      <div className="relative h-2 w-full rounded-full bg-[color:var(--surface-2)] overflow-hidden">
        <div
          className="achv-shine h-full rounded-full bg-gradient-brand transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="relative flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {data.items.map((a) => {
          const done = !!a.unlockedAt;
          const tier = TIER_STYLE[a.tier] ?? TIER_STYLE.ouro!;
          return (
            <div
              key={a.id}
              title={`${a.name} — ${a.description}${done ? "" : ` (${a.current}/${a.threshold})`}`}
              className={cn(
                "group relative shrink-0 w-[96px] overflow-hidden rounded-2xl p-2 text-center ring-1 transition-transform duration-300 hover:-translate-y-0.5",
                done
                  ? cn("achv-card bg-[color:var(--surface-2)] ring-2", tier.ring, tier.glow)
                  : "bg-[color:var(--surface)] ring-[color:var(--hairline)] opacity-55",
              )}
            >
              {done ? <span aria-hidden className="achv-sweep" /> : null}
              <div className={cn("relative text-2xl leading-none", done ? "achv-float" : "grayscale")}>{a.emoji}</div>
              <div className="relative mt-1 text-[10px] font-semibold leading-tight line-clamp-2">{a.name}</div>
              <div className={cn("relative text-[9px] tabular", done ? tier.label : "text-muted-foreground")}>
                {done ? `+${a.points}` : `${Math.min(a.current, a.threshold)}/${a.threshold}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
