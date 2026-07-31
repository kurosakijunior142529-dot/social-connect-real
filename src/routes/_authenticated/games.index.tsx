import { createFileRoute, Link } from "@tanstack/react-router";
import { Gamepad2, Zap, Grid3x3, Snowflake, Brain, Crown, Bomb, Hash, CircleDot, Users, Disc3 } from "lucide-react";

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

function GamesIndex() {
  const grouped: Record<Cat, typeof GAMES> = { classic: [], puzzle: [], reflex: [] };
  GAMES.forEach((g) => grouped[g.cat].push(g));

  return (
    <div className="px-4 pt-2 pb-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elegant">
          <Gamepad2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Jogos</h1>
          <p className="text-xs text-muted-foreground">10 jogos · ranking global · multiplayer online</p>
        </div>
      </header>

      {(["classic", "puzzle", "reflex"] as Cat[]).map((cat) => (
        <section key={cat} className="mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">
            {CAT_LABEL[cat]}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {grouped[cat].map((g) => (
              <Link
                key={g.id}
                to="/games/$id"
                params={{ id: g.id }}
                className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br ${g.gradient} p-4 aspect-[3/4] flex flex-col justify-between text-white shadow-elegant transition-transform active:scale-[0.98]`}
              >
                {g.badge ? (
                  <span className="absolute top-2 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">
                    {g.badge}
                  </span>
                ) : null}
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/25 backdrop-blur">
                  <g.icon className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-lg font-semibold">{g.name}</div>
                  <div className="text-[11px] text-white/80">{g.desc}</div>
                </div>
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
              </Link>
            ))}
          </div>
        </section>
      ))}

      <Link
        to="/games/online"
        className="mt-4 flex items-center gap-4 rounded-3xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent border border-primary/30 p-4 shadow-elegant active:scale-[0.99] transition-transform"
      >
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Users className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold">Jogar com amigo</div>
          <div className="text-xs text-muted-foreground">Multiplayer online por código de sala</div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full bg-primary text-primary-foreground font-semibold">Novo</span>
      </Link>
    </div>
  );
}
