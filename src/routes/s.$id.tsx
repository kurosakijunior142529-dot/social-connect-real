import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicPostPreview } from "@/lib/share.functions";
import { Heart, MessageCircle, Sparkles } from "lucide-react";

export const Route = createFileRoute("/s/$id")({
  loader: ({ params }) => getPublicPostPreview({ data: { id: params.id } }),
  head: ({ loaderData }) => {
    const author = loaderData?.display_name ?? loaderData?.username ?? "Alguém";
    const title = loaderData
      ? `${author} no vibely`
      : "Publicação no vibely";
    const description = loaderData?.caption?.trim()
      ? loaderData.caption.slice(0, 150)
      : "Veja essa publicação no vibely — vibes, lives, conversas e Streaming Amigo em um só app.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => <ShareShell>Não conseguimos carregar essa publicação.</ShareShell>,
  notFoundComponent: () => <ShareShell>Publicação não encontrada.</ShareShell>,
  component: SharePage,
});

function ShareShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 text-center space-y-5">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="text-xl font-semibold tracking-tight">vibely</span>
        </div>
        <div className="text-sm text-muted-foreground">{children}</div>
        <Link
          to="/auth"
          className="inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Abrir o vibely
        </Link>
      </div>
    </main>
  );
}

function SharePage() {
  const post = Route.useLoaderData();
  const { id } = Route.useParams();

  if (!post) return <ShareShell>Publicação não encontrada.</ShareShell>;

  const author = post.display_name ?? post.username ?? "Alguém";

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <article className="w-full max-w-md rounded-3xl border bg-card p-6 space-y-5">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="text-xl font-semibold tracking-tight">vibely</span>
        </div>

        <header className="space-y-1 text-center">
          <h1 className="text-lg font-semibold">{author}</h1>
          {post.username ? <p className="text-xs text-muted-foreground">@{post.username}</p> : null}
        </header>

        {post.caption ? (
          <p className="rounded-2xl bg-muted/40 p-4 text-sm leading-relaxed">{post.caption}</p>
        ) : (
          <p className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">
            {post.media_type === "video" ? "Um vídeo novo no vibely." : "Uma publicação nova no vibely."}
          </p>
        )}

        <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Heart className="h-4 w-4" /> {post.likes}
          </span>
          <span className="flex items-center gap-1.5">
            <MessageCircle className="h-4 w-4" /> {post.comments}
          </span>
        </div>

        <Link
          to="/p/$id"
          params={{ id }}
          className="inline-flex w-full items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Ver no vibely
        </Link>
        <p className="text-center text-xs text-muted-foreground">
          Entre para curtir, comentar e conversar com {author}.
        </p>
      </article>
    </main>
  );
}
