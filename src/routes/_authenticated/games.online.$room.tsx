import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, RefreshCcw, Users, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

export const Route = createFileRoute("/_authenticated/games/online/$room")({
  ssr: false,
  component: OnlineRoom,
  head: ({ params }) => ({ meta: [{ title: `Sala ${params.room} · vibely` }] }),
});

type Cell = "X" | "O" | null;
type Player = { id: string; name: string; avatar: string | null; symbol: "X" | "O" };
type GameState = { board: Cell[]; turn: "X" | "O"; startedBy: "X" | "O" };

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
function winnerOf(b: Cell[]): { who: Cell | "draw"; line: number[] | null } | null {
  for (const line of LINES) {
    const [a, c, d] = line;
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { who: b[a], line };
  }
  return b.every(Boolean) ? { who: "draw", line: null } : null;
}

function emptyState(startedBy: "X" | "O" = "X"): GameState {
  return { board: Array(9).fill(null), turn: startedBy, startedBy };
}

function OnlineRoom() {
  const { room } = Route.useParams();
  const { user } = Route.useRouteContext() as any;
  const [meProfile, setMeProfile] = useState<{ display_name: string | null; username: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setMeProfile(data ?? null));
  }, [user.id]);

  const me: Player = useMemo(
    () => ({
      id: user.id,
      name: meProfile?.display_name ?? meProfile?.username ?? "Você",
      avatar: meProfile?.avatar_url ?? null,
      symbol: "X",
    }),
    [user.id, meProfile],
  );

  const [connected, setConnected] = useState(false);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [state, setState] = useState<GameState>(() => emptyState("X"));
  const [score, setScore] = useState<{ X: number; O: number; draw: number }>({ X: 0, O: 0, draw: 0 });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/games/online/${room}` : "";

  // Realtime channel: presence + broadcast
  useEffect(() => {
    const ch = supabase.channel(`ttt:${room}`, {
      config: { presence: { key: user.id }, broadcast: { self: false } },
    });
    channelRef.current = ch;

    ch.on("presence", { event: "sync" }, () => {
      const raw = ch.presenceState() as Record<string, any[]>;
      const ordered = Object.entries(raw)
        .map(([id, arr]) => ({ id, meta: arr[0] }))
        .sort((a, b) => (a.meta?.joinedAt ?? 0) - (b.meta?.joinedAt ?? 0));
      const next: Record<string, Player> = {};
      ordered.slice(0, 2).forEach((p, i) => {
        next[p.id] = {
          id: p.id,
          name: p.meta?.name ?? "Jogador",
          avatar: p.meta?.avatar ?? null,
          symbol: i === 0 ? "X" : "O",
        };
      });
      setPlayers(next);
    });

    ch.on("broadcast", { event: "move" }, ({ payload }) => {
      setState(payload.state as GameState);
    });
    ch.on("broadcast", { event: "reset" }, ({ payload }) => {
      setState(payload.state as GameState);
    });
    ch.on("broadcast", { event: "score" }, ({ payload }) => {
      setScore(payload.score);
    });
    ch.on("broadcast", { event: "sync-request" }, () => {
      ch.send({ type: "broadcast", event: "sync-state", payload: { state: stateRef.current, score } });
    });
    ch.on("broadcast", { event: "sync-state" }, ({ payload }) => {
      setState(payload.state as GameState);
      if (payload.score) setScore(payload.score);
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        await ch.track({ name: me.name, avatar: me.avatar, joinedAt: Date.now() });
        // ask existing peers for state
        setTimeout(() => ch.send({ type: "broadcast", event: "sync-request", payload: {} }), 250);
      }
    });

    return () => {
      setConnected(false);
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, user.id]);

  const mySymbol = players[user.id]?.symbol;
  const opponent = Object.values(players).find((p) => p.id !== user.id);
  const w = winnerOf(state.board);
  const myTurn = mySymbol && !w && state.turn === mySymbol;

  const play = useCallback(
    (i: number) => {
      if (!mySymbol || w || state.board[i] || state.turn !== mySymbol) return;
      const board = state.board.slice();
      board[i] = mySymbol;
      const next: GameState = { ...state, board, turn: mySymbol === "X" ? "O" : "X" };
      setState(next);
      channelRef.current?.send({ type: "broadcast", event: "move", payload: { state: next } });

      const post = winnerOf(board);
      if (post) {
        const nextScore = { ...score };
        if (post.who === "draw") nextScore.draw += 1;
        else nextScore[post.who as "X" | "O"] += 1;
        setScore(nextScore);
        channelRef.current?.send({ type: "broadcast", event: "score", payload: { score: nextScore } });
      }
    },
    [mySymbol, state, w, score],
  );

  const resetBoard = useCallback(() => {
    // alternate who starts
    const nextStart: "X" | "O" = state.startedBy === "X" ? "O" : "X";
    const next = emptyState(nextStart);
    setState(next);
    channelRef.current?.send({ type: "broadcast", event: "reset", payload: { state: next } });
  }, [state.startedBy]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  const status = !mySymbol
    ? "Aguardando o pareamento…"
    : !opponent
    ? "Aguardando adversário…"
    : w
    ? w.who === "draw"
      ? "Empate!"
      : w.who === mySymbol
      ? "Você venceu 🎉"
      : `${opponent.name} venceu`
    : myTurn
    ? "Sua vez"
    : `Vez de ${opponent.name}`;

  return (
    <div className="pb-10">
      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/games/online" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-display font-semibold flex-1 truncate">Sala {room}</h1>
          <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full ${connected ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? "online" : "offline"}
          </span>
        </div>
      </header>

      <div className="px-4 pt-4 max-w-md mx-auto space-y-4">
        <div className="rounded-2xl bg-[color:var(--surface)] p-3 flex items-center gap-2">
          <div className="font-mono tracking-widest text-lg flex-1 text-center">{room}</div>
          <Button size="sm" variant="secondary" onClick={copyLink} className="gap-1.5">
            <Copy className="h-4 w-4" /> Compartilhar
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <PlayerCard player={players[user.id]} fallback={me} isYou score={mySymbol ? score[mySymbol] : 0} />
          <PlayerCard player={opponent} fallback={null} score={opponent?.symbol ? score[opponent.symbol] : 0} />
        </div>

        <div className="text-center text-sm text-muted-foreground min-h-[1.25rem]">{status}</div>

        <div className="grid grid-cols-3 gap-2 aspect-square">
          {state.board.map((c, i) => {
            const winLine = w && w.line?.includes(i);
            const disabled = !myTurn || !!c || !!w;
            return (
              <button
                key={i}
                disabled={disabled}
                onClick={() => play(i)}
                className={`rounded-2xl text-5xl font-bold flex items-center justify-center transition-all ${
                  winLine ? "bg-primary/20 ring-2 ring-primary" : "bg-[color:var(--surface)]"
                } ${disabled ? "opacity-90" : "hover:bg-[color:var(--surface-2)] active:scale-[0.97]"}`}
              >
                <span className={c === "X" ? "text-primary" : "text-orange-400"}>{c}</span>
              </button>
            );
          })}
        </div>

        <Button variant="secondary" className="w-full gap-2" onClick={resetBoard} disabled={!mySymbol}>
          <RefreshCcw className="h-4 w-4" /> Nova partida
        </Button>

        {!opponent ? (
          <div className="rounded-2xl bg-primary/10 border border-primary/30 p-4 text-sm text-center">
            <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
            Compartilhe o link ou o código <span className="font-mono font-bold">{room}</span> com um amigo.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlayerCard({
  player,
  fallback,
  isYou,
  score,
}: {
  player: Player | undefined;
  fallback: Player | null;
  isYou?: boolean;
  score: number;
}) {
  const p = player ?? fallback;
  return (
    <div className={`rounded-2xl p-3 flex items-center gap-3 ${p ? "bg-[color:var(--surface)]" : "bg-[color:var(--surface)]/50 border border-dashed border-white/10"}`}>
      {p ? (
        <UserAvatar avatarPath={p.avatar} displayName={p.name} className="h-10 w-10" />
      ) : (
        <div className="h-10 w-10 rounded-full bg-white/5 grid place-items-center text-muted-foreground">?</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{p ? p.name : "Aguardando…"}</div>
        <div className="text-[11px] text-muted-foreground">
          {p?.symbol ?? "—"} {isYou ? "· você" : ""}
        </div>
      </div>
      <div className="text-lg font-bold tabular">{score}</div>
    </div>
  );
}
