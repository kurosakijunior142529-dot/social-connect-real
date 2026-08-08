import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trophy, Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Game2048, GameSnake, GameMemory, GameReaction } from "@/components/games/games";
import { GameTicTacToe } from "@/components/games/tictactoe";
import { GameMinesweeper } from "@/components/games/minesweeper";
import { GameSudoku } from "@/components/games/sudoku";
import { GameChess } from "@/components/games/chess";
import { UserAvatar } from "@/components/user-avatar";
import { GameConnectFour, GamePong } from "@/components/games/arcade";

const GAME_META: Record<string, { name: string; scoreLabel: string }> = {
  "2048": { name: "2048", scoreLabel: "pts" },
  "snake": { name: "Snake", scoreLabel: "frutas" },
  "memory": { name: "Memória", scoreLabel: "pts" },
  "reaction": { name: "Reação", scoreLabel: "pts" },
  "tictactoe": { name: "Jogo da Velha", scoreLabel: "pts" },
  "minesweeper": { name: "Campo Minado", scoreLabel: "pts" },
  "sudoku": { name: "Sudoku", scoreLabel: "pts" },
  "chess": { name: "Xadrez", scoreLabel: "pts" },
  "connect-four": { name: "Lig 4", scoreLabel: "vitórias" },
  "pong": { name: "Pong", scoreLabel: "rebates" },
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

type Period = "global" | "weekly" | "monthly";

const PERIOD_LABEL: Record<Period, string> = {
  global: "Global",
  weekly: "Semanal",
  monthly: "Mensal",
};

function GamePage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const meta = GAME_META[id];
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("global");

  const leaderboard = useQuery({
    queryKey: ["leaderboard", id, period],
    queryFn: async () => {
      let q = supabase
        .from("game_scores")
        .select("id, score, user_id, created_at, updated_at")
        .eq("game", id)
        .order("score", { ascending: false })
        .limit(100);
      if (period !== "global") {
        const days = period === "weekly" ? 7 : 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        q = q.gte("updated_at", since);
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (!rows.length) return [] as any[];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified, badge_variant")
        .in("id", userIds);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
    staleTime: 30_000,
  });

  const myBest = useQuery({
    queryKey: ["my-best", id, user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("game_scores")
        .select("score")
        .eq("game", id)
        .eq("user_id", user.id)
        .maybeSingle();
      return data?.score ?? 0;
    },
  });

  const saveScore = useMutation({
    mutationFn: async (score: number) => {
      // Only the personal best is kept — the function never lowers an existing record.
      const { error } = await supabase.rpc("submit_game_score", { _game: id, _score: score });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaderboard", id] });
      qc.invalidateQueries({ queryKey: ["my-best", id, user.id] });
    },
  });

  const onGameOver = (score: number) => {
    if (score > 0) saveScore.mutate(score);
  };

  const rows = leaderboard.data ?? [];
  const myIndex = rows.findIndex((r: any) => r.user_id === user.id);

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/games" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-display font-semibold">{meta.name}</h1>
          <div className="ml-auto text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Meu recorde</div>
            <div className="text-sm font-bold tabular">{(myBest.data ?? 0).toLocaleString("pt-BR")}</div>
          </div>
        </div>
      </header>

      <div className="px-4 pt-4">
        {id === "2048" ? <Game2048 onGameOver={onGameOver} /> : null}
        {id === "snake" ? <GameSnake onGameOver={onGameOver} /> : null}
        {id === "memory" ? <GameMemory onGameOver={onGameOver} /> : null}
        {id === "reaction" ? <GameReaction onGameOver={onGameOver} /> : null}
        {id === "tictactoe" ? <GameTicTacToe onGameOver={onGameOver} /> : null}
        {id === "minesweeper" ? <GameMinesweeper onGameOver={onGameOver} /> : null}
        {id === "sudoku" ? <GameSudoku onGameOver={onGameOver} /> : null}
        {id === "chess" ? <GameChess onGameOver={onGameOver} /> : null}
        {id === "connect-four" ? <GameConnectFour onGameOver={onGameOver} /> : null}
        {id === "pong" ? <GamePong onGameOver={onGameOver} /> : null}
      </div>

      <section className="px-4 pt-8">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ranking</h2>
          {myIndex >= 0 ? (
            <span className="ml-auto rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
              Minha posição: #{myIndex + 1}
            </span>
          ) : null}
        </div>

        <div className="mb-3 inline-flex w-full rounded-full bg-[color:var(--surface-2)] p-1 text-xs">
          {(["global", "weekly", "monthly"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 rounded-full px-3 py-1.5 font-medium transition ${
                period === p ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              }`}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>

        {leaderboard.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Seja o primeiro a pontuar!</p>
        ) : (
          <ol className="space-y-1.5">
            {rows.slice(0, 20).map((r: any, i: number) => (
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
        {myIndex >= 20 ? (
          <p className="pt-3 text-center text-[11px] text-muted-foreground">
            Você está em #{myIndex + 1} com {rows[myIndex].score} {meta.scoreLabel}
          </p>
        ) : null}
      </section>
    </div>
  );
}
