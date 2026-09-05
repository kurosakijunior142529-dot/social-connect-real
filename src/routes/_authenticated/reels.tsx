import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isSoundOn, setSoundOn, subscribeSound } from "@/lib/media/sound-pref";
import { useQuery } from "@tanstack/react-query";
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

export const Route = createFileRoute("/_authenticated/reels")({
  component: ReelsPage,
});

function ReelsPage() {
  const { user } = Route.useRouteContext();
  const blocks = useBlocks();
  const hidden = blocks.data?.hidden;
  const [muted, setMuted] = useState(() => !isSoundOn());
  const [tab, setTab] = useState<"fyp" | "live">("fyp");
  useEffect(() => {
    const unsub = subscribeSound((on) => setMuted(!on));
    return () => { unsub(); };
  }, []);
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);

  const livesQ = useQuery({
    queryKey: ["reels-lives"],
    queryFn: () => fetchActiveLives(20),
    refetchInterval: 15000,
  });
  const lives = livesQ.data ?? [];
  const hasLives = lives.length > 0;
  useEffect(() => { if (!hasLives && tab === "live") setTab("fyp"); }, [hasLives, tab]);

  const query = useQuery({
    queryKey: ["reels", user.id, "blocks", hidden ? hidden.size : 0],
    enabled: !!blocks.data,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev: any) => prev,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("media_type", "video")
        .eq("post_kind", "reel")
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      let posts = (data ?? []) as any[];
      if (hidden && hidden.size > 0) posts = posts.filter((p) => !hidden.has(p.author_id));
      if (posts.length === 0) return [] as FeedPost[];

      const ids = posts.map((p) => p.id);
      const authorIds = Array.from(new Set(posts.map((p) => p.author_id)));

      const [profilesRes, likesCountRes, commentsCountRes, myLikesRes] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, badge_variant").in("id", authorIds),
        supabase.from("likes").select("post_id").in("post_id", ids),
        supabase.from("comments").select("post_id").in("post_id", ids),
        supabase.from("likes").select("post_id").eq("user_id", user.id).in("post_id", ids),
      ]);

      const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const likesCount = new Map<string, number>();
      for (const l of likesCountRes.data ?? []) likesCount.set(l.post_id, (likesCount.get(l.post_id) ?? 0) + 1);
      const commentsCount = new Map<string, number>();
      for (const c of commentsCountRes.data ?? []) commentsCount.set(c.post_id, (commentsCount.get(c.post_id) ?? 0) + 1);
      const myLikes = new Set((myLikesRes.data ?? []).map((l: any) => l.post_id));

      return posts.map<FeedPost>((p) => ({
        ...p,
        author: profiles.get(p.author_id) ?? null,
        likes_count: likesCount.get(p.id) ?? 0,
        comments_count: commentsCount.get(p.id) ?? 0,
        liked_by_me: myLikes.has(p.id),
      }));
    },
  });

  const posts = query.data ?? [];

  return (
    <div className="relative -mx-0 md:-mx-4 md:-mt-6">
      {/* Header overlay */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center gap-3 px-4 h-14 bg-gradient-to-b from-black/70 to-transparent text-white">
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
        <span className="w-9 md:hidden" />
      </header>

      <div
        className="snap-y snap-mandatory overflow-y-scroll bg-black no-scrollbar rounded-none md:rounded-2xl md:overflow-hidden"
        style={{ height: "calc(100dvh - 96px)" }}
      >
        {tab === "live" ? (
          lives.map((l) => <LiveReelCard key={l.id} l={l} />)
        ) : query.isLoading ? (
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
            />
          ))
        )}
      </div>

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
    <section className="relative h-full w-full snap-start snap-always overflow-hidden bg-black">
      {l.thumbnail_url ? (
        <img src={l.thumbnail_url} alt={l.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-black to-black" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/30" />

      <div className="absolute top-16 left-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Ao vivo
        </span>
        <span className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white flex items-center gap-1">
          <Users className="h-3 w-3" /> {formatViewers(l.viewer_count ?? 0)}
        </span>
        <span className="rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white/75">{timeOnAir(l.started_at)}</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-5 pb-24 space-y-4">
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

      <Radio className="absolute right-5 top-16 h-5 w-5 text-white/40" />
    </section>
  );
}
