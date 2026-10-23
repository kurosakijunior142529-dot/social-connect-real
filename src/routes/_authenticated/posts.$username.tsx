import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { LazyPostCard, usePostsQuery } from "@/components/post-card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/posts/$username")({
  ssr: false,
  validateSearch: (s) => z.object({ start: z.string().optional() }).parse(s),
  head: ({ params }) => ({
    meta: [
      { title: `Publicações de @${params.username} — Vibely` },
      { name: "description", content: `Veja as publicações de @${params.username} em sequência no Vibely.` },
      { property: "og:title", content: `Publicações de @${params.username} — Vibely` },
      { property: "og:description", content: `Veja as publicações de @${params.username} em sequência.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePostsFeed,
});

function ProfilePostsFeed() {
  const { username } = Route.useParams();
  const { start } = Route.useSearch();
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const scrolled = useRef(false);

  const profile = useQuery({
    queryKey: ["profile-id", username],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      return data;
    },
  });

  const query = usePostsQuery({
    key: ["profile-posts-feed", profile.data?.id ?? null],
    currentUserId: user.id,
    fetchPosts: async () => {
      if (!profile.data?.id) return { data: [], error: null };
      return supabase
        .from("posts")
        .select("*")
        .eq("author_id", profile.data.id)
        .order("created_at", { ascending: false })
        .limit(60);
    },
  });

  const posts = query.data ?? [];
  const startIndex = Math.max(0, posts.findIndex((p) => p.id === start));

  useEffect(() => {
    if (scrolled.current || !start || posts.length === 0) return;
    const el = document.getElementById(`pf-${start}`);
    if (el) {
      scrolled.current = true;
      el.scrollIntoView({ block: "start" });
    }
  }, [posts.length, start]);

  return (
    <div>
      <header className="sticky top-0 z-20 header-veil flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-3 px-4">
        <button
          onClick={() => (window.history.length > 1 ? router.history.back() : router.navigate({ to: "/u/$username", params: { username } }))}
          aria-label="Voltar"
          className="glass-pill grid h-9 w-9 place-items-center rounded-full"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Publicações</div>
          <Link to="/u/$username" params={{ username }} className="block truncate text-sm font-semibold">@{username}</Link>
        </div>
      </header>
      {query.isLoading || profile.isLoading ? (
        <div className="px-4 pt-3"><Skeleton className="aspect-[4/5] rounded-2xl" /></div>
      ) : posts.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Nenhuma publicação.</p>
      ) : (
        posts.map((p, i) => (
          <div key={p.id} id={`pf-${p.id}`} className="scroll-mt-14">
            <LazyPostCard post={p} currentUserId={user.id} eager={Math.abs(i - startIndex) < 2} />
          </div>
        ))
      )}
    </div>
  );
}
