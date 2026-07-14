import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trophy, Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Game2048, GameSnake, GameMemory, GameReaction } from "@/components/games/games";
import { UserAvatar } from "@/components/user-avatar";

const GAME_META: Record<string, { name: string; scoreLabel: string }> = {
  "2048": { name: "2048", scoreLabel: "pts" },
  "snake": { name: "Snake", scoreLabel: "frutas" },
  "memory": { name: "Memória", scoreLabel: "pts" },
  "reaction": { name: "Reação", scoreLabel: "pts" },
};

export const Route = createFileRoute("/_authenticated/games/$id")({
  loader: ({ params }) => {
    if (!GAME_META[params.id]) throw notFound();
    return { id: params.id };
  },
  component: GamePage,
  head: ({ params }) => ({ meta: [{ title: `${GAME_META[params.id]?.name ?? "Jogo"} · vibely` }] }),
  notFoundComponent: () => (
    <div className="p-8 text-center">
      <p className="mb-3">Jogo não encontrado.</p>
      <Link to="/games" className="text-primary underline">Voltar para Jogos</Link>
    </div>
  ),
});

function GamePage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const meta = GAME_META[id];
  const qc = useQueryClient();

  const leaderboard = useQuery({
    queryKey: ["leaderboard", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("game_scores")
        .select("id, score, user_id, created_at")
        .eq("game", id)
        .order("score", { ascending: false })
        .limit(20);
      if (error) throw error;
      const rows = data ?? [];
      if (!rows.length) return [] as any[];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", userIds);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
  });

  const saveScore = useMutation({
    mutationFn: async (score: number) => {
      const { error } = await supabase
        .from("game_scores")
        .insert({ user_id: user.id, game: id, score });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaderboard", id] }),
  });

  const onGameOver = (score: number) => {
    if (score > 0) saveScore.mutate(score);
  };

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/games" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-display font-semibold">{meta.name}</h1>
        </div>
      </header>

      <div className="px-4 pt-4">
        {id === "2048" ? <Game2048 onGameOver={onGameOver} /> : null}
        {id === "snake" ? <GameSnake onGameOver={onGameOver} /> : null}
        {id === "memory" ? <GameMemory onGameOver={onGameOver} /> : null}
        {id === "reaction" ? <GameReaction onGameOver={onGameOver} /> : null}
      </div>

      <section className="px-4 pt-8">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ranking global</h2>
        </div>
        {leaderboard.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
        ) : (leaderboard.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Seja o primeiro a pontuar!</p>
        ) : (
          <ol className="space-y-1.5">
            {leaderboard.data!.map((r, i) => (
              <li
                key={r.id}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                  r.user_id === user.id ? "bg-primary/10 ring-1 ring-primary/40" : "bg-[color:var(--surface)]"
                }`}
              >
                <div className="w-6 text-center text-sm font-bold tabular text-muted-foreground">
                  {i < 3 ? <Medal className={`inline h-4 w-4 ${i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-300" : "text-orange-400"}`} /> : i + 1}
                </div>
                <UserAvatar avatarPath={r.profile?.avatar_url} displayName={r.profile?.display_name ?? "?"} className="h-9 w-9" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.profile?.display_name ?? "Anônimo"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">@{r.profile?.username ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-bold tabular">{r.score}</div>
                  <div className="text-[10px] text-muted-foreground">{meta.scoreLabel}</div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
