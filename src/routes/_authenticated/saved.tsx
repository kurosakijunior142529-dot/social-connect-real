import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PostCard, usePostsQuery } from "@/components/post-card";
import { Bookmark } from "lucide-react";

export const Route = createFileRoute("/_authenticated/saved")({
  component: SavedPage,
});

function SavedPage() {
  const { user } = Route.useRouteContext();
  const q = usePostsQuery({
    key: ["saved", user.id],
    currentUserId: user.id,
    fetchPosts: async () => {
      const { data: saves, error } = await (supabase as any)
        .from("saved_posts")
        .select("post_id, created_at")
        .order("created_at", { ascending: false });
      if (error) return { data: null, error };
      const ids = (saves ?? []).map((s: any) => s.post_id);
      if (ids.length === 0) return { data: [], error: null };
      const { data: posts, error: e2 } = await supabase.from("posts").select("*").in("id", ids);
      if (e2) return { data: null, error: e2 };
      const order = new Map<string, number>(ids.map((id: string, i: number) => [id, i] as [string, number]));
      const sorted = (posts ?? []).slice().sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      return { data: sorted, error: null };
    },
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <Bookmark className="h-6 w-6 text-primary" />
        <h1 className="font-display text-3xl font-bold">Salvos</h1>
      </header>
      {q.isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-96 rounded-3xl bg-muted/40 animate-pulse" />)}</div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border/60 p-10 text-center text-muted-foreground">
          <Bookmark className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum post salvo ainda. Toque no marcador em qualquer post.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {q.data!.map((p) => <PostCard key={p.id} post={p} currentUserId={user.id} />)}
        </div>
      )}
    </div>
  );
}
