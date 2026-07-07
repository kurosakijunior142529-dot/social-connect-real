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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">Bem-vindo de volta</div>
          <h1 className="text-4xl font-display font-black tracking-tight text-gradient-brand leading-none">Vibely</h1>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>@{meProfile.data?.username ?? "…"}</div>
        </div>
      </header>

      <StoriesRail currentUserId={user.id} currentProfile={meProfile.data} />

      <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

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
    <div className="glass rounded-3xl p-10 text-center space-y-3">
      <div className="text-4xl">🌌</div>
      <h2 className="text-xl font-semibold">Seu feed está silencioso</h2>
      <p className="text-sm text-muted-foreground">
        Siga perfis no Explorar, participe de grupos ou publique seu primeiro post.
      </p>
    </div>
  );
}
