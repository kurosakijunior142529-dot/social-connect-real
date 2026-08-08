import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { ReelItem } from "@/components/reels/reel-item";
import { CommentsSheet } from "@/components/reels/comments-sheet";
import type { FeedPost } from "@/components/post-card";
import { useBlocks } from "@/hooks/use-blocks";

export const Route = createFileRoute("/_authenticated/reels")({
  component: ReelsPage,
});

function ReelsPage() {
  const { user } = Route.useRouteContext();
  const blocks = useBlocks();
  const hidden = blocks.data?.hidden;
  const [muted, setMuted] = useState(true);
  const [openCommentsFor, setOpenCommentsFor] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["reels", user.id, "blocks", hidden ? hidden.size : 0],
    enabled: !!blocks.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("media_type", "video")
        .eq("post_kind", "reel")
        .order("created_at", { ascending: false })
        .limit(30);
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
        <span className="text-[17px] font-display font-semibold tracking-tight drop-shadow">Reels</span>
      </header>

      <div
        className="snap-y snap-mandatory overflow-y-scroll bg-black no-scrollbar rounded-none md:rounded-2xl md:overflow-hidden"
        style={{ height: "calc(100dvh - 96px)" }}
      >
        {query.isLoading ? (
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
              onToggleMute={() => setMuted((m) => !m)}
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
