import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AudioReactionsSheet } from "@/components/reels/audio-reactions-sheet";
import { isSoundOn, setSoundOn, subscribeSound } from "@/lib/media/sound-pref";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Radio, Users, Play } from "lucide-react";
import { ReelItem } from "@/components/reels/reel-item";
import { CommentsSheet } from "@/components/reels/comments-sheet";
import type { FeedPost } from "@/components/post-card";
import { useBlocks } from "@/hooks/use-blocks";
import { fetchActiveLives, timeOnAir, type LiveFeedRow } from "@/lib/lives-feed";
import { formatViewers } from "@/lib/live-utils";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { fetchVirFeed, virNotInterested } from "@/lib/vir";
import { fetchPostMedia, fetchRepostContext } from "@/lib/reels/carousel";

export const Route = createFileRoute("/_authenticated/reels")({
  validateSearch: (search: Record<string, unknown>) => ({
    post: typeof search.post === "string" ? search.post : undefined,
    together: typeof search.together === "string" ? search.together.slice(0, 16) : undefined,
  }),
  component: ReelsPage,
});

const PAGE = 8;

/** Reel já com o motivo da recomendação vindo do VIR. */
type RankedPost = FeedPost & { vir_reason?: string | null; vir_source?: string | null };

function ReelsPage() {
  const { user } = Route.useRouteContext();
  const { post: startPostId, together } = Route.useSearch();
  const blocks = useBlocks();
  const hidden = blocks.data?.hidden;
  const [muted, setMuted] = useState(() => !isSoundOn());
  const [tab, setTab] = useState<"fyp" | "live">("fyp");
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const unsub = subscribeSound((on) => setMuted(!on));
    return () => { unsub(); };
  }, []);
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);
  const [openAudioFor, setOpenAudioFor] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [code, setCode] = useState<string | null>(together ?? null);
  const [peers, setPeers] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const currentRef = useRef<string | null>(null);
  const remoteRef = useRef(false);
  useEffect(() => {
    if (!code) return;
    const ch = supabase.channel(`reels-together-${code}`, { config: { presence: { key: user.id }, broadcast: { self: false } } });
    ch.on("broadcast", { event: "goto" }, ({ payload }) => {
      const id = (payload as { postId?: string })?.postId;
      if (!id || id === currentRef.current) return;
      const el = scrollerRef.current?.querySelector(`[data-reel-id="${CSS.escape(id)}"]`);
      if (el) { remoteRef.current = true; currentRef.current = id; el.scrollIntoView({ behavior: "smooth" }); }
    });
    ch.on("presence", { event: "sync" }, () => setPeers(Math.max(0, Object.keys(ch.presenceState()).length - 1)));
    ch.subscribe((st) => { if (st === "SUBSCRIBED") void ch.track({ at: Date.now() }); });
    channelRef.current = ch;
    return () => { channelRef.current = null; void supabase.removeChannel(ch); };
  }, [code, user.id]);
  const startTogether = async () => {
    const c = code ?? Math.random().toString(36).slice(2, 10);
    setCode(c);
    const url = `${window.location.origin}/reels?together=${c}${currentRef.current ? `&post=${currentRef.current}` : ""}`;
    try {
      if (navigator.share) await navigator.share({ title: "Assistir Reels juntos no Vibely", url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copiado — mande para um amigo"); }
    } catch { /* cancelado */ }
  };

  const livesQ = useQuery({
    queryKey: ["reels-lives"],
    queryFn: () => fetchActiveLives(20),
    refetchInterval: 15000,
  });
  const lives = livesQ.data ?? [];
  const hasLives = lives.length > 0;
  useEffect(() => { if (!hasLives && tab === "live") setTab("fyp"); }, [hasLives, tab]);

  /**
   * Hidrata os ids devolvidos pelo VIR mantendo exatamente a ordem do ranking.
   * O backend decide o quê e em que ordem; aqui só buscamos o conteúdo.
   */
  const hydrate = useCallback(
    async (ids: string[], meta: Map<string, { reason: string | null; source: string | null }>) => {
      if (ids.length === 0) return [] as RankedPost[];
      const { data } = await supabase.from("posts").select("*").in("id", ids);
      let rows = (data ?? []) as any[];
      if (hidden && hidden.size > 0) rows = rows.filter((p) => !hidden.has(p.author_id));
      const byId = new Map(rows.map((p) => [p.id, p]));
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[];
      if (ordered.length === 0) return [] as RankedPost[];

      const postIds = ordered.map((p) => p.id);
      const authorIds = Array.from(new Set(ordered.map((p) => p.author_id)));
      const [profilesRes, likesCountRes, commentsCountRes, myLikesRes] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, badge_variant").in("id", authorIds),
        supabase.from("likes").select("post_id").in("post_id", postIds),
        supabase.from("comments").select("post_id").in("post_id", postIds),
        supabase.from("likes").select("post_id").eq("user_id", user.id).in("post_id", postIds),
      ]);
      const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const likesCount = new Map<string, number>();
      for (const l of likesCountRes.data ?? []) likesCount.set(l.post_id, (likesCount.get(l.post_id) ?? 0) + 1);
      const commentsCount = new Map<string, number>();
      for (const c of commentsCountRes.data ?? []) commentsCount.set(c.post_id, (commentsCount.get(c.post_id) ?? 0) + 1);
      const myLikes = new Set((myLikesRes.data ?? []).map((l: any) => l.post_id));

      return ordered.map<RankedPost>((p) => ({
        ...p,
        author: profiles.get(p.author_id) ?? null,
        likes_count: likesCount.get(p.id) ?? 0,
        comments_count: commentsCount.get(p.id) ?? 0,
        liked_by_me: myLikes.has(p.id),
        vir_reason: meta.get(p.id)?.reason ?? null,
        vir_source: meta.get(p.id)?.source ?? null,
      }));
    },
    [hidden, user.id],
  );

  const feed = useInfiniteQuery({
    queryKey: ["reels", user.id, hidden ? hidden.size : 0, startPostId ?? null],
    enabled: !!blocks.data,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    initialPageParam: 0,
    getNextPageParam: (last: RankedPost[], all: RankedPost[][]) =>
      last.length === 0 ? undefined : all.reduce((n, p) => n + p.length, 0),
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      // 1) ranking do VIR (relevância, qualidade, diversidade, descoberta,
      //    segunda chance, freshness — tudo calculado no backend).
      const ranked = await fetchVirFeed(PAGE, offset, "reel");
      const meta = new Map(ranked.map((r) => [r.post_id, { reason: r.reason, source: r.source }]));
      let ids = ranked.map((r) => r.post_id);

      // 2) fallback: se o VIR ainda não tem candidatos (conta nova, base vazia),
      //    completamos com conteúdo recente para nunca deixar a tela vazia.
      if (ids.length < PAGE) {
        const { data } = await supabase
          .from("posts")
          .select("id")
          .eq("media_type", "video")
          .eq("post_kind", "reel")
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE - 1);
        for (const row of data ?? []) if (!ids.includes(row.id)) ids.push(row.id);
      }

      // 3) vídeo aberto a partir do feed entra primeiro, sem sair do ranking.
      if (offset === 0 && startPostId) ids = [startPostId, ...ids.filter((id) => id !== startPostId)];

      return hydrate(ids, meta);
    },
  });

  const posts = useMemo(() => {
    const seen = new Set<string>();
    const out: RankedPost[] = [];
    for (const p of feed.data?.pages.flat() ?? []) {
      if (seen.has(p.id) || dismissed.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
    return out;
  }, [feed.data, dismissed]);

  const onNotInterested = useCallback((postId: string) => {
    setDismissed((prev) => new Set(prev).add(postId));
    void virNotInterested(postId);
  }, []);

  // Mídias extras (carrossel) e quem republicou — buscados em lote para os
  // Reels já carregados, sem alterar o feed tradicional.
  const postIds = useMemo(() => posts.map((p) => p.id), [posts]);
  const extras = useQuery({
    queryKey: ["reels-extras", postIds.join(",")],
    enabled: postIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [medias, reposts] = await Promise.all([
        fetchPostMedia(postIds),
        fetchRepostContext(postIds),
      ]);
      return { medias, reposts };
    },
  });

  const onScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (tab === "fyp" && el.clientHeight > 0) {
        const idx = Math.round(el.scrollTop / el.clientHeight);
        const id = posts[idx]?.id;
        if (id && id !== currentRef.current && Math.abs(el.scrollTop - idx * el.clientHeight) < 4) {
          currentRef.current = id;
          if (remoteRef.current) remoteRef.current = false;
          else void channelRef.current?.send({ type: "broadcast", event: "goto", payload: { postId: id } });
        }
      }
      if (el.scrollHeight - el.scrollTop - el.clientHeight > el.clientHeight * 2) return;
      if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
    },
    [feed, posts, tab],
  );

  return (
    <div className="relative h-dvh min-h-dvh w-full md:-mx-4 md:-mt-6 md:w-[calc(100%+2rem)]">
      {/* Header overlay */}
      <header className="absolute top-0 inset-x-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 pt-[env(safe-area-inset-top)] text-white">
        <Link
          to="/"
          className="md:hidden grid h-9 w-9 place-items-center rounded-full bg-black/30 backdrop-blur"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 flex items-center justify-center gap-5">
          <TabBtn active={tab === "fyp"} onClick={() => setTab("fyp")}>Para você</TabBtn>
          {hasLives ? (
            <TabBtn active={tab === "live"} onClick={() => setTab("live")}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Ao vivo
                <span className="text-[10px] opacity-80">{lives.length}</span>
              </span>
            </TabBtn>
          ) : null}
        </div>
        <button
          onClick={() => void startTogether()}
          aria-label="Assistir junto"
          className={cn("flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold backdrop-blur",
            code ? "bg-primary text-primary-foreground" : "bg-black/30 text-white")}
        >
          <Users className="h-4 w-4" />
          {code ? (peers > 0 ? `+${peers}` : "Juntos") : null}
        </button>
      </header>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="h-dvh min-h-dvh w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-black no-scrollbar rounded-none md:rounded-2xl"
      >
        {tab === "live" ? (
          lives.map((l) => <LiveReelCard key={l.id} l={l} />)
        ) : feed.isLoading ? (
          <div className="h-full grid place-items-center text-white/60 text-sm">Carregando vídeos…</div>
        ) : posts.length === 0 ? (
          <div className="h-full grid place-items-center text-white/70 text-center px-8">
            <div>
              <p className="text-lg font-semibold mb-1">Nenhum vídeo ainda</p>
              <p className="text-sm text-white/60">Publique um vídeo para vê-lo aqui.</p>
            </div>
          </div>
        ) : (
          posts.map((p) => (
            <ReelItem
              key={p.id}
              post={p}
              currentUserId={user.id}
              muted={muted}
              onToggleMute={() => setSoundOn(muted)}
              onOpenComments={(id) => setOpenCommentsFor(id)}
              onOpenAudio={(id) => setOpenAudioFor(id)}
              reason={p.vir_reason ?? null}
              onNotInterested={onNotInterested}
              medias={extras.data?.medias.get(p.id)}
              reposts={extras.data?.reposts.get(p.id)}
            />
          ))
        )}
      </div>

      <AudioReactionsSheet postId={openAudioFor} currentUserId={user.id} onClose={() => setOpenAudioFor(null)} />
      <CommentsSheet
        postId={openCommentsFor}
        currentUserId={user.id}
        onClose={() => setOpenCommentsFor(null)}
      />
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative py-1 text-[15px] font-semibold tracking-tight transition-colors drop-shadow",
        active ? "text-white" : "text-white/55 hover:text-white/80",
      )}
    >
      {children}
      <span
        className={cn(
          "absolute -bottom-0.5 left-1/2 h-[2px] -translate-x-1/2 rounded-full bg-white transition-all",
          active ? "w-6 opacity-100" : "w-0 opacity-0",
        )}
      />
    </button>
  );
}

