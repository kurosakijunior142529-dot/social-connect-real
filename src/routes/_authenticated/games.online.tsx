import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Users, Wifi, WifiOff, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/games/online")({
  component: OnlineLobby,
  head: () => ({ meta: [{ title: "Multiplayer online · vibely" }] }),
});

type Cell = "X" | "O" | null;
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
function winnerOf(b: Cell[]): Cell | "draw" | null {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every(Boolean) ? "draw" : null;
}
function randomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function OnlineLobby() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  return (
    <div className="pb-10">
      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/games" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-display font-semibold">Jogar com amigo</h1>
        </div>
      </header>

      <div className="px-4 pt-6 space-y-6 max-w-md mx-auto">
        <div className="rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-6 text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Users className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-display font-semibold">Jogo da Velha Online</h2>
          <p className="text-sm text-muted-foreground mt-1">Crie uma sala e envie o código para um amigo.</p>
        </div>

        <Button
          className="w-full h-12 rounded-2xl text-base"
          onClick={() => navigate({ to: "/games/online/$room", params: { room: randomCode() } })}
        >
          Criar sala
        </Button>

        <div className="rounded-2xl bg-[color:var(--surface)] p-4 space-y-3">
          <div className="text-sm font-medium">Entrar com código</div>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXXX"
              maxLength={12}
              className="uppercase tracking-widest text-center font-mono"
            />
            <Button
              onClick={() => code.trim() && navigate({ to: "/games/online/$room", params: { room: code.trim().toUpperCase() } })}
              disabled={!code.trim()}
            >
              Entrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
