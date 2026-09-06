import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useInView } from "@/hooks/use-in-view";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { SignedImage } from "@/components/signed-image";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedName } from "@/components/verified-badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useBlocks } from "@/hooks/use-blocks";
import {
  SEARCH_TABS,
  SEARCH_PAGE_SIZE,
  fetchHistory,
  fetchSearch,
  fetchSuggestedForMe,
  fetchSuggestions,
  fetchTrendingHashtags,
  fetchTrendingSearches,
  logSearch,
  tagSlug,
  useDebounced,
  type SearchKind,
  type SearchRow,
} from "@/lib/search";
import {
  Search,
  X,
  Hash,
  Play,
  Image as ImageIcon,
  Clock,
  TrendingUp,
  Sparkles,
  WifiOff,
  Heart,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/explore")({
  ssr: false,
  component: ExplorePage,
});

function ExplorePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<SearchKind>("all");
  const [pages, setPages] = useState(1);
  const debounced = useDebounced(input, 250);
  const active = term.trim().length > 0;

  const submit = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v) return;
      setInput(v);
      setTerm(v);
      setPages(1);
      void logSearch(v).then(() => {
        qc.invalidateQueries({ queryKey: ["search-history"] });
        qc.invalidateQueries({ queryKey: ["trending-searches"] });
      });
    },
    [qc],
  );

  const suggestions = useQuery({
    queryKey: ["search-suggest", debounced],
    queryFn: () => fetchSuggestions(debounced),
    enabled: debounced.trim().length >= 2 && !active,
    staleTime: 60_000,
  });

  const results = useQuery({
    queryKey: ["search-results", term, tab, pages],
    queryFn: async () => {
      const chunks = await Promise.all(
        Array.from({ length: pages }, (_, i) => fetchSearch(term, tab, i)),
      );
      return chunks.flat();
    },
    enabled: active,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const canLoadMore = (results.data?.length ?? 0) >= pages * SEARCH_PAGE_SIZE;
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !canLoadMore || results.isFetching) return;
    const io = new IntersectionObserver(
      ([e]) => e.isIntersecting && setPages((p) => p + 1),
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, results.isFetching, results.data?.length]);

  return (
    <div className="pb-6">
      <header className="sticky top-0 z-20 glass-heavy hairline-b px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="relative"
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (!e.target.value.trim()) setTerm("");
            }}
            placeholder="Buscar pessoas, vídeos, #hashtags…"
            className="h-12 rounded-full border-transparent bg-[color:var(--surface-2)] pl-11 pr-11 text-[15px]"
            enterKeyHint="search"
          />
          {input ? (
            <button
              type="button"
              onClick={() => {
                setInput("");
                setTerm("");
              }}
              aria-label="Limpar"
              className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-[color:var(--surface)] text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </form>

        {active ? (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
            {SEARCH_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setTab(t.key);
                  setPages(1);
                }}
                className={
                  tab === t.key
                    ? "shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-foreground"
                    : "shrink-0 rounded-full bg-[color:var(--surface-2)] px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground"
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {!active && debounced.trim().length >= 2 ? (
        <SuggestionList
          loading={suggestions.isLoading}
          rows={suggestions.data ?? []}
          onPick={(label) => {
            if (label.startsWith("#")) {
              const slug = tagSlug(label);
              if (slug) {
                void logSearch(label);
                navigate({ to: "/t/$tag", params: { tag: slug } });
                return;
              }
            }
            submit(label);
          }}
        />
      ) : active ? (
        <ResultsView
          query={results}
          rows={results.data ?? []}
          onRelated={submit}
          sentinel={sentinel}
          canLoadMore={canLoadMore}
        />
      ) : (
        <DiscoveryView onPick={submit} />
      )}
    </div>
  );
}

/* ---------------- sugestões ---------------- */

function SuggestionList({
  loading,
  rows,
  onPick,
}: {
  loading: boolean;
  rows: { kind: string; label: string; sublabel: string | null; image: string | null }[];
  onPick: (label: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Continue digitando…</p>;
  }
  return (
    <ul className="p-2">
      {rows.map((r, i) => (
        <li key={`${r.kind}-${r.label}-${i}`}>
          <button
            onClick={() => onPick(r.label)}
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition active:bg-[color:var(--surface-2)]"
          >
            {r.kind === "user" ? (
              <UserAvatar avatarPath={r.image} displayName={r.label} className="h-9 w-9" />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--surface-2)] text-muted-foreground">
                {r.kind === "hashtag" ? <Hash className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{r.label}</span>
              {r.sublabel ? (
                <span className="block truncate text-[12px] text-muted-foreground">{r.sublabel}</span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- descoberta (campo vazio) ---------------- */

function DiscoveryView({ onPick }: { onPick: (term: string) => void }) {
  const qc = useQueryClient();
  const blocks = useBlocks();
  const hidden = blocks.data?.hidden;

  const history = useQuery({ queryKey: ["search-history"], queryFn: fetchHistory });
  const trendingTerms = useQuery({ queryKey: ["trending-searches"], queryFn: fetchTrendingSearches, staleTime: 120_000 });
  const trendingTags = useQuery({ queryKey: ["trending-hashtags"], queryFn: fetchTrendingHashtags, staleTime: 120_000 });
  const forMe = useQuery({ queryKey: ["suggested-for-me"], queryFn: fetchSuggestedForMe, staleTime: 120_000 });

  const removeOne = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("search_queries").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["search-history"] }),
  });
  const clearAll = useMutation({
    mutationFn: async () => {
      const ids = (history.data ?? []).map((h) => h.id);
      if (ids.length) await supabase.from("search_queries").delete().in("id", ids);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["search-history"] }),
  });

  const grid = useQuery({
    queryKey: ["explore", "posts", hidden ? hidden.size : 0],
    enabled: !!blocks.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, media_url, thumbnail_url, media_type, post_kind, author_id")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? []).filter((p) => !hidden!.has(p.author_id) && p.media_type !== "text").slice(0, 60);
    },
  });

  return (
    <div className="space-y-7 px-4 pt-4">
      {history.data && history.data.length > 0 ? (
        <section className="space-y-2">
          <SectionTitle icon={<Clock className="h-3.5 w-3.5" />} title="Pesquisas recentes">
            <button
              onClick={() => clearAll.mutate()}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              Limpar histórico
            </button>
          </SectionTitle>
          <ul>
            {history.data.map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <button
                  onClick={() => onPick(h.display_term)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-2.5 text-left"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--surface-2)] text-muted-foreground">
                    <Clock className="h-4 w-4" />
                  </span>
                  <span className="truncate text-[14px]">{h.display_term}</span>
                </button>
                <button
                  onClick={() => removeOne.mutate(h.id)}
                  aria-label={`Remover ${h.display_term}`}
                  className="shrink-0 p-2 text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {forMe.data && forMe.data.length > 0 ? (
        <section className="space-y-2.5">
          <SectionTitle icon={<Sparkles className="h-3.5 w-3.5" />} title="Você pode gostar" />
          <div className="flex flex-wrap gap-2">
            {forMe.data.map((s) => (
              <Link
                key={s.label}
                to="/t/$tag"
                params={{ tag: tagSlug(s.label) }}
                className="rounded-full bg-[color:var(--surface-2)] px-3.5 py-2 text-[13px] font-medium"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {trendingTerms.data && trendingTerms.data.length > 0 ? (
        <section className="space-y-1">
          <SectionTitle icon={<TrendingUp className="h-3.5 w-3.5" />} title="Pesquisas populares" />
          <ul>
            {trendingTerms.data.map((t, i) => (
              <li key={t.term}>
                <button
                  onClick={() => onPick(t.term)}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <span className="w-4 shrink-0 text-[13px] font-bold tabular text-primary">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{t.term}</span>
                  <span className="shrink-0 text-[12px] text-muted-foreground tabular">{t.hits}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {trendingTags.data && trendingTags.data.length > 0 ? (
        <section className="space-y-2.5">
          <SectionTitle icon={<Hash className="h-3.5 w-3.5" />} title="Hashtags em alta" />
          <div className="flex flex-wrap gap-2">
            {trendingTags.data.map((h) => (
              <Link
                key={h.tag}
                to="/t/$tag"
                params={{ tag: h.tag }}
                className="rounded-full border border-white/[0.07] bg-[color:var(--surface)] px-3.5 py-2 text-[13px]"
              >
                <span className="font-semibold">#{h.display_tag}</span>
                <span className="ml-1.5 text-muted-foreground tabular">{h.post_count}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2.5">
        <SectionTitle icon={<ImageIcon className="h-3.5 w-3.5" />} title="Em alta" />
        {grid.isLoading ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : grid.data && grid.data.length > 0 ? (
          <div className="grid grid-cols-3 gap-1">
            {grid.data.map((p) => (
              <MediaCell
                key={p.id}
                id={p.id}
                path={p.thumbnail_url ?? p.media_url}
                isVideo={p.media_type === "video" || p.post_kind === "reel"}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ainda não há publicações.</p>
        )}
      </section>
    </div>
  );
}

/* ---------------- resultados ---------------- */

function ResultsView({
  query,
  rows,
  onRelated,
  sentinel,
  canLoadMore,
}: {
  query: { isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => void };
  rows: SearchRow[];
  onRelated: (term: string) => void;
  sentinel: React.RefObject<HTMLDivElement | null>;
  canLoadMore: boolean;
}) {
  const related = useQuery({
    queryKey: ["trending-hashtags"],
    queryFn: fetchTrendingHashtags,
    staleTime: 120_000,
  });

  const grouped = useMemo(() => {
    const users = rows.filter((r) => r.kind === "user");
    const tags = rows.filter((r) => r.kind === "hashtag");
    const media = rows.filter((r) => r.kind === "video" || r.kind === "photo");
    const texts = rows.filter((r) => r.kind === "post");
    return { users, tags, media, texts };
  }, [rows]);

  if (query.isError) {
    return (
      <div className="mx-4 mt-8 rounded-3xl bg-[color:var(--surface)] p-8 text-center">
        <WifiOff className="mx-auto h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">
          Não conseguimos buscar agora. Verifique sua conexão.
        </p>
        <button
          onClick={() => query.refetch()}
          className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 pt-10 text-center">
        <p className="text-[15px] font-semibold">Nenhum resultado encontrado</p>
        <p className="mt-1 text-sm text-muted-foreground">Tente outro termo ou veja o que está em alta.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {(related.data ?? []).slice(0, 6).map((h) => (
            <button
              key={h.tag}
              onClick={() => onRelated(h.display_tag)}
              className="rounded-full bg-[color:var(--surface-2)] px-3.5 py-2 text-[13px]"
            >
              #{h.display_tag}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 pt-4">
      {grouped.users.length > 0 ? (
        <section className="space-y-1">
          {grouped.users.map((u) => (
            <Link
              key={u.id}
              to="/u/$username"
              params={{ username: u.author_username ?? "" }}
              className="flex items-center gap-3 rounded-2xl py-2.5"
            >
              <UserAvatar avatarPath={u.author_avatar} displayName={u.title ?? ""} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">
                  <VerifiedName
                    name={u.title ?? ""}
                    verified={!!u.author_verified}
                    badgeVariant={u.author_badge as never}
                  />
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {u.subtitle} · {u.count1 ?? 0} seguidores
                </div>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      {grouped.tags.length > 0 ? (
        <section className="space-y-1">
          {grouped.tags.map((h) => (
            <Link
              key={h.id}
              to="/t/$tag"
              params={{ tag: h.id }}
              className="flex items-center gap-3 rounded-2xl py-2.5"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color:var(--surface-2)]">
                <Hash className="h-5 w-5 text-primary" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold">{h.title}</div>
                <div className="text-[12px] text-muted-foreground">{h.subtitle}</div>
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      {grouped.media.length > 0 ? (
        <section className="grid grid-cols-3 gap-1">
          {grouped.media.map((m) => (
            <MediaCell
              key={m.id}
              id={m.id}
              path={m.image}
              isVideo={m.kind === "video"}
              likes={m.count1 ?? 0}
            />
          ))}
        </section>
      ) : null}

      {grouped.texts.length > 0 ? (
        <section className="space-y-2">
          {grouped.texts.map((p) => (
            <Link
              key={p.id}
              to="/p/$id"
              params={{ id: p.id }}
              className="block rounded-[20px] border border-white/[0.06] bg-[color:var(--surface)] p-4"
            >
              <div className="text-[11px] text-muted-foreground">{p.subtitle}</div>
              <p className="mt-1 line-clamp-3 text-[14px] leading-snug">{p.title}</p>
            </Link>
          ))}
        </section>
      ) : null}

      <div ref={sentinel} className="h-6" aria-hidden />
      {canLoadMore && query.isFetching ? (
        <p className="pb-4 text-center text-[12px] text-muted-foreground">Carregando mais…</p>
      ) : null}
    </div>
  );
}

/* ---------------- peças ---------------- */

function SectionTitle({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
      <div className="ml-auto">{children}</div>
    </div>
  );
}

export function MediaCell({
  id,
  path,
  isVideo,
  likes,
}: {
  id: string;
  path: string | null;
  isVideo: boolean;
  likes?: number;
}) {
  const isVideoFile = !!path && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(path);
  const content = (
    <div className="relative aspect-square overflow-hidden rounded-xl bg-[color:var(--surface-2)]">
      {path && isVideoFile ? (
        <VideoThumb path={path} />
      ) : path ? (
        <SignedImage bucket="posts" path={path} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-muted-foreground">
          <Play className="h-5 w-5" />
        </div>
      )}

      {isVideo ? (
        <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white">
          <Play className="h-3 w-3 fill-current" />
        </span>
      ) : null}
      {likes ? (
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <Heart className="h-3 w-3 fill-current" />
          {likes}
        </span>
      ) : null}
    </div>
  );

  return isVideo ? (
    <Link to="/reels" search={{ post: id } as never}>
      {content}
    </Link>
  ) : (
    <Link to="/p/$id" params={{ id }}>
      {content}
    </Link>
  );
}

/** Primeiro quadro do vídeo como miniatura (posts de vídeo não têm imagem salva). */
function VideoThumb({ path }: { path: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const { data: url } = useSignedUrl("posts", inView ? path : null);
  const [failed, setFailed] = useState(false);
  return (
    <div ref={ref} className="h-full w-full bg-gradient-to-br from-[color:var(--surface-2)] to-black">
      {url && !failed ? (
        <video
          src={`${url}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}
