import { createFileRoute, Link } from "@tanstack/react-router";
import { Gamepad2, Zap, Grid3x3, Snowflake, Brain } from "lucide-react";

export const Route = createFileRoute("/_authenticated/games/")({
  component: GamesIndex,
  head: () => ({ meta: [{ title: "Jogos · vibely" }] }),
});

const GAMES = [
  { id: "2048", name: "2048", desc: "Combine números até 2048", icon: Grid3x3, gradient: "from-orange-400 to-pink-500" },
  { id: "snake", name: "Snake", desc: "Cresça sem se morder", icon: Snowflake, gradient: "from-green-400 to-emerald-600" },
  { id: "memory", name: "Memória", desc: "Encontre os pares", icon: Brain, gradient: "from-purple-400 to-indigo-600" },
  { id: "reaction", name: "Reação", desc: "Reflexos rápidos", icon: Zap, gradient: "from-yellow-400 to-orange-500" },
] as const;

function GamesIndex() {
  return (
    <div className="px-4 pt-2 pb-8">
      <header className="mb-5 flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Gamepad2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-display font-semibold tracking-tight">Jogos</h1>
          <p className="text-xs text-muted-foreground">Suba no ranking global</p>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3">
        {GAMES.map((g) => (
          <Link
            key={g.id}
            to="/games/$id"
            params={{ id: g.id }}
            className={`group relative overflow-hidden rounded-3xl bg-gradient-to-br ${g.gradient} p-4 aspect-[3/4] flex flex-col justify-between text-white shadow-elegant transition-transform active:scale-[0.98]`}
          >
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
    </div>
  );
}
