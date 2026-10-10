import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radio, Sparkles, Search, Users, Play, History, Flame, Heart, UserPlus, Grid3x3, Eye, MonitorPlay } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { formatViewers } from "@/lib/live-utils";
import {
  fetchActiveLives,
  fetchPastLives,
  fetchSocialGraph,
  replayDuration,
  timeOnAir,
  type LiveFeedRow,
} from "@/lib/lives-feed";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lives/")({
  head: () => ({
    meta: [
      { title: "Lives — Vibely" },
      { name: "description", content: "Central de transmissões ao vivo, replays e criadores do Vibely." },
      { property: "og:title", content: "Lives — Vibely" },
      { property: "og:description", content: "Central de transmissões ao vivo, replays e criadores do Vibely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LivesFeed,
});

function LivesFeed() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [fmt, setFmt] = useState<string>("all");

  const live = useQuery({
    queryKey: ["lives-feed", "live"],
    queryFn: () => fetchActiveLives(60),
    refetchInterval: 15000,
  });

  const past = useQuery({
    queryKey: ["lives-feed", "past"],
    queryFn: () => fetchPastLives(20),
  });

  const graph = useQuery({
    queryKey: ["lives-social-graph", user?.id ?? ""],
    queryFn: () => fetchSocialGraph(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const followingIds = useMemo(() => Array.from(graph.data?.following ?? []), [graph.data]);

  const followedCreators = useQuery({
    queryKey: ["lives-followed-creators", followingIds.slice(0, 12).join(",")],
    enabled: followingIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified, badge_variant")
        .in("id", followingIds.slice(0, 12));
      return data ?? [];
    },
  });

  const matches = (r: LiveFeedRow) =>
    !q.trim() ||
    r.title?.toLowerCase().includes(q.toLowerCase()) ||
    r.host?.username?.toLowerCase().includes(q.toLowerCase()) ||
    (r.category ?? "").toLowerCase().includes(q.toLowerCase());

  const allLivesRaw = (live.data ?? []).filter(matches);
  const allLives = fmt === "all" ? allLivesRaw : allLivesRaw.filter((r) => (r.orientation ?? "portrait") === fmt);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of live.data ?? []) if (r.category) set.add(r.category);
    return Array.from(set).sort();
  }, [live.data]);

  const lives = cat === "all" ? allLives : allLives.filter((r) => r.category === cat);
  const [featured, ...rest] = lives;

  const following = lives.filter((r) => graph.data?.following.has(r.host_id));
  const friends = lives.filter((r) => graph.data?.friends.has(r.host_id));
  const popular = [...lives].sort((a, b) => (b.viewer_count ?? 0) - (a.viewer_count ?? 0)).slice(0, 8);
  const recommended = lives
    .filter((r) => !graph.data?.following.has(r.host_id) && r.host_id !== user?.id)
    .slice(0, 8);
  const olds = (past.data ?? []).filter(matches);

  const hasLives = lives.length > 0;

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 pb-28 space-y-6">
      <header className="relative overflow-hidden rounded-[28px] border border-[color:var(--hairline)] bg-[color:var(--surface)] p-5 md:p-7">
        <div className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-10 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/12 border border-primary/30 px-2.5 py-1 text-primary text-[10.5px] uppercase tracking-[0.2em] font-bold">
              <span className="relative flex h-2 w-2"><span className="absolute inset-0 rounded-full bg-primary animate-ping" /><span className="relative h-2 w-2 rounded-full bg-primary" /></span>
              Lives
            </div>
            <h1 className="text-[26px] md:text-4xl font-bold mt-2 leading-tight tracking-tight">Central de transmissões</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {allLives.length > 0 ? `${allLives.length} transmitindo agora` : "Descubra criadores, reveja gravações ou comece a sua."}
            </p>
          </div>
          <Link to="/lives/new" className="shrink-0">
            <Button className="rounded-full gap-2 shadow-elegant h-11 px-5">
              <Sparkles className="h-4 w-4" /> Ir ao vivo
            </Button>
          </Link>
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-2">
          {[
            { icon: <Radio className="h-4 w-4" />, v: allLives.length, l: "Ao vivo" },
            { icon: <Users className="h-4 w-4" />, v: formatViewers(allLives.reduce((a, r) => a + (r.viewer_count ?? 0), 0)), l: "Assistindo" },
            { icon: <MonitorPlay className="h-4 w-4" />, v: allLives.filter((r) => r.orientation === "landscape").length, l: "Jogos/Tela" },
          ].map((k) => (
            <div key={k.l} className="rounded-2xl bg-background/60 backdrop-blur border border-[color:var(--hairline)] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">{k.icon}{k.l}</div>
              <p className="text-lg font-bold tabular-nums mt-0.5">{k.v}</p>
            </div>
          ))}
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {([
          ["all", "Todos formatos"],
          ["portrait", "Em pé"],
          ["landscape", "Deitado · jogos"],
          ["square", "Quadrado"],
        ] as const).map(([id, label]) => (
          <CatPill key={id} label={label} active={fmt === id} onClick={() => setFmt(id)} />
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título, criador ou categoria…"
          className="pl-9 h-11 rounded-full bg-background"
        />
      </div>

      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          <CatPill label="Todas" active={cat === "all"} onClick={() => setCat("all")} />
          {categories.map((c) => (
            <CatPill key={c} label={c} active={cat === c} onClick={() => setCat(c)} />
          ))}
        </div>
      )}

      {live.isLoading ? (
        <SkeletonGrid />
      ) : hasLives ? (
        <div className="space-y-8">
          <Section icon={<Radio className="h-4 w-4 text-primary" />} title="Ao vivo agora">
            <div className="space-y-4">
              {featured ? <FeaturedLive r={featured} /> : null}
              {rest.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rest.map((r) => (
                    <LiveCard key={r.id} r={r} live />
                  ))}
                </div>
              )}
            </div>
          </Section>

          {friends.length > 0 && (
            <Rail icon={<Heart className="h-4 w-4 text-primary" />} title="Amigos ao vivo" rows={friends} live />
          )}
          {following.length > 0 && (
            <Rail icon={<UserPlus className="h-4 w-4 text-primary" />} title="Seguindo" rows={following} live />
          )}
          {popular.length > 1 && (
            <Rail icon={<Flame className="h-4 w-4 text-primary" />} title="Populares" rows={popular} live />
          )}
          {recommended.length > 0 && (
            <Rail
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              title="Recomendadas para você"
              rows={recommended}
              live
            />
          )}
        </div>
      ) : (
        <CompactEmpty />
      )}

      {categories.length > 0 && (
        <Section icon={<Grid3x3 className="h-4 w-4 text-muted-foreground" />} title="Categorias">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {categories.map((c) => {
              const count = allLives.filter((r) => r.category === c).length;
              return (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-3 text-left hover:border-primary/40 transition"
                >
                  <p className="text-sm font-semibold capitalize truncate">{c}</p>
                  <p className="text-[11px] text-muted-foreground">{count} ao vivo</p>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {!hasLives && (followedCreators.data?.length ?? 0) > 0 && (
        <Section icon={<UserPlus className="h-4 w-4 text-muted-foreground" />} title="Criadores que você segue">
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            {(followedCreators.data ?? []).map((p: any) => (
              <Link
                key={p.id}
                to="/u/$username"
                params={{ username: p.username }}
                className="w-[92px] shrink-0 text-center"
              >
                <UserAvatar
                  avatarPath={p.avatar_url}
                  displayName={p.display_name ?? p.username}
                  className="h-16 w-16 mx-auto ring-2 ring-[color:var(--hairline)]"
                />
                <p className="mt-1.5 text-[12px] font-medium truncate flex items-center justify-center gap-0.5">
                  <span className="truncate">{p.display_name ?? p.username}</span>
                  {p.is_verified ? <VerifiedBadge variant={p.badge_variant} className="h-3 w-3 shrink-0" /> : null}
                </p>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {olds.length > 0 && (
        <Section icon={<History className="h-4 w-4 text-muted-foreground" />} title="Gravações recentes">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {olds.map((r) => (
              <ReplayCard key={r.id} r={r} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function Rail({
  icon,
  title,
  rows,
  live,
}: {
  icon: React.ReactNode;
  title: string;
  rows: LiveFeedRow[];
  live?: boolean;
}) {
  return (
    <Section icon={icon} title={title}>
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1 snap-x">
        {rows.map((r) => (
          <div key={r.id} className="w-[240px] shrink-0 snap-start">
            <LiveCard r={r} live={live} compact />
          </div>
        ))}
      </div>
    </Section>
  );
}

function CatPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-4 py-2 text-xs font-semibold capitalize transition-colors border",
        active
          ? "bg-primary text-primary-foreground border-transparent shadow-elegant"
          : "bg-[color:var(--surface)] text-muted-foreground border-[color:var(--hairline)] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5">
      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Ao vivo
    </span>
  );
}

function Cover({ r, className }: { r: LiveFeedRow; className?: string }) {
  const [broken, setBroken] = useState(false);
  return r.thumbnail_url && !broken ? (
    <img src={r.thumbnail_url} alt={r.title} loading="lazy" onError={() => setBroken(true)} className={cn("w-full h-full object-cover", className)} />
  ) : (
    <div className="w-full h-full bg-gradient-to-br from-primary/25 via-primary/5 to-black grid place-items-center">
      <Radio className="h-10 w-10 text-primary/70" />
    </div>
  );
}

function FeaturedLive({ r }: { r: LiveFeedRow }) {
  return (
    <Link
      to="/live/$id"
      params={{ id: r.id }}
      search={{ host: undefined }}
      className="group relative block overflow-hidden rounded-3xl border border-[color:var(--hairline)] hover:border-primary/50 transition shadow-elegant"
    >
      <div className="relative aspect-video md:aspect-[21/8] bg-black overflow-hidden">
        <Cover r={r} className="group-hover:scale-[1.02] transition duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap">
          <LiveBadge />
          <span className="rounded-md bg-black/60 text-white text-[11px] px-2 py-0.5 flex items-center gap-1">
            <Users className="h-3 w-3" /> {formatViewers(r.viewer_count ?? 0)}
          </span>
          <span className="rounded-md bg-black/60 text-white/80 text-[11px] px-2 py-0.5">{timeOnAir(r.started_at)}</span>
          {r.category ? (
            <span className="rounded-md bg-primary/85 text-primary-foreground text-[11px] font-semibold px-2 py-0.5 capitalize">
              {r.category}
            </span>
          ) : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 md:p-5 flex items-end gap-3">
          <div className="relative shrink-0">
            <span className="absolute -inset-1 rounded-full bg-primary/50 blur-[6px] animate-pulse" />
            <UserAvatar
              avatarPath={r.host?.avatar_url ?? null}
              displayName={r.host?.display_name ?? r.host?.username ?? "?"}
              className="relative h-12 w-12 ring-2 ring-primary"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-white text-lg md:text-2xl font-bold leading-tight truncate">{r.title}</h2>
            <p className="text-white/70 text-sm truncate flex items-center gap-1">
              {r.host?.display_name ?? r.host?.username ?? "Criador"}
              {r.host?.is_verified ? <VerifiedBadge variant={r.host?.badge_variant as any} className="h-3.5 w-3.5" /> : null}
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold">
            <Play className="h-4 w-4" /> Assistir agora
          </span>
        </div>
      </div>
    </Link>
  );
}

function LiveCard({ r, live = false, compact = false }: { r: LiveFeedRow; live?: boolean; compact?: boolean }) {
  return (
    <Link
      to="/live/$id"
      params={{ id: r.id }}
      search={{ host: undefined }}
      className="group block rounded-[20px] overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)] hover:border-primary/40 hover:shadow-elegant hover:-translate-y-0.5 active:scale-[0.98] transition duration-300"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        <Cover r={r} className="group-hover:scale-[1.03] transition duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80" />
        {live ? (
          <span className="absolute top-2 left-2">
            <LiveBadge />
          </span>
        ) : (
          <span className="absolute top-2 left-2 rounded-md bg-black/70 text-white/80 text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5">
            Gravação
          </span>
        )}
        {r.orientation === "landscape" ? (
          <span className="absolute top-2 left-[4.6rem] rounded-md bg-primary/90 text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 flex items-center gap-1"><MonitorPlay className="h-3 w-3" />16:9</span>
        ) : null}
        {r.category ? (
          <span className="absolute top-2 right-2 rounded-md bg-black/65 text-white/85 text-[10px] font-semibold px-1.5 py-0.5 capitalize">
            {r.category}
          </span>
        ) : null}
        <span className="absolute bottom-2 right-2 text-[11px] font-semibold bg-black/70 text-white rounded px-1.5 py-0.5 flex items-center gap-1">
          <Users className="h-3 w-3" />
          {formatViewers((live ? r.viewer_count : r.peak_viewer_count) ?? 0)}
        </span>
        {live ? (
          <span className="absolute bottom-2 left-2 text-[11px] bg-black/70 text-white/80 rounded px-1.5 py-0.5">
            {timeOnAir(r.started_at)}
          </span>
        ) : null}
      </div>
      <div className={cn("space-y-1.5", compact ? "p-2.5" : "p-3")}>
        <div className="flex items-start gap-2">
          <UserAvatar
            avatarPath={r.host?.avatar_url ?? null}
            displayName={r.host?.display_name ?? r.host?.username ?? "?"}
            className={cn("shrink-0", compact ? "h-7 w-7" : "h-8 w-8", live && "ring-2 ring-primary/60")}
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate leading-tight">{r.title}</h3>
            <p className="text-[12px] text-muted-foreground truncate flex items-center gap-1">
              {r.host?.display_name ?? r.host?.username ?? "Criador"}
              {r.host?.is_verified ? <VerifiedBadge variant={r.host?.badge_variant as any} className="h-3 w-3" /> : null}
            </p>
          </div>
        </div>
        {!compact && r.tags?.length ? (
          <div className="flex gap-1.5 flex-wrap">
            {r.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded-full bg-[color:var(--surface-2)] text-[10px] px-2 py-0.5 text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function ReplayCard({ r }: { r: LiveFeedRow }) {
  const dur = replayDuration(r.started_at, r.ended_at);
  return (
    <Link
      to="/live/$id"
      params={{ id: r.id }}
      search={{ host: undefined }}
      className="group block rounded-2xl overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)] hover:border-primary/40 transition"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        <Cover r={r} className="group-hover:scale-[1.03] transition duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute top-2 left-2 rounded-md bg-black/75 text-white/85 text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5">
          Gravação
        </span>
        {dur ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/75 text-white text-[11px] px-1.5 py-0.5">{dur}</span>
        ) : null}
        <span className="absolute inset-0 grid place-items-center opacity-0 group-hover:opacity-100 transition">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <Play className="h-5 w-5 fill-current" />
          </span>
        </span>
      </div>
      <div className="p-2.5 space-y-1">
        <h3 className="text-sm font-semibold truncate leading-tight">{r.title}</h3>
        <p className="text-[12px] text-muted-foreground truncate flex items-center gap-1">
          {r.host?.display_name ?? r.host?.username ?? "Criador"}
          {r.host?.is_verified ? <VerifiedBadge variant={r.host?.badge_variant as any} className="h-3 w-3" /> : null}
        </p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Eye className="h-3 w-3" /> {formatViewers(r.peak_viewer_count ?? r.viewer_count ?? 0)} visualizações
        </p>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="space-y-4">
      <div className="aspect-video md:aspect-[21/8] rounded-3xl bg-[color:var(--surface-2)] animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)] animate-pulse">
            <div className="aspect-video bg-[color:var(--surface-2)]" />
            <div className="p-3 space-y-2">
              <div className="h-8 w-8 rounded-full bg-[color:var(--surface-2)]" />
              <div className="h-3 w-3/4 bg-[color:var(--surface-2)] rounded" />
              <div className="h-2 w-1/2 bg-[color:var(--surface-2)] rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactEmpty() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-transparent">
        <Radio className="h-5 w-5 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">Ninguém ao vivo agora</p>
        <p className="text-[12px] text-muted-foreground truncate">Veja gravações abaixo ou comece a sua transmissão.</p>
      </div>
      <Link to="/lives/new" className="shrink-0">
        <Button size="sm" className="rounded-full">
          Ir ao vivo
        </Button>
      </Link>
    </div>
  );
}
