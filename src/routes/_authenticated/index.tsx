import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LazyPostCard, usePostsQuery } from "@/components/post-card";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { StoriesRail } from "@/components/stories-rail";
import { OnboardingSuggestions } from "@/components/onboarding-suggestions";
import { WatchRoomsRail } from "@/components/watch-rooms-rail";

import { WhatsNewCard } from "@/components/whats-new-card";
import { ResumeBar } from "@/components/resume-bar";
import { VibeCheckCard } from "@/components/vibe-check-card";

import { PlusSquare, Radio, Bell, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export const Route = createFileRoute("/_authenticated/")({
  ssr: false,
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

  // Carregamento progressivo: 6 posts por vez em vez de 24 de uma vez.
  const [limit, setLimit] = useState(6);

  const query = usePostsQuery({
    key: ["feed", user.id, limit],
    currentUserId: user.id,
    fetchPosts: async () => {
      const [{ data: follows }, { data: hidden }] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", user.id),
        supabase.from("hidden_posts").select("post_id").eq("user_id", user.id),
      ]);
      const followingIds = (follows ?? []).map((f) => f.following_id);
      const authors = [...followingIds, user.id];
      let q = supabase
        .from("posts")
        .select("*")
        .neq("post_kind", "reel")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (followingIds.length > 0) q = q.in("author_id", authors);
      const result = await q;
      if (result.error) return result;
      const hiddenIds = new Set((hidden ?? []).map((row) => row.post_id));
      return { ...result, data: (result.data ?? []).filter((post) => !hiddenIds.has(post.id)) };
    },
  });

  const loadedCount = query.data?.length ?? 0;
  const canLoadMore = loadedCount >= limit;
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canLoadMore || query.isFetching) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setLimit((l) => l + 6);
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, query.isFetching, loadedCount]);

  return (
    <div>
      {/* Sticky slim header */}
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[22px] font-display font-semibold">vibely</span>
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
            <span className="block truncate text-[11px] text-muted-foreground tabular">@{meProfile.data?.username ?? "…"}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <HeaderAction to="/lives" label="Lives" icon={<Radio className="h-4 w-4" />} />
            <HeaderAction to="/notifications" label="Notificações" icon={<Bell className="h-4 w-4" />} />
          </div>



        </div>
      </header>

      <ResumeBar />

      <div className="pb-4 pt-1">
        <StoriesRail currentUserId={user.id} currentProfile={meProfile.data} />
      </div>

      <WhatsNewCard />

      <WatchRoomsRail />

      <VibeCheckCard />

      <DailyPromptCard />

      <OnboardingSuggestions currentUserId={user.id} />


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
         <div>
          {query.data.map((p, i) => (
            <LazyPostCard key={p.id} post={p} currentUserId={user.id} eager={i < 2} />
          ))}
          <div ref={sentinel} className="h-8" aria-hidden />
        </div>
      ) : (
        <EmptyFeed />
      )}
    </div>
  );
}

function DailyPromptCard() {
  const prompt = useQuery({
    queryKey: ["daily-prompt"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("today_prompt");
      if (error) return null;
      const row = Array.isArray(data) ? data[0] : data;
      return (row?.prompt as string) ?? null;
    },
  });

  if (!prompt.data) return null;

  return (
    <div className="px-4 pb-3">
      <Link
        to="/stories/new"
        className="flex items-center gap-3 rounded-[22px] border border-white/[0.07] bg-[color:var(--surface)] p-3.5 transition active:scale-[0.99]"
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Vibe do dia</div>
          <div className="truncate text-[14px] font-medium">{prompt.data}</div>
        </div>
        <span className="shrink-0 rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-[12px] font-semibold">
          Postar
        </span>
      </Link>
    </div>
  );
}

function EmptyFeed() {
  return (
    <div className="mx-4 mt-4 rounded-[28px] border border-white/[0.06] bg-[color:var(--surface)] p-8 text-center space-y-4">
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
