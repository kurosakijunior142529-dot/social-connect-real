import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VerifiedName } from "@/components/verified-badge";
import { Link } from "@tanstack/react-router";
import { Heart, Languages, MessageCircle } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/i18n/format";
import { useServerFn } from "@tanstack/react-start";
import { translateText } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage, SignedVideo } from "@/components/signed-image";
import { UserAvatar } from "@/components/user-avatar";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { PostOwnerMenu } from "@/components/post-owner-menu";
import { SavePostButton } from "@/components/save-post-button";
import { RepostButton } from "@/components/repost-button";
import { cn } from "@/lib/utils";
import { useBlocks } from "@/hooks/use-blocks";
import { PollCard } from "@/components/polls/poll-card";

export type FeedPost = {
  id: string;
  author_id: string;
  media_url: string | null;
  media_type: "image" | "video" | "text";
  caption: string | null;
  poll_id?: string | null;
  created_at: string;
  author: { username: string; display_name: string; avatar_url: string | null; is_verified?: boolean | null; badge_variant?: string | null } | null;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
};

function PostCardBase({ post, currentUserId }: { post: FeedPost; currentUserId: string | null }) {
  const queryClient = useQueryClient();
  const [popKey, setPopKey] = useState(0);
  const [captionTranslation, setCaptionTranslation] = useState<string | null>(null);
  const [translatingCaption, setTranslatingCaption] = useState(false);
  const runTranslate = useServerFn(translateText);
  const { locale, t } = useI18n();
  const fmt = useFormat();

  async function translateCaption() {
    if (!post.caption || !currentUserId || translatingCaption) return;
    if (captionTranslation) {
      setCaptionTranslation(null);
      return;
    }
    setTranslatingCaption(true);
    try {
      const r = await runTranslate({ data: { text: post.caption, target: locale } });
      if (r?.text && r.text !== post.caption) setCaptionTranslation(r.text);
    } catch {
      /* mantém a legenda original */
    } finally {
      setTranslatingCaption(false);
    }
  }

  const toggleLike = useMutation({
    mutationFn: async () => {
      if (!currentUserId) throw new Error("Not signed in");
      if (post.liked_by_me) {
        const { error } = await supabase
          .from("likes")
          .delete()
          .match({ user_id: currentUserId, post_id: post.id });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("likes")
          .insert({ user_id: currentUserId, post_id: post.id });
        if (error) throw error;
      }
    },
    onMutate: async () => {
      setPopKey((k) => k + 1);
      await queryClient.cancelQueries({ queryKey: ["feed"] });
      const snapshot = queryClient.getQueriesData<FeedPost[] | undefined>({ queryKey: ["feed"] });
      queryClient.setQueriesData<FeedPost[] | undefined>({ queryKey: ["feed"] }, (old) =>
        old?.map((p) =>
          p.id === post.id
            ? {
                ...p,
                liked_by_me: !p.liked_by_me,
                likes_count: p.likes_count + (p.liked_by_me ? -1 : 1),
              }
            : p,
        ),
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) for (const [key, data] of ctx.snapshot) queryClient.setQueryData(key, data);
    },
    // No invalidate on every click — refetch would race with the optimistic state before the row is visible via RLS.
  });

  const author = post.author;

  return (
    <article className="social-card mx-3 mb-5 overflow-hidden rounded-[28px] border border-white/[0.06] shadow-elegant transition-shadow">
      <header className="flex items-center gap-3 px-4 py-3.5">
        <Link
          to="/u/$username"
          params={{ username: author?.username ?? "" }}
          className="rounded-full bg-white/[0.08] p-[1.5px]"
        >
          <UserAvatar
            avatarPath={author?.avatar_url}
            displayName={author?.display_name ?? "?"}
            verified={!!author?.is_verified}
            badgeVariant={(author?.badge_variant as any) ?? null}
            className="ring-2 ring-background"
          />
        </Link>
        <div className="flex-1 min-w-0 leading-tight">
          <Link
            to="/u/$username"
            params={{ username: author?.username ?? "" }}
            className="block font-semibold text-[15px] truncate"
          >
            <VerifiedName
              name={author?.display_name}
              verified={author?.is_verified}
              badgeVariant={author?.badge_variant}
            />
          </Link>
          <div className="text-[12px] text-muted-foreground truncate">
            @{author?.username} ·{" "}
            {fmt.relative(post.created_at)}
          </div>
        </div>
        {currentUserId && currentUserId !== post.author_id ? (
          <div className="flex items-center gap-1">
            <UserActionsMenu
              targetUserId={post.author_id}
              targetUsername={author?.username}
              postId={post.id}
            />
          </div>
        ) : currentUserId === post.author_id ? (
          <PostOwnerMenu postId={post.id} authorId={post.author_id} />
        ) : null}
      </header>

      {post.media_type === "text" ? (
        <div className="space-y-3">
          {post.caption ? (
            <Link
              to="/p/$id"
              params={{ id: post.id }}
              className="text-post mx-3 block rounded-[20px] px-6 py-7"
            >
              <span
                aria-hidden
                className="block text-[44px] leading-none font-serif text-primary/40 select-none"
              >
                &ldquo;
              </span>
              <p
                className={cn(
                  "-mt-3 font-semibold tracking-[-0.01em] text-foreground",
                  post.caption.length <= 60
                    ? "text-[24px] leading-[1.25]"
                    : post.caption.length <= 160
                      ? "text-[19px] leading-snug"
                      : "text-[16px] leading-relaxed",
                )}
              >
                {post.caption}
              </p>
              <span className="mt-4 block h-px w-16 rounded-full bg-primary/30" />
            </Link>
          ) : null}
          {captionTranslation && post.media_type === "text" ? (
            <p className="mx-3 -mt-1 rounded-2xl bg-[color:var(--surface-2)] px-4 py-3 text-[14px] leading-snug text-foreground/80">
              {captionTranslation}
            </p>
          ) : null}
          {post.poll_id ? <PollCard pollId={post.poll_id} currentUserId={currentUserId} /> : null}
        </div>
      ) : post.media_type === "video" ? (
        <div className="space-y-3">
            <div className="relative mx-3 overflow-hidden rounded-[22px] bg-black ring-1 ring-white/[0.06]">
             <SignedVideo
               bucket="posts"
               path={post.media_url ?? ""}
               className="w-full max-h-[80vh] aspect-[4/5]"
               fit="contain"
               expandHref={`/reels?post=${post.id}`}
               watermarkUsername={author?.username}
               onDoubleTapLike={() => {
                 if (!post.liked_by_me) toggleLike.mutate();
               }}
             />
          </div>
          {post.poll_id ? <PollCard pollId={post.poll_id} currentUserId={currentUserId} /> : null}
        </div>
      ) : (
        <Link
          to="/p/$id"
          params={{ id: post.id }}
            className="mx-3 block overflow-hidden rounded-[22px] bg-black ring-1 ring-white/[0.06]"
        >
          <SignedImage
            bucket="posts"
            path={post.media_url ?? ""}
            alt={post.caption ?? "post"}
            className="w-full h-auto max-h-[80vh] object-contain"
          />
        </Link>
      )}

      <div className="space-y-2.5 px-4 pb-4 pt-3.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleLike.mutate()}
            className={cn(
              "group flex items-center gap-1.5 rounded-full px-3 py-1.5 transition active:scale-95",
              post.liked_by_me ? "bg-primary/15" : "bg-[color:var(--surface-2)]",
            )}
            aria-label={post.liked_by_me ? "Descurtir" : "Curtir"}
          >
            <Heart
              key={popKey}
              className={cn(
                "h-[19px] w-[19px] transition",
                post.liked_by_me
                  ? "fill-primary text-primary animate-heart-pop"
                  : "text-foreground",
              )}
              strokeWidth={post.liked_by_me ? 2 : 1.7}
            />
            <span className={cn("text-[13px] font-semibold tabular", post.liked_by_me && "text-primary")}>
              {post.likes_count}
            </span>
          </button>
          <Link
            to="/p/$id"
            params={{ id: post.id }}
            className="flex items-center gap-1.5 rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 transition active:scale-95"
          >
            <MessageCircle className="h-[19px] w-[19px]" strokeWidth={1.7} />
            <span className="text-[13px] font-semibold tabular">{post.comments_count}</span>
          </Link>
          <RepostButton postId={post.id} userId={currentUserId} />
          <div className="ml-auto">
            {currentUserId ? <SavePostButton postId={post.id} userId={currentUserId} /> : null}
          </div>
        </div>
        {post.caption && post.media_type !== "text" ? (
          <p className="text-[14px] leading-snug text-foreground/90">
            <Link
              to="/u/$username"
              params={{ username: author?.username ?? "" }}
              className="font-semibold mr-1.5"
            >
              {author?.username}
            </Link>
            {captionTranslation ?? post.caption}
          </p>
        ) : null}
        {post.caption ? (
          <button
            type="button"
            onClick={translateCaption}
            disabled={translatingCaption}
            className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition hover:text-primary disabled:opacity-50"
          >
            <Languages className="h-3.5 w-3.5" />
            {translatingCaption ? t("translate.translating") : captionTranslation ? t("translate.showOriginal") : t("translate.action")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export const PostCard = memo(PostCardBase, (a, b) =>
  a.currentUserId === b.currentUserId &&
  a.post.id === b.post.id &&
  a.post.liked_by_me === b.post.liked_by_me &&
  a.post.likes_count === b.post.likes_count &&
  a.post.comments_count === b.post.comments_count &&
  a.post.caption === b.post.caption &&
  a.post.poll_id === b.post.poll_id &&
  a.post.author?.avatar_url === b.post.author?.avatar_url &&
  a.post.author?.username === b.post.author?.username &&
  a.post.author?.display_name === b.post.author?.display_name,
);

/**
 * Renders a compact placeholder until the post enters (or is about to enter)
 * the viewport. Keeps the first 2 posts eager so LCP is not delayed.
 */
export function LazyPostCard({
  post,
  currentUserId,
  eager,
}: {
  post: FeedPost;
  currentUserId: string | null;
  eager?: boolean;
}) {
  const [visible, setVisible] = useState(eager);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className="min-h-[360px]"
      style={{ contentVisibility: "auto", containIntrinsicSize: "520px" } as React.CSSProperties}
    >
      {visible ? (
        <PostCard post={post} currentUserId={currentUserId} />
      ) : (
         <article className="social-card mx-3 mb-4 overflow-hidden rounded-[24px]">
           <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 rounded bg-muted animate-pulse" />
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            </div>
          </div>
           <div className="aspect-square bg-muted animate-pulse" />
        </article>
      )}
    </div>
  );
}

// Query helper — normalizes rows into FeedPost[]
export function usePostsQuery(opts: {
  key: unknown[];
  currentUserId: string | null;
  fetchPosts: () => Promise<{ data: any[] | null; error: any }>;
}) {
  const blocks = useBlocks();
  const hidden = blocks.data?.hidden;
  return useQuery({
    queryKey: [...opts.key, "blocks", hidden ? hidden.size : 0],
    enabled: !opts.currentUserId || !!blocks.data,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // Mantém a lista anterior visível enquanto a próxima página carrega
    // (evita colapso para skeletons e perda da posição de scroll).
    placeholderData: (prev: any) => prev,
    queryFn: async () => {
      const { data, error } = await opts.fetchPosts();
      if (error) throw error;
      let posts = (data ?? []) as any[];
      if (hidden && hidden.size > 0) {
        posts = posts.filter((p) => !hidden.has(p.author_id));
      }
      if (posts.length === 0) return [] as FeedPost[];
      const ids = posts.map((p) => p.id);
      const authorIds = Array.from(new Set(posts.map((p) => p.author_id)));

      const [profilesRes, likesCountRes, commentsCountRes, myLikesRes] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, badge_variant").in("id", authorIds),
        supabase.from("likes").select("post_id").in("post_id", ids),
        supabase.from("comments").select("post_id").in("post_id", ids),
        opts.currentUserId
          ? supabase
              .from("likes")
              .select("post_id")
              .eq("user_id", opts.currentUserId)
              .in("post_id", ids)
          : Promise.resolve({ data: [] as { post_id: string }[] }),
      ]);

      const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id, p]));
      const likesCount = new Map<string, number>();
      for (const l of likesCountRes.data ?? []) {
        likesCount.set(l.post_id, (likesCount.get(l.post_id) ?? 0) + 1);
      }
      const commentsCount = new Map<string, number>();
      for (const c of commentsCountRes.data ?? []) {
        commentsCount.set(c.post_id, (commentsCount.get(c.post_id) ?? 0) + 1);
      }
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
}
