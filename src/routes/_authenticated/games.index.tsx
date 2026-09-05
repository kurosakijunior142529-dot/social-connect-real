import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Gamepad2, Zap, Grid3x3, Snowflake, Brain, Crown, Bomb, Hash, CircleDot,
  Users, Disc3, Swords, Play, Flame, Trophy, Sparkles, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/games/")({
  component: GamesIndex,
  head: () => ({ meta: [{ title: "Jogos · vibely" }] }),
});

type Cat = "puzzle" | "classic" | "reflex";
const GAMES: { id: string; name: string; desc: string; icon: any; gradient: string; cat: Cat; badge?: string }[] = [
  { id: "chess", name: "Xadrez", desc: "vs IA · 3 níveis", icon: Crown, gradient: "from-slate-500 to-slate-800", cat: "classic", badge: "Novo" },
  { id: "tictactoe", name: "Jogo da Velha", desc: "vs IA · imbatível", icon: Hash, gradient: "from-blue-400 to-indigo-600", cat: "classic", badge: "Novo" },
  { id: "minesweeper", name: "Campo Minado", desc: "3 dificuldades", icon: Bomb, gradient: "from-red-500 to-orange-600", cat: "puzzle", badge: "Novo" },
  { id: "sudoku", name: "Sudoku", desc: "9x9 clássico", icon: Grid3x3, gradient: "from-teal-400 to-cyan-600", cat: "puzzle", badge: "Novo" },
  { id: "2048", name: "2048", desc: "Combine até 2048", icon: Grid3x3, gradient: "from-orange-400 to-pink-500", cat: "puzzle" },
  { id: "memory", name: "Memória", desc: "Encontre os pares", icon: Brain, gradient: "from-purple-400 to-indigo-600", cat: "puzzle" },
  { id: "snake", name: "Snake", desc: "Cresça sem morrer", icon: Snowflake, gradient: "from-green-400 to-emerald-600", cat: "reflex" },
  { id: "reaction", name: "Reação", desc: "Reflexos rápidos", icon: Zap, gradient: "from-yellow-400 to-orange-500", cat: "reflex" },
  { id: "connect-four", name: "Lig 4", desc: "Conecte quatro peças", icon: CircleDot, gradient: "from-red-500 to-yellow-400", cat: "classic", badge: "Novo" },
  { id: "pong", name: "Pong", desc: "Arcade de precisão", icon: Disc3, gradient: "from-emerald-400 to-zinc-800", cat: "reflex", badge: "Novo" },
];

const CAT_LABEL: Record<Cat, string> = { classic: "Clássicos", puzzle: "Puzzles", reflex: "Reflexos" };
const FILTERS: { id: Cat | "all"; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "classic", label: "Clássicos" },
  { id: "puzzle", label: "Puzzles" },
  { id: "reflex", label: "Reflexos" },
];

function GamesIndex() {
  const [filter, setFilter] = useState<Cat | "all">("all");
  const featured = GAMES.find((g) => g.id === "pong") ?? GAMES[0];
  const visible = filter === "all" ? GAMES : GAMES.filter((g) => g.cat === filter);

  return (
    <div className="px-4 pt-2 pb-8">
      {/* Header */}
      <header className="mb-4 flex items-center gap-3">
        <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elegant">
          <Gamepad2 className="h-6 w-6" />
          <span className="absolute -inset-1 -z-10 rounded-3xl bg-primary/40 blur-lg animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Jogos</h1>
          <p className="text-xs text-muted-foreground">10 jogos · ranking global · multiplayer online</p>
        </div>
      </header>

      {/* Destaque */}
      <Link
        to="/games/$id"
        params={{ id: featured.id }}
        className={cn(
          "group relative mb-5 block overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-elegant transition-transform active:scale-[0.99]",
          featured.gradient,
        )}
      >
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-sm" />
        <div className="absolute -bottom-14 -left-8 h-36 w-36 rounded-full bg-black/20 blur-md" />
        <div className="relative z-10 flex items-start justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">
            <Flame className="h-3 w-3 text-primary" /> Em alta
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-semibold backdrop-blur">
            <Trophy className="h-3 w-3" /> Ranking
          </span>
        </div>
        <div className="relative z-10 mt-8 flex items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-display font-bold">{featured.name}</div>
            <div className="text-xs text-white/80">{featured.desc}</div>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-elegant transition-transform group-active:scale-90">
            <Play className="h-5 w-5 fill-current" />
          </span>
        </div>
      </Link>

      {/* Filtros interativos */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all active:scale-95",
                active
                  ? "bg-primary text-primary-foreground shadow-elegant"
                  : "bg-[color:var(--surface)] text-muted-foreground hover:text-foreground",
              )}
            >
              {f.id === "all" ? <LayoutGrid className="h-3.5 w-3.5" /> : null}
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Grade de jogos */}
      <div className="grid grid-cols-2 gap-3">
        {visible.map((g) => (
          <Link
            key={g.id}
            to="/games/$id"
            params={{ id: g.id }}
            className={cn(
              "group relative overflow-hidden rounded-3xl bg-gradient-to-br p-4 aspect-[3/4] flex flex-col justify-between text-white shadow-elegant transition-all duration-300 hover:-translate-y-1 hover:shadow-lg active:scale-[0.97]",
              g.gradient,
            )}
          >
            {g.badge ? (
              <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-black/30 backdrop-blur font-semibold">
                <Sparkles className="h-2.5 w-2.5 text-primary" /> {g.badge}
              </span>
            ) : null}
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/25 backdrop-blur transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6">
              <g.icon className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold">{g.name}</div>
              <div className="text-[11px] text-white/80">{g.desc}</div>
              <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                {CAT_LABEL[g.cat]}
              </div>
            </div>
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
          </Link>
        ))}
      </div>

      {/* Extras */}
      <Link
        to="/games/pong"
        className="mt-5 flex items-center gap-4 rounded-3xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent border border-primary/30 p-4 shadow-elegant active:scale-[0.99] transition-transform"
      >
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Swords className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold">Ping Pong multiplayer</div>
          <div className="text-xs text-muted-foreground">Tempo real · poderes especiais · ranking e XP</div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full bg-primary text-primary-foreground font-semibold">Novo</span>
      </Link>

      <Link
        to="/games/xcloud"
        className="mt-3 flex items-center gap-4 rounded-3xl bg-gradient-to-br from-emerald-500/25 via-emerald-500/10 to-transparent border border-primary/25 p-4 shadow-elegant active:scale-[0.99] transition-transform"
      >
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Gamepad2 className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold">Xbox Cloud Gaming</div>
          <div className="text-xs text-muted-foreground">Jogos do Xbox na nuvem · sem baixar nada</div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full bg-primary text-primary-foreground font-semibold">Novo</span>
      </Link>

      <Link
        to="/games/online"
        className="mt-3 flex items-center gap-4 rounded-3xl bg-[color:var(--surface)] p-4 active:scale-[0.99] transition-transform"
      >
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[color:var(--surface-2)]">
          <Users className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold">Jogar com amigo</div>
          <div className="text-xs text-muted-foreground">Multiplayer online por código de sala</div>
        </div>
      </Link>
    </div>
  );
}
