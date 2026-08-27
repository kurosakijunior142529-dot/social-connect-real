import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Search, Swords, Trophy, Users, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedName } from "@/components/verified-badge";
import { POWERS, xpProgress } from "@/lib/pong/config";

export const Route = createFileRoute("/_authenticated/games/pong/")({
  component: PongLobby,
  head: () => ({
    meta: [
      { title: "Ping Pong multiplayer · vibely" },
      { name: "description", content: "Duelos de Ping Pong em tempo real com poderes especiais, ranking e XP." },
      { property: "og:title", content: "Ping Pong multiplayer · vibely" },
      { property: "og:description", content: "Duelos de Ping Pong em tempo real com poderes especiais, ranking e XP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("").toUpperCase();
}

function PongLobby() {
  const { user } = Route.useRouteContext() as any;
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const open = (room: string) => navigate({ to: "/games/pong/$room", params: { room }, search: { ai: undefined, lvl: undefined } });

  const stats = useQuery({
    queryKey: ["pong-stats", user.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pong_stats").select("*").eq("user_id", user.id).maybeSingle();
      return data ?? null;
    },
  });

  const ranking = useQuery({
    queryKey: ["pong-ranking"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pong_stats")
        .select("user_id, xp, level, wins, losses, best_streak")
        .order("xp", { ascending: false })
        .limit(10);
      const rows = (data ?? []) as any[];
      if (!rows.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url, is_verified, badge_variant")
        .in("id", rows.map((r) => r.user_id));
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) }));
    },
  });

  const history = useQuery({
    queryKey: ["pong-history", user.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pong_matches")
        .select("id, my_score, opponent_score, won, created_at, xp_gained")
        .order("created_at", { ascending: false })
        .limit(8);
      return (data ?? []) as any[];
    },
  });

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    void (supabase as any).rpc("pong_leave_queue");
  }, []);

  async function tick() {
    const { data, error } = await (supabase as any).rpc("pong_find_match");
    if (error) return;
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.status === "matched" && row.room) {
      if (timer.current) clearInterval(timer.current);
      setSearching(false);
      open(row.room);
    }
  }

  function startSearch() {
    setSearching(true);
    void tick();
    timer.current = setInterval(tick, 2000);
  }

  function cancelSearch() {
    setSearching(false);
    if (timer.current) clearInterval(timer.current);
    void (supabase as any).rpc("pong_leave_queue");
  }

  const xp = stats.data?.xp ?? 0;
  const prog = xpProgress(xp);

  return (
    <div className="pb-12">
      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/games" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-display font-semibold">Ping Pong</h1>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-6 px-4 pt-5">
        <section className="rounded-3xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Swords className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="text-base font-semibold">Nível {stats.data?.level ?? 1}</div>
              <div className="text-[11px] text-muted-foreground">
                {stats.data?.wins ?? 0}V · {stats.data?.losses ?? 0}D · sequência {stats.data?.streak ?? 0}
              </div>
            </div>
            <div className="text-right text-[11px] text-muted-foreground tabular">{xp} XP</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--surface-2)]">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${prog.pct}%` }} />
          </div>
        </section>

        {searching ? (
          <div className="rounded-3xl bg-[color:var(--surface)] p-6 text-center">
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
            <div className="mt-3 text-sm font-medium">Procurando adversário…</div>
            <p className="mt-1 text-[12px] text-muted-foreground">Você entra na partida assim que alguém aparecer.</p>
            <Button variant="ghost" className="mt-3" onClick={cancelSearch}>Cancelar</Button>
          </div>
        ) : (
          <Button className="h-12 w-full rounded-2xl text-base" onClick={startSearch}>
            <Search className="mr-2 h-5 w-5" /> Partida rápida
          </Button>
        )}

        <div className="space-y-3 rounded-2xl bg-[color:var(--surface)] p-4">
          <div className="text-sm font-medium">Jogar com amigo</div>
          <Button variant="secondary" className="h-11 w-full rounded-xl" onClick={() => open(randomCode())}>
            <Users className="mr-2 h-4 w-4" /> Criar sala e convidar
          </Button>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              maxLength={12}
              className="text-center font-mono uppercase tracking-widest"
            />
            <Button onClick={() => open(code.trim().toUpperCase())} disabled={!code.trim()}>Entrar</Button>
          </div>
        </div>

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Poderes disponíveis</h2>
          <div className="grid grid-cols-3 gap-2">
            {POWERS.map((p) => (
              <div key={p.id} className="rounded-2xl bg-[color:var(--surface)] p-3 text-center">
                <div className="text-xl">{p.emoji}</div>
                <div className="mt-1 text-[12px] font-medium">{p.name}</div>
                <div className="text-[10px] text-muted-foreground">{p.cooldown}s</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" /> Ranking global
          </h2>
          <div className="overflow-hidden rounded-2xl bg-[color:var(--surface)]">
            {ranking.isLoading ? (
              <div className="p-4 text-center text-[12px] text-muted-foreground">Carregando…</div>
            ) : !ranking.data?.length ? (
              <div className="p-4 text-center text-[12px] text-muted-foreground">Ninguém no ranking ainda. Seja o primeiro!</div>
            ) : (
              <ul className="divide-y divide-[color:var(--hairline)]">
                {ranking.data.map((r: any, i: number) => (
                  <li key={r.user_id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-5 text-center text-[12px] font-semibold tabular text-muted-foreground">{i + 1}</span>
                    <UserAvatar avatarPath={r.profile?.avatar_url} displayName={r.profile?.display_name ?? "?"} className="h-8 w-8" />
                    <div className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      <VerifiedName name={r.profile?.display_name ?? "Jogador"} verified={r.profile?.is_verified} badgeVariant={r.profile?.badge_variant} />
                    </div>
                    <span className="text-[11px] text-muted-foreground tabular">Nv {r.level} · {r.xp} XP</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Zap className="h-3.5 w-3.5" /> Últimas partidas
          </h2>
          <div className="overflow-hidden rounded-2xl bg-[color:var(--surface)]">
            {!history.data?.length ? (
              <div className="p-4 text-center text-[12px] text-muted-foreground">Nenhuma partida ainda.</div>
            ) : (
              <ul className="divide-y divide-[color:var(--hairline)]">
                {history.data.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-3 py-2.5 text-[13px]">
                    <span className={m.won ? "font-medium text-primary" : "text-muted-foreground"}>{m.won ? "Vitória" : "Derrota"}</span>
                    <span className="tabular">{m.my_score} — {m.opponent_score}</span>
                    <span className="text-[11px] text-muted-foreground tabular">+{m.xp_gained} XP</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
