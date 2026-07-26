import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PostCard, usePostsQuery } from "@/components/post-card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { StoriesRail } from "@/components/stories-rail";
import { PlusSquare, Tv, Gamepad2, Radio, Bell } from "lucide-react";

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
        <div className="grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[20px] font-display font-semibold tracking-tight">vibely</span>
              <span className="h-1 w-1 rounded-full bg-primary" />
            </div>
            <span className="block truncate text-[11px] text-muted-foreground tabular">@{meProfile.data?.username ?? "…"}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <HeaderAction to="/lives" label="Lives" icon={<Radio className="h-4 w-4" />} />
            <HeaderAction to="/watch" label="Streaming" icon={<Tv className="h-4 w-4" />} />
            <HeaderAction to="/games" label="Jogos" icon={<Gamepad2 className="h-4 w-4" />} />
            <HeaderAction to="/notifications" label="Notificações" icon={<Bell className="h-4 w-4" />} />
          </div>



        </div>
      </header>

      <div className="pt-4 pb-2">
        <StoriesRail currentUserId={user.id} currentProfile={meProfile.data} />
      </div>

      {query.isLoading ? (
        <div className="space-y-4 px-4 pt-2">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3 rounded-[24px] bg-[color:var(--surface)] p-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
              <Skeleton className="aspect-square rounded-2xl" />
            </div>
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
    <div className="mx-4 mt-4 rounded-[28px] bg-[radial-gradient(circle_at_50%_0%,rgba(215,255,58,0.14),transparent_34%),var(--surface)] p-8 text-center space-y-4 shadow-elegant">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground">
        <PlusSquare className="h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">Seu feed está silencioso</h2>
      <p className="text-sm text-muted-foreground">
        Siga perfis no Explorar ou publique seu primeiro post.
      </p>
      <div className="flex justify-center gap-2 pt-1">
        <Link to="/explore" className="rounded-full bg-[color:var(--surface-2)] px-4 py-2 text-sm font-medium">Explorar</Link>
        <Link to="/create" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Publicar</Link>
      </div>
    </div>
  );
}

function HeaderAction({
  to,
  icon,
  label,
  primary,
}: {
  to: "/watch" | "/create" | "/settings" | "/games" | "/lives" | "/pro" | "/reels" | "/notifications";
  icon: ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className={
        primary
          ? "grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-95"
          : "grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] text-muted-foreground transition hover:text-foreground active:scale-95"
      }
    >
      {icon}
    </Link>
  );
}
