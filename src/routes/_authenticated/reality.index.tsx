import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Compass, Plus, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";
import {
  fetchMyRealities,
  fetchPublicRealities,
  type PublicReality,
  type Reality,
} from "@/lib/reality/api";
import { styleEmoji, styleLabel } from "@/lib/reality/catalog";

export const Route = createFileRoute("/_authenticated/reality/")({
  component: RealityHome,
  head: () => ({
    meta: [
      { title: "Vibely Reality · Entre na realidade de alguém" },
      {
        name: "description",
        content: "Transforme uma foto de um lugar real em um espaço visual único e convide pessoas para entrar com você.",
      },
      { property: "og:title", content: "Vibely Reality" },
      { property: "og:description", content: "Crie um espaço visual único e convide pessoas para entrar com você." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RealityThumb({ path, className }: { path: string; className?: string }) {
  const { data: url } = useSignedUrl("realities", path);
  return (
    <div className={cn("relative overflow-hidden rounded-2xl bg-[color:var(--surface-2)]", className)}>
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover animate-in fade-in duration-300"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-[color:var(--surface-2)]" />
      )}
    </div>
  );
}

function RealityHome() {
  const { user } = Route.useRouteContext();
  const [tab, setTab] = useState<"mine" | "explore">("mine");

  const mine = useQuery({
    queryKey: ["realities", "mine", user.id],
    queryFn: () => fetchMyRealities(user.id),
  });

  const explore = useQuery({
    queryKey: ["realities", "public"],
    queryFn: () => fetchPublicRealities(30),
    enabled: tab === "explore",
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      <header className="rounded-3xl border border-border/60 bg-[color:var(--surface)] p-5">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Vibely Reality
        </span>
        <h1 className="mt-3 font-display text-2xl font-semibold">Entre na realidade de alguém.</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie um espaço visual único e convide pessoas para entrar com você.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" className="h-12 flex-1 rounded-2xl text-[15px]">
            <Link to="/reality/new">
              <Plus className="mr-1 h-4 w-4" /> Criar minha realidade
            </Link>
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="h-12 flex-1 rounded-2xl text-[15px]"
            onClick={() => setTab("explore")}
          >
            <Compass className="mr-1 h-4 w-4" /> Explorar realidades
          </Button>
        </div>
      </header>

      <div className="mt-5 flex gap-2">
        {(["mine", "explore"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "bg-[color:var(--surface-2)] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {id === "mine" ? "Minhas realidades" : "Explorar"}
          </button>
        ))}
      </div>

      {tab === "mine" ? (
        <section className="mt-4">
          {mine.isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : (mine.data?.length ?? 0) === 0 ? (
            <div className="rounded-3xl border border-border/60 bg-[color:var(--surface)] p-6 text-center">
              <p className="text-[15px] font-semibold">Você ainda não criou uma realidade.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Crie um espaço único e convide alguém para entrar.
              </p>
              <Button asChild className="mt-4 h-11 rounded-2xl">
                <Link to="/reality/new">Criar minha realidade</Link>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(mine.data as Reality[]).map((r) => (
                <Link
                  key={r.id}
                  to="/reality/$id"
                  params={{ id: r.id }}
                  className="group overflow-hidden rounded-2xl border border-border/60 bg-[color:var(--surface)] transition-transform active:scale-[0.99]"
                >
                  <RealityThumb path={r.generated_image} className="aspect-[4/5]" />
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold">
                      {styleEmoji(r.style)} {r.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{styleLabel(r.style)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-4">
          {explore.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
          ) : (explore.data?.length ?? 0) === 0 ? (
            <p className="rounded-3xl border border-border/60 bg-[color:var(--surface)] p-6 text-center text-sm text-muted-foreground">
              Ainda não há realidades públicas. Seja a primeira pessoa a criar uma.
            </p>
          ) : (
            <div className="space-y-3">
              {(explore.data as PublicReality[]).map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-[color:var(--surface)] p-3"
                >
                  <RealityThumb path={r.generated_image} className="h-20 w-20 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {styleEmoji(r.style)} {r.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <UserAvatar avatarPath={r.avatar_url} displayName={r.display_name} className="h-5 w-5" />
                      <span className="truncate">@{r.username}</span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {r.people}
                      </span>
                    </div>
                  </div>
                  <Button asChild size="sm" className="rounded-xl">
                    <Link to="/reality/$id" params={{ id: r.id }}>
                      Entrar
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
