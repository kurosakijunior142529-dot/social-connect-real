import { createFileRoute, ClientOnly, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Heart, Loader2, Lock, Maximize2, Share2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedName } from "@/components/verified-badge";
import { usePongMatch, PongCanvas } from "@/components/games/pong-online";
import { ARENAS, BALL_SKINS, FIELD, PADDLE_SKINS, POWERS, POWER_MAP, type PowerId } from "@/lib/pong/config";
import { rarityOf, RARITY_META, type Rarity } from "@/lib/pong/fx";
import {
  LOADOUT_SIZE, RARITY_FILTERS, isUnlocked, loadFavorites, loadLoadout, saveFavorites, saveLoadout, unlockLevel,
} from "@/lib/pong/loadout";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/games/pong/$room")({
  component: PongRoom,
  validateSearch: (s: Record<string, unknown>) => ({
    ai: s.ai === true || s.ai === "1" || s.ai === "true" ? true : undefined,
    lvl: typeof s.lvl === "number" ? s.lvl : typeof s.lvl === "string" ? Number(s.lvl) : undefined,
  }),
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
  const search = Route.useSearch();
  const { user } = Route.useRouteContext() as any;
  const navigate = useNavigate();
  const shellRef = useRef<HTMLDivElement | null>(null);

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

  const aiMode = !!search.ai;
  const match = usePongMatch(room, me, { ai: aiMode, aiLevel: (search.lvl ?? 2) as any });
  const {
    sim, impacts, opponent, connected, lag, opponentGone,
    phase, score, countdown, fxView, mySide, isHost,
    myPower, cooldownsRef, powerFeed, setTarget, choosePower, usePower, startMatch,
  } = match as any;

  /* ---------- loadout local ---------- */
  const [loadout, setLoadout] = useState<PowerId[]>([]);
  const [favs, setFavs] = useState<PowerId[]>([]);
  const [filter, setFilter] = useState<"todos" | "favoritos" | Rarity>("todos");
  const [detail, setDetail] = useState<PowerId | null>(null);

  useEffect(() => {
    setLoadout(loadLoadout(level));
    setFavs(loadFavorites());
  }, [level]);

  useEffect(() => {
    if (!myPower && loadout.length) choosePower(loadout[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadout]);

  function toggleEquip(id: PowerId) {
    if (!isUnlocked(id, level)) { setDetail(id); return; }
    setLoadout((cur) => {
      const next = cur.includes(id)
        ? cur.filter((p) => p !== id)
        : cur.length >= LOADOUT_SIZE ? [...cur.slice(1), id] : [...cur, id];
      saveLoadout(next);
      return next;
    });
  }
  function toggleFav(id: PowerId) {
    setFavs((cur) => {
      const next = cur.includes(id) ? cur.filter((p) => p !== id) : [...cur, id];
      saveFavorites(next);
      return next;
    });
  }

  const [arena, setArena] = useState("neon");
  const [paddleSkin, setPaddleSkin] = useState("aurora");
  const [ballSkin, setBallSkin] = useState("classic");
  const [result, setResult] = useState<{ won: boolean; xp: number; level: number } | null>(null);
  const recorded = useRef(false);

  const myScore = mySide === 0 ? score[0] : score[1];
  const oppScore = mySide === 0 ? score[1] : score[0];
  const inMatch = phase === "playing" || phase === "countdown";

  /* ---------- tela cheia + sem rolagem durante a partida ---------- */
  useEffect(() => {
    if (!inMatch) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [inMatch]);

  useEffect(() => {
    if (inMatch) return;
    if (typeof document !== "undefined" && document.fullscreenElement) void document.exitFullscreen?.();
  }, [inMatch]);

  async function goFullscreen() {
    try { await shellRef.current?.requestFullscreen?.(); } catch { /* sem suporte */ }
  }

  // registra resultado uma única vez por partida
  useEffect(() => {
    if (phase !== "over") {
      if (recorded.current) { recorded.current = false; setResult(null); }
      return;
    }
    if (recorded.current) return;
    recorded.current = true;
    const won = myScore > oppScore;
    if (aiMode) { setResult({ won, xp: 0, level }); return; }
    (async () => {
      const { data } = await (supabase as any).rpc("pong_record_result", {
        _room: room, _opponent: opponent?.id ?? null,
        _my_score: myScore, _opp_score: oppScore, _power: myPower, _arena: arena,
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
    void goFullscreen();
  }

  async function invite() {
    const url = `${window.location.origin}/games/pong/${room}`;
    try {
      if (navigator.share) await navigator.share({ title: "Ping Pong no vibely", text: "Bora um duelo?", url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copiado"); }
    } catch { /* cancelado */ }
  }

  const waiting = !opponent;
  const myFx = fxView[mySide];
  const activeFx = POWERS.filter((p) => ((myFx as any)?.[p.id] ?? 0) > 0);

  const visiblePowers = POWERS.filter((p) =>
    filter === "todos" ? true : filter === "favoritos" ? favs.includes(p.id as PowerId) : rarityOf(p.id as PowerId) === filter,
  );

  return (
    <div
      ref={shellRef}
      className={cn(
        "flex flex-col bg-[color:var(--surface)]",
        inMatch ? "fixed inset-0 z-50 h-[100dvh] overflow-hidden" : "min-h-[100dvh]",
      )}
      style={inMatch ? {
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      } : undefined}
    >
      {!inMatch ? (
        <header className="sticky top-0 z-20 glass-heavy hairline-b">
          <div className="flex h-14 items-center gap-3 px-4">
            <Link to="/games/pong" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]" aria-label="Sair">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{aiMode ? "Treino vs IA" : `Sala ${room}`}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {connected || aiMode ? <Wifi className="h-3 w-3 text-primary" /> : <WifiOff className="h-3 w-3 text-destructive" />}
                {aiMode ? "Partida local" : connected ? (isHost ? `Anfitrião · ${lag}ms` : `Conectado · ${lag}ms`) : "Reconectando…"}
              </div>
            </div>
            {!aiMode ? (
              <>
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
              </>
            ) : null}
          </div>
        </header>
      ) : null}

      {/* placar compacto */}
      <div className={cn("flex items-center justify-between gap-3 px-4", inMatch ? "py-1.5" : "py-3")}>
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar avatarPath={opponent?.avatar ?? null} displayName={opponent?.name ?? "?"} className="h-8 w-8" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">{opponent?.name ?? "Aguardando…"}</div>
            {!inMatch ? <div className="text-[11px] text-muted-foreground">Adversário</div> : null}
          </div>
        </div>
        <div className="rounded-2xl bg-[color:var(--surface-2)] px-4 py-1 text-center">
          <div className="text-xl font-semibold tabular">
            {myScore} <span className="text-muted-foreground">—</span> {oppScore}
          </div>
          <div className="text-[10px] text-muted-foreground">até {FIELD.winScore}</div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 text-right">
            <div className="truncate text-[13px] font-medium"><VerifiedName name={me.name} /></div>
            {!inMatch ? <div className="text-[11px] text-muted-foreground">Você · Nv {level}</div> : null}
          </div>
          <UserAvatar avatarPath={me.avatar} displayName={me.name} className="h-8 w-8" />
        </div>
      </div>

      {/* campo — ocupa o máximo do espaço disponível */}
      <div className={cn("relative mx-auto w-full max-w-md px-3", inMatch ? "min-h-0 flex-1" : "flex-1")}>
        <div className={cn(
          "relative mx-auto w-full overflow-hidden rounded-3xl",
          inMatch ? "h-full" : "aspect-[1/1.5]",
        )}>
          <ClientOnly fallback={<div className="h-full w-full rounded-3xl bg-muted/30" />}>
            <PongCanvas
              simRef={sim}
              impactsRef={impacts}
              mySide={mySide}
              arena={arena}
              paddleSkin={paddleSkin}
              ballSkin={ballSkin}
              onTarget={setTarget}
            />
          </ClientOnly>

          {/* efeitos ativos */}
          {activeFx.length ? (
            <div className="pointer-events-none absolute left-2 top-2 flex max-w-[70%] flex-wrap gap-1">
              {activeFx.map((p) => (
                <span key={p.id} className="rounded-full bg-black/45 px-2 py-0.5 text-[10px] backdrop-blur" style={{ color: p.color }}>
                  {p.emoji} {Math.ceil((myFx as any)[p.id])}s
                </span>
              ))}
            </div>
          ) : null}

          {/* banner de poder */}
          <PowerBanner feed={powerFeed} mySide={mySide} />

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
                <Button className="mt-3" onClick={() => navigate({ to: "/games/pong" })}>Voltar ao lobby</Button>
              </div>
            </div>
          ) : null}

          {phase === "lobby" ? (
            <div className="absolute inset-0 grid place-items-center bg-background/70 p-6 text-center backdrop-blur">
              <div className="w-full">
                {waiting && !aiMode ? (
                  <>
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
                    <div className="mt-3 text-sm font-medium">Esperando o adversário…</div>
                    <p className="mt-1 text-[12px] text-muted-foreground">Compartilhe o código <b>{room}</b>.</p>
                  </>
                ) : (
                  <>
                    <div className="text-sm font-medium">Tudo pronto!</div>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      Equipe até {LOADOUT_SIZE} poderes abaixo e {isHost ? "inicie a partida." : "aguarde o anfitrião."}
                    </p>
                    {isHost ? (
                      <Button className="mt-3 w-full gap-2" onClick={() => { startMatch(); void goFullscreen(); }} disabled={!loadout.length}>
                        <Maximize2 className="h-4 w-4" /> Começar em tela cheia
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
                {result && result.xp ? <div className="mt-2 text-[12px] text-primary">+{result.xp} XP · Nível {result.level}</div> : null}
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" className="flex-1" onClick={() => navigate({ to: "/games/pong" })}>Sair</Button>
                  {isHost ? <Button className="flex-1" onClick={playAgain}>Revanche</Button> : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* HUD fixa de poderes equipados */}
      <div className={cn("mx-auto w-full max-w-md px-3", inMatch ? "pb-1 pt-2" : "pt-3")}>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: LOADOUT_SIZE }).map((_, i) => {
            const id = loadout[i];
            return (
              <PowerSlot
                key={id ?? `empty-${i}`}
                id={id}
                selected={id === myPower}
                cooldownsRef={cooldownsRef}
                onTap={() => {
                  if (!id) return;
                  if (id !== myPower) { choosePower(id); return; }
                  usePower(id);
                }}
                onLong={() => id && setDetail(id)}
                playing={phase === "playing"}
              />
            );
          })}
        </div>
      </div>

      {/* fora da partida: coleção de poderes + skins */}
      {!inMatch ? (
        <div className="mx-auto w-full max-w-md space-y-3 px-3 pb-6 pt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Escolha seus poderes</div>

          <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1">
            {RARITY_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={cn(
                  "shrink-0 snap-start rounded-full px-3 py-1 text-[11px] font-medium transition",
                  filter === f.id ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)] text-muted-foreground",
                )}
                style={filter === f.id && f.color ? { background: f.color, color: "#0a0a0b" } : undefined}
              >
                {f.name}
              </button>
            ))}
          </div>

          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
            {visiblePowers.map((p) => {
              const id = p.id as PowerId;
              const locked = !isUnlocked(id, level);
              const equipped = loadout.includes(id);
              const r = RARITY_META[rarityOf(id)];
              return (
                <div key={id} className="w-[92px] shrink-0 snap-start">
                  <button
                    onClick={() => toggleEquip(id)}
                    onContextMenu={(e) => { e.preventDefault(); setDetail(id); }}
                    className={cn(
                      "relative w-full rounded-2xl px-1.5 py-2 text-center transition active:scale-95",
                      equipped ? "" : "bg-[color:var(--surface-2)]",
                      locked ? "opacity-55" : "",
                    )}
                    style={equipped ? { background: `color-mix(in srgb, ${p.color} 22%, var(--surface-2))`, boxShadow: `0 0 0 2px ${p.color} inset` } : undefined}
                  >
                    <div className="text-xl">{locked ? <Lock className="mx-auto h-5 w-5" /> : p.emoji}</div>
                    <div className="truncate text-[10px] font-medium">{p.name}</div>
                    <div className="text-[9px]" style={{ color: r.color }}>{r.name} · {p.cooldown}s</div>
                    {locked ? <div className="mt-0.5 text-[9px] text-muted-foreground">Nv {unlockLevel(id)}</div> : null}
                  </button>
                  <button
                    onClick={() => toggleFav(id)}
                    className="mt-1 flex w-full items-center justify-center gap-1 rounded-full bg-[color:var(--surface-2)] py-0.5 text-[10px] text-muted-foreground"
                  >
                    <Heart className={cn("h-3 w-3", favs.includes(id) && "fill-current text-amber-400")} />
                  </button>
                </div>
              );
            })}
          </div>

          {detail ? (
            <div className="rounded-2xl bg-[color:var(--surface-2)] p-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: POWER_MAP[detail].color }}>
                {POWER_MAP[detail].emoji} {POWER_MAP[detail].name}
                <span className="rounded-full bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wide" style={{ color: RARITY_META[rarityOf(detail)].color }}>
                  {RARITY_META[rarityOf(detail)].name}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{POWER_MAP[detail].desc}</p>
              <div className="mt-1 text-[10px] text-muted-foreground">
                recarga {POWER_MAP[detail].cooldown}s ·{" "}
                {isUnlocked(detail, level) ? "desbloqueado" : `desbloqueia no nível ${unlockLevel(detail)}`}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2">
            <Selector label="Arena" value={arena} onChange={setArena} items={ARENAS} level={level} />
            <Selector label="Raquete" value={paddleSkin} onChange={setPaddleSkin} items={PADDLE_SKINS} level={level} />
            <Selector label="Bola" value={ballSkin} onChange={setBallSkin} items={BALL_SKINS} level={level} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PowerBanner({ feed, mySide }: { feed: { id: PowerId; side: 0 | 1; t: number } | null; mySide: 0 | 1 }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!feed) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1200);
    return () => clearTimeout(t);
  }, [feed?.t]);
  if (!feed || !show) return null;
  const p = POWER_MAP[feed.id];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 grid place-items-center">
      <div
        className="animate-scale-in rounded-2xl px-4 py-1.5 text-center text-sm font-semibold backdrop-blur"
        style={{ background: `color-mix(in srgb, ${p.color} 28%, rgba(0,0,0,0.5))`, color: p.color }}
      >
        {p.emoji} {p.name}
        <div className="text-[10px] font-normal opacity-80">{feed.side === mySide ? "você" : "adversário"}</div>
      </div>
    </div>
  );
}

function PowerSlot({
  id, selected, cooldownsRef, onTap, onLong, playing,
}: {
  id?: PowerId;
  selected: boolean;
  cooldownsRef: React.MutableRefObject<Partial<Record<PowerId, number>>>;
  onTap: () => void;
  onLong: () => void;
  playing: boolean;
}) {
  const [left, setLeft] = useState(0);
  const longRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    const t = setInterval(() => {
      const until = cooldownsRef.current?.[id] ?? 0;
      setLeft(Math.max(0, (until - Date.now()) / 1000));
    }, 100);
    return () => clearInterval(t);
  }, [id, cooldownsRef]);

  if (!id) {
    return <div className="grid h-16 place-items-center rounded-2xl border border-dashed border-white/10 text-[10px] text-muted-foreground">vazio</div>;
  }
  const p = POWER_MAP[id];
  const total = p.cooldown || 1;
  const pct = Math.max(0, Math.min(1, left / total));
  const ready = left <= 0;

  return (
    <button
      onPointerDown={() => { longRef.current = setTimeout(onLong, 450); }}
      onPointerUp={() => { if (longRef.current) { clearTimeout(longRef.current); longRef.current = null; } }}
      onPointerLeave={() => { if (longRef.current) { clearTimeout(longRef.current); longRef.current = null; } }}
      onClick={onTap}
      aria-label={`${p.name}${ready ? "" : ` recarregando ${Math.ceil(left)}s`}`}
      className={cn(
        "relative grid h-16 place-items-center rounded-2xl transition active:scale-95",
        ready ? "" : "opacity-60",
      )}
      style={{
        background: `conic-gradient(${p.color} ${(1 - pct) * 360}deg, color-mix(in srgb, ${p.color} 14%, var(--surface-2)) 0deg)`,
        boxShadow: selected ? `0 0 0 2px ${p.color} inset, 0 0 18px -6px ${p.color}` : undefined,
      }}
    >
      <span className="grid h-[54px] w-[54px] place-items-center rounded-xl bg-[color:var(--surface-2)]">
        <span className="text-center leading-tight">
          <span className="block text-lg">{p.emoji}</span>
          <span className="block text-[9px] font-semibold tabular">
            {!ready ? `${Math.ceil(left)}s` : selected ? (playing ? "USAR" : "PRONTO") : p.name.slice(0, 7)}
          </span>
        </span>
      </span>
    </button>
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
