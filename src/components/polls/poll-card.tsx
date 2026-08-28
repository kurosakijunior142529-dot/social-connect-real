import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Check } from "lucide-react";
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

  return (
    <div className={cn("rounded-2xl border border-white/10 bg-[color:var(--surface-2)]/60 p-3", compact && "p-2.5")}>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <BarChart3 className="h-3.5 w-3.5" />
        <span>Enquete</span>
        <span>·</span>
        <span>{time.label}</span>
        {total > 0 ? <span>· {total} voto{total === 1 ? "" : "s"}</span> : null}
      </div>

      <div className={cn("mb-2.5 font-semibold leading-snug", compact ? "text-[14px]" : "text-[15px]")}>
        {poll.question}
      </div>

      <div className="space-y-1.5">
        {poll.options.map((opt, i) => {
          const votes = counts.get(i) ?? 0;
          const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
          const mine = myVote === i;
          const disabled = revealed || time.closed || vote.isPending || !currentUserId;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => vote.mutate(i)}
              className={cn(
                "relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-[13px] transition",
                mine ? "border-primary/60" : "border-white/10",
                !disabled && "active:scale-[0.99] hover:border-primary/40",
              )}
            >
              {revealed ? (
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-xl transition-[width] duration-500",
                    mine ? "bg-primary/25" : "bg-white/10",
                  )}
                  style={{ width: `${pct}%` }}
                />
              ) : null}
              <span className="relative flex items-center gap-2">
                <span className="flex-1 truncate">{opt.text}</span>
                {mine ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                {revealed ? <span className="tabular-nums text-[12px] text-muted-foreground">{pct}%</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {!revealed ? (
        <div className="pt-2 text-[11px] text-muted-foreground">
          {currentUserId ? "Seu voto é definitivo e não pode ser alterado." : "Entre para votar."}
        </div>
      ) : null}
    </div>
  );
}
