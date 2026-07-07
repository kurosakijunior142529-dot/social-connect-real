import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SignedImage } from "@/components/signed-image";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useBlocks } from "@/hooks/use-blocks";

export const Route = createFileRoute("/_authenticated/explore")({
  component: ExplorePage,
});

function ExplorePage() {
  const [q, setQ] = useState("");
  const blocks = useBlocks();
  const hidden = blocks.data?.hidden;

  const posts = useQuery({
    queryKey: ["explore", "posts", hidden ? hidden.size : 0],
    enabled: !!blocks.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, media_url, media_type, author_id")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      const filtered = (data ?? []).filter((p) => !hidden!.has(p.author_id));
      return filtered.slice(0, 60);
    },
  });

  const users = useQuery({
    queryKey: ["explore", "users", q, hidden ? hidden.size : 0],
    queryFn: async () => {
      if (!q.trim()) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .limit(30);
      if (error) throw error;
      return (data ?? []).filter((u) => !hidden?.has(u.id)).slice(0, 15);
    },
    enabled: q.trim().length > 0 && !!blocks.data,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Explorar</h1>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar usuários…"
          className="pl-11 rounded-full h-12 bg-muted border-transparent"
        />
      </div>

      {q.trim() ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pessoas</h2>
          {users.isLoading ? (
            <Skeleton className="h-20 rounded-2xl" />
          ) : users.data && users.data.length > 0 ? (
            <div className="space-y-2">
              {users.data.map((u) => (
                <Link
                  key={u.id}
                  to="/u/$username"
                  params={{ username: u.username }}
                  className="flex items-center gap-3 rounded-2xl p-3 hover:bg-muted"
                >
                  <UserAvatar avatarPath={u.avatar_url} displayName={u.display_name} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{u.display_name}</div>
                    <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
          )}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Em alta</h2>
        {posts.isLoading ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : posts.data && posts.data.length > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {posts.data.map((p) => (
              <Link
                key={p.id}
                to="/p/$id"
                params={{ id: p.id }}
                className="aspect-square overflow-hidden rounded-xl bg-muted"
              >
                <SignedImage
                  bucket="posts"
                  path={p.media_url}
                  alt=""
                  className="w-full h-full object-cover hover:scale-105 transition"
                />
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não há posts. Seja o primeiro!</p>
        )}
      </section>
    </div>
  );
}
