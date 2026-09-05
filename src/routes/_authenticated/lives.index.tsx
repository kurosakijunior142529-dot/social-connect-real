import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radio, Sparkles, Search, Users, Play, History } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { formatViewers } from "@/lib/live-utils";
import { fetchActiveLives, fetchPastLives, timeOnAir, type LiveFeedRow } from "@/lib/lives-feed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lives/")({
  head: () => ({
    meta: [
      { title: "Lives — Vibely" },
      { name: "description", content: "Descubra transmissões ao vivo agora." },
      { property: "og:title", content: "Lives — Vibely" },
      { property: "og:description", content: "Descubra transmissões ao vivo agora." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LivesFeed,
});

function LivesFeed() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");

  const live = useQuery({
    queryKey: ["lives-feed", "live"],
    queryFn: () => fetchActiveLives(60),
    refetchInterval: 15000,
  });

  const past = useQuery({
    queryKey: ["lives-feed", "past"],
    queryFn: () => fetchPastLives(20),
  });

  const matches = (r: LiveFeedRow) =>
    !q.trim() ||
    r.title?.toLowerCase().includes(q.toLowerCase()) ||
    r.host?.username?.toLowerCase().includes(q.toLowerCase()) ||
    (r.category ?? "").toLowerCase().includes(q.toLowerCase());

  const allLives = (live.data ?? []).filter(matches);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of live.data ?? []) if (r.category) set.add(r.category);
    return Array.from(set).sort();
  }, [live.data]);

  const lives = cat === "all" ? allLives : allLives.filter((r) => r.category === cat);
  const [featured, ...rest] = lives;
  const olds = (past.data ?? []).filter(matches);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary text-[11px] uppercase tracking-[0.2em] font-semibold">
            <Radio className="h-3.5 w-3.5" /> Lives
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mt-1">Transmissões ao vivo</h1>
          <p className="text-sm text-muted-foreground">
            {allLives.length > 0 ? `${allLives.length} transmitindo agora` : "Descubra criadores ao vivo ou reveja replays."}
          </p>
        </div>
        <Link to="/lives/new">
          <Button className="rounded-full gap-2 shadow-elegant">
            <Sparkles className="h-4 w-4" /> Ir ao vivo
          </Button>
        </Link>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título, criador ou categoria…"
          className="pl-9 rounded-full bg-background"
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
      ) : lives.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {featured ? <FeaturedLive r={featured} /> : null}
          {rest.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {rest.map((r) => (
                <LiveCard key={r.id} r={r} live />
              ))}
            </div>
          )}
        </div>
      )}

      {olds.length > 0 && (
        <section className="pt-2">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" /> Replays
          </h2>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            {olds.map((r) => (
              <div key={r.id} className="w-[220px] shrink-0">
                <LiveCard r={r} compact />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CatPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize transition-colors border",
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
  return r.thumbnail_url ? (
    <img src={r.thumbnail_url} alt={r.title} loading="lazy" className={cn("w-full h-full object-cover", className)} />
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
        <div className="absolute top-3 left-3 flex items-center gap-2">
          <LiveBadge />
          <span className="rounded-md bg-black/60 text-white text-[11px] px-2 py-0.5 flex items-center gap-1">
            <Users className="h-3 w-3" /> {formatViewers(r.viewer_count ?? 0)}
          </span>
          <span className="rounded-md bg-black/60 text-white/80 text-[11px] px-2 py-0.5">{timeOnAir(r.started_at)}</span>
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
              {r.category ? <span className="opacity-60">· {r.category}</span> : null}
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
      className="group block rounded-2xl overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)] hover:border-primary/40 hover:shadow-elegant transition"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        <Cover r={r} className="group-hover:scale-[1.03] transition duration-500" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80" />
        {live ? <span className="absolute top-2 left-2"><LiveBadge /></span> : (
          <span className="absolute top-2 left-2 rounded-md bg-black/70 text-white/80 text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5">
            Replay
          </span>
        )}
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
              {r.category ? <span className="opacity-70">· {r.category}</span> : null}
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

function EmptyState() {
  return (
    <div className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-10 text-center">
      <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-transparent">
        <Radio className="h-8 w-8 text-primary" />
      </div>
      <h3 className="font-semibold text-lg">Ninguém ao vivo agora</h3>
      <p className="text-sm text-muted-foreground mt-1">Seja você o primeiro a transmitir para a comunidade.</p>
      <Link to="/lives/new">
        <Button className="mt-4 rounded-full">Ir ao vivo</Button>
      </Link>
    </div>
  );
}
