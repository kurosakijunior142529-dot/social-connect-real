import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Loader2, Share2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedName } from "@/components/verified-badge";
import { PongCanvas, usePongMatch } from "@/components/games/pong-online";
import { ARENAS, BALL_SKINS, FIELD, PADDLE_SKINS, POWERS, POWER_CATEGORIES, POWER_MAP, type PowerCategory, type PowerId } from "@/lib/pong/config";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/games/pong/$room")({
  component: PongRoom,
  head: () => ({
    meta: [
      { title: "Partida de Ping Pong · vibely" },
      { name: "description", content: "Duelo de Ping Pong em tempo real com poderes especiais." },
      { property: "og:title", content: "Partida de Ping Pong · vibely" },
      { property: "og:description", content: "Duelo de Ping Pong em tempo real com poderes especiais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PongRoom() {
  const { room } = Route.useParams();
  const { user } = Route.useRouteContext() as any;
  const navigate = useNavigate();

  const profile = useQuery({
    queryKey: ["profile-min", user.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle();
      return data;
    },
  });

  const stats = useQuery({
    queryKey: ["pong-stats", user.id],
    queryFn: async () => {
      const { data } = await (supabase as any).from("pong_stats").select("*").eq("user_id", user.id).maybeSingle();
      return data ?? null;
    },
  });
  const level = stats.data?.level ?? 1;

  const me = useMemo(
    () => ({ id: user.id, name: profile.data?.display_name ?? "Jogador", avatar: profile.data?.avatar_url ?? null }),
    [user.id, profile.data?.display_name, profile.data?.avatar_url],
  );

  const match = usePongMatch(room, me);
  const {
    sim, impacts, opponent, connected, lag, opponentGone,
    phase, score, countdown, fxView, mySide, isHost,
    myPower, cooldown, cooldownTotal, setTarget, choosePower, usePower, startMatch,
  } = match;

  const [cat, setCat] = useState<PowerCategory>("ataque");
  const [arena, setArena] = useState("neon");
  const [paddleSkin, setPaddleSkin] = useState("aurora");
  const [ballSkin, setBallSkin] = useState("classic");
  const [result, setResult] = useState<{ won: boolean; xp: number; level: number } | null>(null);
  const recorded = useRef(false);

  const myScore = mySide === 0 ? score[0] : score[1];
  const oppScore = mySide === 0 ? score[1] : score[0];

  // registra resultado uma única vez ao fim da partida
  useEffect(() => {
    if (phase !== "over" || recorded.current) return;
    recorded.current = true;
    const won = myScore > oppScore;
    (async () => {
      const { data } = await (supabase as any).rpc("pong_record_result", {
        _room: room,
        _opponent: opponent?.id ?? null,
        _my_score: myScore,
        _opp_score: oppScore,
        _power: myPower,
        _arena: arena,
      });
      const row = Array.isArray(data) ? data[0] : data;
      setResult({ won, xp: row?.xp_gained ?? 0, level: row?.level ?? level });
      void stats.refetch();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function playAgain() {
    recorded.current = false;
    setResult(null);
    startMatch();
  }

  async function invite() {
    const url = `${window.location.origin}/games/pong/${room}`;
    try {
      if (navigator.share) await navigator.share({ title: "Ping Pong no vibely", text: "Bora um duelo?", url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copiado"); }
    } catch { /* cancelado */ }
  }

  const waiting = !opponent;
  const powerDef = myPower ? POWER_MAP[myPower] : null;
  const myFx = fxView[mySide];
  const activeFx = POWERS.filter((p) => ((myFx as any)?.[p.id] ?? 0) > 0);
  const cdPct = powerDef ? Math.max(0, Math.min(1, cooldown / (cooldownTotal || powerDef.cooldown))) : 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[color:var(--surface)]">
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link to="/games/pong" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Sair">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">Sala {room}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {connected ? <Wifi className="h-3 w-3 text-primary" /> : <WifiOff className="h-3 w-3 text-destructive" />}
              {connected ? (isHost ? `Anfitrião · ${lag}ms` : `Conectado · ${lag}ms`) : "Reconectando…"}
            </div>
          </div>
          <button onClick={invite} className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Convidar">
            <Share2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => { void navigator.clipboard.writeText(room); toast.success("Código copiado"); }}
            className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]"
            aria-label="Copiar código"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* placar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar avatarPath={opponent?.avatar ?? null} displayName={opponent?.name ?? "?"} className="h-9 w-9" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{opponent?.name ?? "Aguardando…"}</div>
            <div className="text-[11px] text-muted-foreground">Adversário</div>
          </div>
        </div>
        <div className="rounded-2xl bg-[color:var(--surface-2)] px-4 py-1.5 text-center">
          <div className="text-xl font-semibold tabular">
            {myScore} <span className="text-muted-foreground">—</span> {oppScore}
          </div>
          <div className="text-[10px] text-muted-foreground">até {FIELD.winScore}</div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 text-right">
            <div className="truncate text-[13px] font-medium">
              <VerifiedName name={me.name} />
            </div>
            <div className="text-[11px] text-muted-foreground">Você · Nv {level}</div>
          </div>
          <UserAvatar avatarPath={me.avatar} displayName={me.name} className="h-9 w-9" />
        </div>
      </div>

      {/* campo */}
      <div className="relative mx-auto w-full max-w-md flex-1 px-3">
        <div className="relative mx-auto aspect-[1/1.5] w-full overflow-hidden rounded-3xl">
          <PongCanvas
            simRef={sim}
            impactsRef={impacts}
            mySide={mySide}
            arena={arena}
            paddleSkin={paddleSkin}
            ballSkin={ballSkin}
            onTarget={setTarget}
          />

          {phase === "countdown" ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div key={countdown} className="animate-scale-in text-6xl font-display font-semibold text-primary-foreground drop-shadow-lg">
                {countdown || "Vai!"}
              </div>
            </div>
          ) : null}

          {opponentGone && phase !== "over" ? (
            <div className="absolute inset-0 grid place-items-center bg-background/70 p-6 text-center backdrop-blur">
              <div>
                <div className="text-base font-semibold">O adversário saiu</div>
                <p className="mt-1 text-[12px] text-muted-foreground">Aguarde a reconexão ou volte ao lobby.</p>
                <Button className="mt-3" onClick={() => navigate({ to: "/games/pong" })}>Voltar ao lobby</Button>
              </div>
            </div>
          ) : null}

          {phase === "lobby" ? (
            <div className="absolute inset-0 grid place-items-center bg-background/70 p-6 text-center backdrop-blur">
              <div className="w-full">
                {waiting ? (
                  <>
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                    <div className="mt-3 text-sm font-medium">Esperando o adversário…</div>
                    <p className="mt-1 text-[12px] text-muted-foreground">Compartilhe o código <b>{room}</b>.</p>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium">Tudo pronto!</div>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Escolha seu poder abaixo e {isHost ? "inicie a partida." : "aguarde o anfitrião iniciar."}
                    </p>
                    {isHost ? (
                      <Button className="mt-3 w-full" onClick={startMatch} disabled={!myPower}>
                        {myPower ? "Começar partida" : "Escolha um poder"}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}

          {phase === "over" ? (
            <div className="absolute inset-0 grid place-items-center bg-background/80 p-6 text-center backdrop-blur">
              <div className="w-full">
                <div className="text-2xl font-display font-semibold">{myScore > oppScore ? "Vitória! 🏆" : "Derrota"}</div>
                <div className="mt-1 text-sm text-muted-foreground tabular">{myScore} — {oppScore}</div>
                {result ? (
                  <div className="mt-2 text-[12px] text-primary">+{result.xp} XP · Nível {result.level}</div>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => navigate({ to: "/games/pong" })}>Sair</Button>
                  {isHost ? <Button className="flex-1" onClick={playAgain}>Revanche</Button> : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* HUD: poder + efeitos */}
      <div className="mx-auto w-full max-w-md space-y-3 px-3 py-4">
        {activeFx.length ? (
          <div className="flex flex-wrap gap-1.5">
            {activeFx.map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-1 rounded-full bg-[color:var(--surface-2)] px-2.5 py-1 text-[11px]"
                style={{ color: p.color }}
              >
                {p.emoji} {p.name}
                <b className="tabular">{Math.ceil((myFx as any)[p.id])}s</b>
              </span>
            ))}
          </div>
        ) : null}

        {/* botão de uso com anel de recarga */}
        <div className="flex items-center gap-3">
          <button
            onClick={usePower}
            disabled={!powerDef || cooldown > 0 || phase !== "playing"}
            aria-label={powerDef ? `Usar ${powerDef.name}` : "Escolha um poder"}
            className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full transition active:scale-95 disabled:opacity-60"
            style={{
              background: powerDef
                ? `conic-gradient(${powerDef.color} ${(1 - cdPct) * 360}deg, color-mix(in srgb, ${powerDef.color} 18%, transparent) 0deg)`
                : "var(--surface-2)",
              boxShadow: powerDef && cooldown === 0 && phase === "playing" ? `0 0 24px -4px ${powerDef.color}` : undefined,
            }}
          >
            <span className="grid h-[68px] w-[68px] place-items-center rounded-full bg-[color:var(--surface-2)]">
              {powerDef ? (
                <span className="text-center leading-tight">
                  <span className="block text-2xl">{powerDef.emoji}</span>
                  <span className="block text-[10px] font-semibold tabular">
                    {cooldown > 0 ? `${Math.ceil(cooldown)}s` : "USAR"}
                  </span>
                </span>
              ) : (
                <span className="px-1 text-[10px] text-muted-foreground">Escolher</span>
              )}
            </span>
          </button>

          <div className="min-w-0 flex-1 rounded-2xl bg-[color:var(--surface-2)] p-3">
            {powerDef ? (
              <>
                <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: powerDef.color }}>
                  {powerDef.name}
                  <span className="rounded-full bg-background/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {powerDef.category}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{powerDef.desc}</p>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {powerDef.target === "enemy" ? "Afeta o rival" : powerDef.target === "ball" ? "Afeta a bola" : "Afeta você"} ·{" "}
                  {powerDef.duration ? `${powerDef.duration}s de efeito` : "instantâneo"} · recarga {powerDef.cooldown}s
                </div>
              </>
            ) : (
              <p className="text-[12px] text-muted-foreground">Escolha um dos {POWERS.length} poderes abaixo para levar ao duelo.</p>
            )}
          </div>
        </div>

        {/* seleção de poderes por categoria */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
            {POWER_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition",
                  cat === c.id ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)] text-muted-foreground",
                )}
              >
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {POWERS.filter((p) => p.category === cat).map((p) => (
              <button
                key={p.id}
                onClick={() => choosePower(p.id as PowerId)}
                disabled={phase === "playing" || phase === "countdown"}
                className={cn(
                  "relative rounded-2xl px-1.5 py-2 text-center transition active:scale-95 disabled:opacity-50",
                  myPower === p.id ? "ring-2" : "bg-[color:var(--surface-2)]",
                )}
                style={
                  myPower === p.id
                    ? { background: `color-mix(in srgb, ${p.color} 22%, var(--surface-2))`, boxShadow: `0 0 0 2px ${p.color} inset` }
                    : undefined
                }
                title={p.desc}
              >
                <div className="text-xl">{p.emoji}</div>
                <div className="truncate text-[10px] font-medium">{p.name}</div>
                <div className="text-[9px] text-muted-foreground">
                  {"★".repeat(p.tier)} · {p.cooldown}s
                </div>
              </button>
            ))}
          </div>
        </div>



        <div className="grid grid-cols-3 gap-2">
          <Selector label="Arena" value={arena} onChange={setArena} items={ARENAS} level={level} />
          <Selector label="Raquete" value={paddleSkin} onChange={setPaddleSkin} items={PADDLE_SKINS} level={level} />
          <Selector label="Bola" value={ballSkin} onChange={setBallSkin} items={BALL_SKINS} level={level} />
        </div>
      </div>
    </div>
  );
}

function Selector({
  label, value, onChange, items, level,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  items: { id: string; name: string; unlockLevel: number }[];
  level: number;
}) {
  return (
    <label className="rounded-2xl bg-[color:var(--surface-2)] p-2">
      <div className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent px-1 py-1 text-[13px] outline-none"
      >
        {items.map((i) => (
          <option key={i.id} value={i.id} disabled={level < i.unlockLevel}>
            {i.name}{level < i.unlockLevel ? ` (Nv ${i.unlockLevel})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
