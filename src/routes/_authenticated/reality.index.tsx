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
      {/* HERO imersivo */}
      <header className="relative overflow-hidden rounded-[28px] border border-border/60 social-card p-6 shadow-elegant">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-70 blur-3xl"
          style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 45%, transparent), transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--accent, var(--primary)) 40%, transparent), transparent 70%)" }}
        />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Vibely Reality
          </span>
          <h1 className="mt-4 font-display text-[28px] leading-tight font-semibold">
            Entre na <span className="text-gradient-brand">realidade</span> de alguém.
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Transforme uma foto real em um espaço visual único, abra as portas e viva ele junto com
            outras pessoas: conversa, voz e vídeo no mesmo lugar.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="h-12 flex-1 rounded-2xl text-[15px] shadow-elegant">
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
        </div>
      </header>

      <div className="mt-5 inline-flex rounded-full border border-border/60 bg-[color:var(--surface)] p-1">
        {(["mine", "explore"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all",
              tab === id
                ? "bg-[color:var(--surface-2)] text-foreground shadow-elegant"
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
                <Skeleton key={i} className="aspect-[4/5] rounded-[22px]" />
              ))}
            </div>
          ) : (mine.data?.length ?? 0) === 0 ? (
            <div className="relative overflow-hidden rounded-[26px] border border-dashed border-primary/30 social-card p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="mt-3 text-[15px] font-semibold">Sua primeira realidade começa com uma foto.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Seu quarto vira uma nave. A sala vira um cinema. E aí você convida alguém.
              </p>
              <Button asChild className="mt-4 h-11 rounded-2xl px-6">
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
                  className="group relative aspect-[4/5] overflow-hidden rounded-[22px] border border-border/60 transition-transform active:scale-[0.98]"
                >
                  <RealityThumb path={r.generated_image} className="absolute inset-0 h-full w-full rounded-none" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                  {r.is_featured ? (
                    <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                      ⭐ destaque
                    </span>
                  ) : null}
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="truncate text-sm font-semibold text-white">
                      {styleEmoji(r.style)} {r.name}
                    </p>
                    <p className="truncate text-[11px] text-white/70">{styleLabel(r.style)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-4">
          {explore.isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="aspect-[4/5] rounded-[22px]" />
              ))}
            </div>
          ) : (explore.data?.length ?? 0) === 0 ? (
            <p className="rounded-[26px] border border-border/60 social-card p-8 text-center text-sm text-muted-foreground">
              Ainda não há realidades públicas. Seja a primeira pessoa a abrir a sua.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(explore.data as PublicReality[]).map((r) => (
                <Link
                  key={r.id}
                  to="/reality/$id"
                  params={{ id: r.id }}
                  className="group relative aspect-[4/5] overflow-hidden rounded-[22px] border border-border/60 transition-transform active:scale-[0.98]"
                >
                  <RealityThumb path={r.generated_image} className="absolute inset-0 h-full w-full rounded-none" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                    <Users className="h-3 w-3" /> {r.people}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <p className="truncate text-sm font-semibold text-white">
                      {styleEmoji(r.style)} {r.name}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <UserAvatar avatarPath={r.avatar_url} displayName={r.display_name} className="h-5 w-5" />
                      <span className="truncate text-[11px] text-white/75">@{r.username}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
