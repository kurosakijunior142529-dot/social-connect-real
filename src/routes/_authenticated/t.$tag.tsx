import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Hash, TrendingUp } from "lucide-react";
import { MediaCell } from "./explore";
import {
  fetchHashtagFeed,
  fetchHashtagInfo,
  fetchRelatedHashtags,
  logHashtagView,
} from "@/lib/search";


export const Route = createFileRoute("/_authenticated/t/$tag")({
  ssr: false,
  component: HashtagPage,
});

function HashtagPage() {
  const { tag } = Route.useParams();
  const router = useRouter();
  const [sort, setSort] = useState<"popular" | "recent">("recent");
  const [pages, setPages] = useState(1);

  useEffect(() => {
    setPages(1);
    void logHashtagView(tag);
  }, [tag]);

  const info = useQuery({
    queryKey: ["hashtag-info", tag],
    queryFn: () => fetchHashtagInfo(tag),
    staleTime: 60_000,
  });

  const feed = useQuery({
    queryKey: ["hashtag-feed", tag, sort, pages],
    queryFn: async () => {
      const chunks = await Promise.all(
        Array.from({ length: pages }, (_, i) => fetchHashtagFeed(tag, sort, i)),
      );
      return chunks.flat();
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const canLoadMore = (feed.data?.length ?? 0) >= pages * 24;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canLoadMore || feed.isFetching) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setPages((p) => p + 1), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, feed.isFetching, feed.data?.length]);

  const label = info.data?.display_tag ?? tag;

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex items-center gap-3 px-3 py-3">
          <button
            onClick={() => router.history.back()}
            aria-label="Voltar"
            className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-semibold">#{label}</div>
            <div className="text-[12px] text-muted-foreground tabular">
              {info.isLoading ? "…" : `${info.data?.post_count ?? 0} publicações`}
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-3">
          {(["popular", "recent"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setSort(s);
                setPages(1);
              }}
              className={
                sort === s
                  ? "rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-foreground"
                  : "rounded-full bg-[color:var(--surface-2)] px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground"
              }
            >
              {s === "popular" ? "Populares" : "Recentes"}
            </button>
          ))}
        </div>
      </header>

      {feed.isLoading ? (
        <div className="grid grid-cols-3 gap-1 p-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      ) : (feed.data ?? []).length === 0 ? (
        <div className="px-6 pt-16 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[color:var(--surface-2)]">
            <Hash className="h-6 w-6 text-primary" />
          </span>
          <p className="mt-4 text-[15px] font-semibold">Ainda não há publicações aqui</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use #{label} na sua próxima publicação e apareça primeiro.
          </p>
          <Link
            to="/create"
            className="mt-5 inline-block rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Publicar
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1 p-4">
            {(feed.data ?? []).map((p) => (
              <MediaCell
                key={p.id}
                id={p.id}
                path={p.thumbnail_url ?? p.media_url}
                isVideo={p.media_type === "video" || p.post_kind === "reel"}
                likes={Number(p.likes ?? 0)}
              />
            ))}
          </div>
          <div ref={sentinel} className="h-6" aria-hidden />
        </>
      )}
    </div>
  );
}
