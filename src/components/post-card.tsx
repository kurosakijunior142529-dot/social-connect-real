import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Heart, MessageCircle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage, SignedVideo } from "@/components/signed-image";
import { UserAvatar } from "@/components/user-avatar";
import { UserActionsMenu } from "@/components/user-actions-menu";
import { SavePostButton } from "@/components/save-post-button";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useBlocks } from "@/hooks/use-blocks";

export type FeedPost = {
  id: string;
  author_id: string;
  media_url: string;
  media_type: "image" | "video";
  caption: string | null;
  created_at: string;
  author: { username: string; display_name: string; avatar_url: string | null } | null;
  likes_count: number;
  comments_count: number;
  liked_by_me: boolean;
};

export function PostCard({ post, currentUserId }: { post: FeedPost; currentUserId: string | null }) {
  const queryClient = useQueryClient();
  const [popKey, setPopKey] = useState(0);

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
    <article className="px-4 pb-2">
      <header className="flex items-center gap-3 py-3">
        <Link to="/u/$username" params={{ username: author?.username ?? "" }}>
          <UserAvatar
            avatarPath={author?.avatar_url}
            displayName={author?.display_name ?? "?"}
          />
        </Link>
        <div className="flex-1 min-w-0 leading-tight">
          <Link
            to="/u/$username"
            params={{ username: author?.username ?? "" }}
            className="block font-semibold text-[15px] truncate"
          >
            {author?.display_name}
          </Link>
          <div className="text-[12px] text-muted-foreground truncate">
            @{author?.username} ·{" "}
            {formatDistanceToNowStrict(new Date(post.created_at), { locale: ptBR, addSuffix: true })}
          </div>
        </div>
        {currentUserId && currentUserId !== post.author_id ? (
          <UserActionsMenu
            targetUserId={post.author_id}
            targetUsername={author?.username}
            postId={post.id}
          />
        ) : null}
      </header>

      <Link
        to="/p/$id"
        params={{ id: post.id }}
        className="block overflow-hidden rounded-2xl bg-[color:var(--surface)]"
      >
        {post.media_type === "video" ? (
          <SignedVideo bucket="posts" path={post.media_url} className="w-full aspect-square object-cover" />
        ) : (
          <SignedImage
            bucket="posts"
            path={post.media_url}
            alt={post.caption ?? "post"}
            className="w-full aspect-square object-cover"
          />
        )}
      </Link>

      <div className="pt-3 space-y-2">
        <div className="flex items-center gap-5">
          <button
            onClick={() => toggleLike.mutate()}
            className="flex items-center gap-1.5 group"
            aria-label={post.liked_by_me ? "Descurtir" : "Curtir"}
          >
            <Heart
              key={popKey}
              className={cn(
                "h-[22px] w-[22px] transition",
                post.liked_by_me
                  ? "fill-primary text-primary animate-heart-pop"
                  : "text-foreground",
              )}
              strokeWidth={post.liked_by_me ? 2 : 1.6}
            />
            <span className="text-[13px] font-medium tabular">{post.likes_count}</span>
          </button>
          <Link to="/p/$id" params={{ id: post.id }} className="flex items-center gap-1.5">
            <MessageCircle className="h-[22px] w-[22px]" strokeWidth={1.6} />
            <span className="text-[13px] font-medium tabular">{post.comments_count}</span>
          </Link>
          <div className="ml-auto">
            {currentUserId ? <SavePostButton postId={post.id} userId={currentUserId} /> : null}
          </div>
        </div>
        {post.caption ? (
          <p className="text-[14px] leading-snug text-foreground/90">
            <Link
              to="/u/$username"
              params={{ username: author?.username ?? "" }}
              className="font-semibold mr-1.5"
            >
              {author?.username}
            </Link>
            {post.caption}
          </p>
        ) : null}
      </div>
    </article>
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
        supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", authorIds),
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
