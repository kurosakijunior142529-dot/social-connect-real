import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search, UserMinus, UserPlus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedName } from "@/components/verified-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  tab: z.enum(["followers", "following"]).default("followers"),
});

export const Route = createFileRoute("/_authenticated/u/$username/follows")({
  validateSearch: searchSchema,
  component: FollowsPage,
  head: () => ({ meta: [{ title: "Conexões · vibely" }] }),
});

type Row = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified?: boolean;
  badge_variant?: string | null;
};

function FollowsPage() {
  const { username } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext() as { user: { id: string; user_metadata?: { username?: string } } };
  const [search, setSearch] = useState("");

  const myUsername = user.user_metadata?.username ?? null;
  const isOwnProfile = myUsername === username;

  const query = useQuery({
    queryKey: ["follows-list", username, tab],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("username", username)
        .maybeSingle();
      if (!profile) return { profile: null, users: [] as Row[] };

      const isFollowers = tab === "followers";
      const col = isFollowers ? "follower_id" : "following_id";
      const filterCol = isFollowers ? "following_id" : "follower_id";
      const { data: rels } = await supabase
        .from("follows")
        .select(col)
        .eq(filterCol, profile.id)
        .limit(500);
      const ids = (rels ?? []).map((r: any) => r[col]).filter(Boolean);
      if (!ids.length) return { profile, users: [] as Row[] };

      const { data: users } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified, badge_variant")
        .in("id", ids);

      // Relações do usuário logado com a lista: quem eu sigo e quem me segue.
      const [{ data: mine }, { data: theyFollowMe }] = await Promise.all([
        supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", ids),
        supabase.from("follows").select("follower_id").eq("following_id", user.id).in("follower_id", ids),
      ]);

      return {
        profile,
        users: (users ?? []) as Row[],
        myFollowing: new Set((mine ?? []).map((r: any) => r.following_id)),
        followsMe: new Set((theyFollowMe ?? []).map((r: any) => r.follower_id)),
      };
    },
  });

  const users = query.data?.users ?? [];
  const myFollowing = query.data?.myFollowing ?? new Set<string>();
  const followsMe = query.data?.followsMe ?? new Set<string>();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.display_name ?? "").toLowerCase().includes(q),
    );
  }, [users, search]);

  const toggleFollow = useMutation({
    mutationFn: async ({ targetId, follow }: { targetId: string; follow: boolean }) => {
      if (follow) {
        const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("follows").delete().match({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["follows-list"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => toast.error("Não foi possível atualizar"),
  });

  const removeFollower = useMutation({
    mutationFn: async (followerId: string) => {
      const { error } = await supabase.from("follows").delete().match({ follower_id: followerId, following_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Seguidor removido");
      qc.invalidateQueries({ queryKey: ["follows-list"] });
    },
    onError: () => toast.error("Não foi possível remover"),
  });

  return (
    <div className="pb-10">
      <header className="sticky top-0 z-10 glass-heavy hairline-b">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => navigate({ to: "/u/$username", params: { username } })}
            className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-display font-semibold truncate">@{username}</h1>
        </div>
        <div className="grid grid-cols-2 px-2">
          {(["followers", "following"] as const).map((t) => (
            <Link
              key={t}
              to="/u/$username/follows"
              params={{ username }}
              search={{ tab: t }}
              className={`text-center text-sm font-medium py-3 border-b-2 ${
                tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              {t === "followers" ? "Seguidores" : "Seguindo"}
            </Link>
          ))}
        </div>
        {users.length > 0 ? (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 rounded-xl bg-[color:var(--surface-2)]/70 border border-[color:var(--hairline)] px-3">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pessoas…"
                className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              {search ? (
                <button onClick={() => setSearch("")} aria-label="Limpar busca" className="text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      <ul className="px-2 pt-2">
        {query.isLoading ? (
          <li className="text-center text-sm text-muted-foreground py-8">Carregando…</li>
        ) : users.length === 0 ? (
          <li className="flex flex-col items-center gap-3 py-16 text-center px-6">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[color:var(--surface-2)] text-muted-foreground">
              <Users className="h-6 w-6" />
            </span>
            <div className="text-sm font-medium">
              {tab === "followers" ? "Ainda sem seguidores" : isOwnProfile ? "Você ainda não segue ninguém" : "Ainda não segue ninguém"}
            </div>
            <p className="text-xs text-muted-foreground">
              {tab === "followers"
                ? "Quando alguém seguir este perfil, aparece aqui."
                : "Encontre pessoas interessantes para seguir."}
            </p>
            {tab === "following" ? (
              <Button asChild size="sm" className="mt-1 rounded-full">
                <Link to="/explore">Explorar pessoas</Link>
              </Button>
            ) : null}
          </li>
        ) : filtered.length === 0 ? (
          <li className="text-center text-sm text-muted-foreground py-12">
            Ninguém encontrado para “{search}”.
          </li>
        ) : (
          filtered.map((u) => {
            const isMe = u.id === user.id;
            const iFollow = myFollowing.has(u.id);
            return (
              <li key={u.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-[color:var(--surface)]">
                <Link to="/u/$username" params={{ username: u.username }} className="flex items-center gap-3 flex-1 min-w-0">
                  <UserAvatar avatarPath={u.avatar_url} displayName={u.display_name || u.username} className="h-11 w-11 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      <VerifiedName name={u.display_name || u.username} verified={u.is_verified} badgeVariant={u.badge_variant} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                      <span>@{u.username}</span>
                      {followsMe.has(u.id) && !isMe ? (
                        <span className="rounded-full bg-[color:var(--surface-2)] px-1.5 py-px text-[10px] font-medium">
                          Segue você
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
                {!isMe ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant={iFollow ? "outline" : "default"}
                      disabled={toggleFollow.isPending}
                      onClick={() => toggleFollow.mutate({ targetId: u.id, follow: !iFollow })}
                      className={cn("rounded-full h-8 px-3 text-xs", !iFollow && "gap-1")}
                    >
                      {iFollow ? (
                        "Seguindo"
                      ) : (
                        <>
                          <UserPlus className="h-3.5 w-3.5" />
                          {followsMe.has(u.id) ? "Seguir de volta" : "Seguir"}
                        </>
                      )}
                    </Button>
                    {isOwnProfile && tab === "followers" ? (
                      <button
                        aria-label="Remover seguidor"
                        disabled={removeFollower.isPending}
                        onClick={() => removeFollower.mutate(u.id)}
                        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
