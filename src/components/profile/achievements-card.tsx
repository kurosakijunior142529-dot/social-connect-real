import { useEffect } from "react";
import { useAchievements, useSyncAchievements } from "@/lib/gamification";
import { cn } from "@/lib/utils";
import { Trophy } from "lucide-react";

const TIER_RING: Record<string, string> = {
  bronze: "ring-amber-500/40",
  prata: "ring-slate-300/40",
  ouro: "ring-primary/60",
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
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Conquistas</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {data.unlockedCount}/{data.total} · nível {data.level}
        </span>
      </div>

      <div className="h-1.5 w-full rounded-full bg-[color:var(--surface-2)] overflow-hidden">
        <div className="h-full rounded-full bg-gradient-brand transition-all" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {data.items.map((a) => {
          const done = !!a.unlockedAt;
          return (
            <div
              key={a.id}
              title={`${a.name} — ${a.description}${done ? "" : ` (${a.current}/${a.threshold})`}`}
              className={cn(
                "shrink-0 w-[92px] rounded-2xl p-2 text-center ring-1 transition",
                done
                  ? cn("bg-[color:var(--surface-2)] ring-2", TIER_RING[a.tier] ?? "ring-primary/40")
                  : "bg-[color:var(--surface)] ring-[color:var(--hairline)] opacity-55",
              )}
            >
              <div className={cn("text-2xl leading-none", !done && "grayscale")}>{a.emoji}</div>
              <div className="mt-1 text-[10px] font-semibold leading-tight line-clamp-2">{a.name}</div>
              <div className="text-[9px] text-muted-foreground tabular">
                {done ? `+${a.points}` : `${Math.min(a.current, a.threshold)}/${a.threshold}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
