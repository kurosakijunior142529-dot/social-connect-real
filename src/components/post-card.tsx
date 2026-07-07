import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Heart, MessageCircle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage, SignedVideo } from "@/components/signed-image";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

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
        await supabase.from("likes").delete().match({ user_id: currentUserId, post_id: post.id });
      } else {
        await supabase.from("likes").insert({ user_id: currentUserId, post_id: post.id });
      }
    },
    onMutate: async () => {
      setPopKey((k) => k + 1);
      await queryClient.cancelQueries({ queryKey: ["feed"] });
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
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["feed"] }),
  });

  const author = post.author;

  return (
    <article className="rounded-3xl bg-card border shadow-sm overflow-hidden">
      <header className="flex items-center gap-3 p-4">
        <Link to="/u/$username" params={{ username: author?.username ?? "" }}>
          <UserAvatar
            avatarPath={author?.avatar_url}
            displayName={author?.display_name ?? "?"}
            ring
          />
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            to="/u/$username"
            params={{ username: author?.username ?? "" }}
            className="font-semibold text-sm hover:underline"
          >
            {author?.display_name}
          </Link>
          <div className="text-xs text-muted-foreground">
            @{author?.username} ·{" "}
            {formatDistanceToNowStrict(new Date(post.created_at), { locale: ptBR, addSuffix: true })}
          </div>
        </div>
      </header>

      <Link to="/p/$id" params={{ id: post.id }} className="block bg-black">
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

      <div className="p-4 space-y-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => toggleLike.mutate()}
            className="flex items-center gap-1.5 group"
            aria-label={post.liked_by_me ? "Descurtir" : "Curtir"}
          >
            <Heart
              key={popKey}
              className={cn(
                "h-6 w-6 transition",
                post.liked_by_me
                  ? "fill-primary text-primary animate-heart-pop"
                  : "text-foreground group-hover:text-primary",
              )}
            />
            <span className="text-sm font-medium tabular-nums">{post.likes_count}</span>
          </button>
          <Link to="/p/$id" params={{ id: post.id }} className="flex items-center gap-1.5">
            <MessageCircle className="h-6 w-6" />
            <span className="text-sm font-medium tabular-nums">{post.comments_count}</span>
          </Link>
        </div>
        {post.caption ? (
          <p className="text-sm leading-relaxed">
            <Link
              to="/u/$username"
              params={{ username: author?.username ?? "" }}
              className="font-semibold mr-2"
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
  build: (q: ReturnType<typeof supabase.from<any, any>>) => any;
}) {
  return useQuery({
    queryKey: opts.key,
    queryFn: async () => {
      const query = opts.build(supabase.from("posts"));
      const { data, error } = await query;
      if (error) throw error;
      const posts = (data ?? []) as any[];
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
