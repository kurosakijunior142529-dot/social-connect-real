import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";

const searchSchema = z.object({
  tab: z.enum(["followers", "following"]).default("followers"),
});

export const Route = createFileRoute("/_authenticated/u/$username/follows")({
  validateSearch: searchSchema,
  component: FollowsPage,
  head: () => ({ meta: [{ title: "Conexões · vibely" }] }),
});

type Row = { id: string; username: string; display_name: string | null; avatar_url: string | null };

function FollowsPage() {
  const { username } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();

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
        .select("id, username, display_name, avatar_url")
        .in("id", ids);
      return { profile, users: (users ?? []) as Row[] };
    },
  });

  const users = query.data?.users ?? [];

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
      </header>

      <ul className="px-2 pt-2">
        {query.isLoading ? (
          <li className="text-center text-sm text-muted-foreground py-8">Carregando…</li>
        ) : users.length === 0 ? (
          <li className="text-center text-sm text-muted-foreground py-12">
            {tab === "followers" ? "Nenhum seguidor ainda." : "Ainda não segue ninguém."}
          </li>
        ) : (
          users.map((u) => (
            <li key={u.id}>
              <Link
                to="/u/$username"
                params={{ username: u.username }}
                className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-[color:var(--surface)]"
              >
                <UserAvatar username={u.username} displayName={u.display_name} avatarUrl={u.avatar_url} size={44} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.display_name || u.username}</div>
                  <div className="text-xs text-muted-foreground truncate">@{u.username}</div>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
