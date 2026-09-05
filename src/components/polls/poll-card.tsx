import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchPoll, pollTimeLeft, votePoll } from "@/lib/polls";

/** Enquete com voto único e definitivo. O resultado aparece depois de votar (ou ao encerrar). */
export function PollCard({
  pollId,
  currentUserId,
  compact,
}: {
  pollId: string;
  currentUserId: string | null;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["poll", pollId],
    queryFn: () => fetchPoll(pollId),
    staleTime: 30_000,
  });

  const vote = useMutation({
    mutationFn: async (index: number) => {
      if (!currentUserId) throw new Error("Entre para votar");
      await votePoll(pollId, index, currentUserId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["poll", pollId] }),
    onError: (e: any) => toast.error(e?.message ?? "Não foi possível votar"),
  });

  if (q.isLoading || !q.data) {
    return <div className={cn("rounded-2xl bg-[color:var(--surface-2)] animate-pulse", compact ? "h-28" : "h-40")} />;
  }

  const { poll, counts, myVote } = q.data;
  const time = pollTimeLeft(poll.closes_at);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const revealed = myVote !== null || time.closed;
  const maxVotes = Math.max(0, ...counts.values());

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-2)]/70 p-4",
        compact && "p-3.5",
      )}
    >
      {/* brilho lime sutil no topo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent"
      />

      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/15 text-primary">
          <BarChart3 className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-primary">Enquete</span>
        <span className="ml-auto flex items-center gap-1 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface)]/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Timer className="h-3 w-3" />
          {time.label}
        </span>
      </div>

      <div className={cn("mb-3.5 font-semibold leading-snug", compact ? "text-[15px]" : "text-[16px]")}>
        {poll.question}
      </div>

      <div className="space-y-2">
        {poll.options.map((opt, i) => {
          const votes = counts.get(i) ?? 0;
          const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
          const mine = myVote === i;
          const leader = revealed && votes === maxVotes && votes > 0;
          const disabled = revealed || time.closed || vote.isPending || !currentUserId;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => vote.mutate(i)}
              className={cn(
                "relative w-full overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-all duration-200",
                mine
                  ? "border-primary/70 shadow-[0_0_16px_-4px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                  : "border-[color:var(--hairline)]",
                !disabled && "active:scale-[0.99] hover:border-primary/50 hover:bg-primary/5",
              )}
            >
              {revealed ? (
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 transition-[width] duration-700 ease-out",
                    mine
                      ? "bg-gradient-to-r from-primary/30 to-primary/15"
                      : leader
                        ? "bg-[color:var(--surface-3,white/12)] bg-white/10"
                        : "bg-white/5",
                  )}
                  style={{ width: `${pct}%` }}
                />
              ) : null}
              <span className="relative flex items-center gap-2.5">
                {!revealed ? (
                  <span
                    className={cn(
                      "h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/50 transition-colors",
                      vote.isPending && "border-primary",
                    )}
                  />
                ) : null}
                <span className={cn("flex-1 truncate text-[13.5px]", mine && "font-semibold")}>{opt.text}</span>
                {mine ? (
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-black">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : null}
                {revealed ? (
                  <span
                    className={cn(
                      "tabular-nums text-[13px] font-bold",
                      mine ? "text-primary" : leader ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {pct}%
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-3 text-[11px] text-muted-foreground">
        <span className="tabular-nums font-medium">
          {total} voto{total === 1 ? "" : "s"}
        </span>
        {!revealed ? (
          <span>{currentUserId ? "Voto único e definitivo" : "Entre para votar"}</span>
        ) : time.closed ? (
          <span>Resultado final</span>
        ) : null}
      </div>
    </div>
  );
}
