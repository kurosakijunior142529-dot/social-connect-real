import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Sparkles, Search } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { formatViewers } from "@/lib/live-utils";

export const Route = createFileRoute("/_authenticated/lives/")({
  head: () => ({
    meta: [
      { title: "Lives — Vibely" },
      { name: "description", content: "Descubra transmissões ao vivo agora." },
      { property: "og:title", content: "Lives — Vibely" },
      { property: "og:description", content: "Descubra transmissões ao vivo agora." },
    ],
  }),
  component: LivesFeed,
});

function LivesFeed() {
  const [q, setQ] = useState("");
  const live = useQuery({
    queryKey: ["lives-feed", "live"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("lives")
        .select("id, host_id, title, category, tags, thumbnail_url, viewer_count, peak_viewer_count, started_at, language, age_restricted")
        .eq("status", "live")
        .order("viewer_count", { ascending: false })
        .limit(60);
      const rows = (data ?? []) as any[];
      if (!rows.length) return [];
      const ids = Array.from(new Set(rows.map((r) => r.host_id)));
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, host: map.get(r.host_id) }));
    },
    refetchInterval: 15000,
  });

  const past = useQuery({
    queryKey: ["lives-feed", "past"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("lives")
        .select("id, host_id, title, thumbnail_url, peak_viewer_count, ended_at")
        .eq("status", "ended")
        .order("ended_at", { ascending: false })
        .limit(20);
      const rows = (data ?? []) as any[];
      if (!rows.length) return [];
      const ids = Array.from(new Set(rows.map((r) => r.host_id)));
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, host: map.get(r.host_id) }));
    },
  });

  const filter = (r: any) =>
    !q.trim() ||
    r.title?.toLowerCase().includes(q.toLowerCase()) ||
    r.host?.username?.toLowerCase().includes(q.toLowerCase()) ||
    r.category?.toLowerCase().includes(q.toLowerCase());
  const lives = (live.data ?? []).filter(filter);
  const olds = (past.data ?? []).filter(filter);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary text-[11px] uppercase tracking-[0.2em] font-semibold">
            <Radio className="h-3.5 w-3.5" /> Lives
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mt-1">Transmissões ao vivo</h1>
          <p className="text-sm text-muted-foreground">Descubra criadores ao vivo agora ou reveja replays.</p>
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

      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Ao vivo
          </span>
          <span className="text-sm text-muted-foreground">{lives.length} agora</span>
        </div>
        {live.isLoading ? (
          <SkeletonGrid />
        ) : lives.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {lives.map((r: any) => (
              <LiveCard key={r.id} r={r} live />
            ))}
          </div>
        )}
      </section>

      {olds.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Lives passadas</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {olds.map((r: any) => (
              <LiveCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LiveCard({ r, live = false }: { r: any; live?: boolean }) {
  return (
    <Link
      to="/live/$id"
      params={{ id: r.id }}
      search={{ host: undefined }}
      className="group block rounded-2xl overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)] hover:border-primary/40 hover:shadow-elegant transition"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        {r.thumbnail_url ? (
          <img src={r.thumbnail_url} alt={r.title} className="w-full h-full object-cover group-hover:scale-[1.03] transition" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/5 to-black grid place-items-center">
            <Radio className="h-10 w-10 text-primary/70" />
          </div>
        )}
        {live && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Live
          </span>
        )}
        <span className="absolute bottom-2 right-2 text-[11px] font-semibold bg-black/70 text-white rounded px-1.5 py-0.5">
          {formatViewers((live ? r.viewer_count : r.peak_viewer_count) ?? 0)} {live ? "assistindo" : "pico"}
        </span>
      </div>
      <div className="p-3 space-y-1.5">
        <div className="flex items-start gap-2">
          <UserAvatar avatarPath={r.host?.avatar_url ?? null} displayName={r.host?.display_name ?? r.host?.username ?? "?"} className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate leading-tight">{r.title}</h3>
            <p className="text-[12px] text-muted-foreground truncate">
              {r.host?.display_name ?? r.host?.username ?? "Criador"}
              {r.category ? <span className="mx-1">·</span> : null}
              {r.category}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
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
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-10 text-center">
      <Radio className="h-10 w-10 text-primary mx-auto mb-3" />
      <h3 className="font-semibold">Ninguém ao vivo agora</h3>
      <p className="text-sm text-muted-foreground mt-1">Seja você o primeiro a transmitir.</p>
      <Link to="/lives/new">
        <Button className="mt-4 rounded-full">Ir ao vivo</Button>
      </Link>
    </div>
  );
}
