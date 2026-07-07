import { createFileRoute } from "@tanstack/react-router";
import { PostCard, usePostsQuery } from "@/components/post-card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: FeedPage,
});

function FeedPage() {
  const { user } = Route.useRouteContext();

  const query = usePostsQuery({
    key: ["feed", user.id],
    currentUserId: user.id,
    fetchPosts: async () => {
      // Posts from followed + self, fallback to all if not following anyone
      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id);
      const followingIds = (follows ?? []).map((f) => f.following_id);
      const authors = [...followingIds, user.id];
      let q = supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
      if (followingIds.length > 0) q = q.in("author_id", authors);
      return q;
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gradient-brand">Vibely</h1>
        <Sparkles className="h-6 w-6 text-primary" />
      </header>

      {query.isLoading ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-96 rounded-3xl" />
          ))}
        </div>
      ) : query.data && query.data.length > 0 ? (
        <div className="space-y-6">
          {query.data.map((p) => (
            <PostCard key={p.id} post={p} currentUserId={user.id} />
          ))}
        </div>
      ) : (
        <EmptyFeed />
      )}
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="rounded-3xl border border-dashed p-10 text-center space-y-3">
      <div className="text-4xl">✨</div>
      <h2 className="text-xl font-semibold">Seu feed está vazio</h2>
      <p className="text-sm text-muted-foreground">
        Explore usuários e siga quem você curte, ou crie seu primeiro post!
      </p>
    </div>
  );
}
