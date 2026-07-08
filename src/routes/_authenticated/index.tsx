import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PostCard, usePostsQuery } from "@/components/post-card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { StoriesRail } from "@/components/stories-rail";

export const Route = createFileRoute("/_authenticated/")({
  component: FeedPage,
});

function FeedPage() {
  const { user } = Route.useRouteContext();

  const meProfile = useQuery({
    queryKey: ["me-profile-mini", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const query = usePostsQuery({
    key: ["feed", user.id],
    currentUserId: user.id,
    fetchPosts: async () => {
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
    <div>
      {/* Sticky slim header */}
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex items-center justify-between px-4 h-12">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[19px] font-display font-semibold tracking-tight">vibely</span>
            <span className="h-1 w-1 rounded-full bg-primary" />
          </div>
          <span className="text-[11px] text-muted-foreground tabular">@{meProfile.data?.username ?? "…"}</span>
        </div>
      </header>

      <div className="pt-4 pb-2">
        <StoriesRail currentUserId={user.id} currentProfile={meProfile.data} />
      </div>

      {query.isLoading ? (
        <div className="space-y-6 px-4 pt-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : query.data && query.data.length > 0 ? (
        <div className="divide-y divide-[color:var(--hairline)]">
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
    <div className="mx-4 mt-4 rounded-2xl bg-[color:var(--surface)] p-10 text-center space-y-3">
      <h2 className="text-lg font-semibold">Seu feed está silencioso</h2>
      <p className="text-sm text-muted-foreground">
        Siga perfis no Explorar ou publique seu primeiro post.
      </p>
    </div>
  );
}