function LiveReelCard({ l }: { l: LiveFeedRow }) {
  return (
    <section className="relative h-dvh min-h-dvh w-full shrink-0 snap-start snap-always overflow-hidden bg-black">
      {l.thumbnail_url ? (
        <img src={l.thumbnail_url} alt={l.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-black to-black" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />

      <div className="absolute left-4 top-[calc(4rem+env(safe-area-inset-top))] flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Ao vivo
        </span>
        <span className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white flex items-center gap-1">
          <Users className="h-3 w-3" /> {formatViewers(l.viewer_count ?? 0)}
        </span>
        <span className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white/75">{timeOnAir(l.started_at)}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-4 p-5 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <span className="absolute -inset-1 rounded-full bg-red-500/50 blur-[6px] animate-pulse" />
            <UserAvatar
              avatarPath={l.host?.avatar_url ?? null}
              displayName={l.host?.display_name ?? l.host?.username ?? "?"}
              className="relative h-12 w-12 ring-2 ring-red-500"
            />
          </div>
          <div className="min-w-0">
            <p className="text-white font-semibold truncate">{l.host?.display_name ?? l.host?.username ?? "Criador"}</p>
            {l.category ? <p className="text-white/60 text-xs truncate">{l.category}</p> : null}
          </div>
        </div>
        <h2 className="text-white text-xl font-bold leading-snug line-clamp-2">{l.title}</h2>
        <Link
          to="/live/$id"
          params={{ id: l.id }}
          search={{ host: undefined }}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-elegant"
        >
          <Play className="h-4 w-4" /> Entrar na live
        </Link>
      </div>

      <Radio className="absolute right-5 top-[calc(4rem+env(safe-area-inset-top))] h-5 w-5 text-white/40" />
    </section>
  );
}
