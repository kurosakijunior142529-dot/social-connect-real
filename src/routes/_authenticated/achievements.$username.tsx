import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AchievementsCard } from "@/components/profile/achievements-card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/achievements/$username")({
  component: AchievementsPage,
  head: () => ({
    meta: [
      { title: "Conquistas | Vibely" },
      { name: "description", content: "Veja as insígnias, pontos e conquistas desbloqueadas neste perfil do Vibely." },
      { property: "og:title", content: "Conquistas | Vibely" },
      { property: "og:description", content: "Insígnias, pontos e conquistas desbloqueadas no Vibely." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AchievementsPage() {
  const { username } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["achievements-profile", username],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .eq("username", username)
        .maybeSingle();
      return data;
    },
  });

  const profile = q.data as { id: string; username: string; display_name: string } | null | undefined;
  const isMe = !!profile && profile.id === user.id;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/u/$username", params: { username } })}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/5 transition hover:bg-white/10"
          aria-label="Voltar ao perfil"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-primary">Progresso</p>
          <h1 className="truncate text-2xl font-bold">Conquistas</h1>
        </div>
        <span className="ml-auto grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
          <Trophy className="h-5 w-5" />
        </span>
      </header>

      {q.isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : profile ? (
        <>
          <p className="text-sm text-muted-foreground">
            Insígnias de{" "}
            <Link to="/u/$username" params={{ username: profile.username }} className="text-primary hover:underline">
              @{profile.username}
            </Link>
          </p>
          <AchievementsCard userId={profile.id} isMe={isMe} />
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Perfil não encontrado.
        </div>
      )}
    </div>
  );
}
