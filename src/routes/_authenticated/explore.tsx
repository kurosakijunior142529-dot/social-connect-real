import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useInView } from "@/hooks/use-in-view";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { SignedImage } from "@/components/signed-image";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedName } from "@/components/verified-badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useBlocks } from "@/hooks/use-blocks";
import { searchAsk } from "@/lib/search-ask.functions";
import {
  RESULT_TABS,
  SEEN_FILTERS,
  SORT_MODES,
  PERIODS,
  DEFAULT_FILTERS,
  SEARCH_PAGE_SIZE,
  activeFilterCount,
  clearViewHistory,
  fetchDidYouMean,
  fetchHistory,
  fetchPlaces,
  fetchPopularSearches,
  fetchRecommended,
  fetchRelatedSearches,
  fetchSearchV2,
  fetchSuggestions,
  fetchTrendingTopics,
  fetchViewHistory,
  logSearch,
  recomputeMyAffinity,
  speechSupported,
  startVoiceSearch,
  tagSlug,
  useDebounced,
  type ResultTab,
  type SearchFilters,
  type SearchRowV2,
} from "@/lib/search";
import {
  Search,
  X,
  Hash,
  Play,
  Clock,
  TrendingUp,
  Sparkles,
  WifiOff,
  Heart,
  Mic,
  SlidersHorizontal,
  Eye,
  Flame,
  MapPin,
  ArrowUpRight,
  Bot,
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
  const [tab, setTab] = useState<ResultTab>("best");
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pages, setPages] = useState(1);
  const [listening, setListening] = useState(false);
  const stopVoice = useRef<() => void>(() => {});
  const debounced = useDebounced(input, 250);
  const active = term.trim().length > 0;

  // mantém a personalização atualizada sem pesar a navegação
  useEffect(() => {
    void recomputeMyAffinity();
  }, []);

  const submit = useCallback(
    (value: string) => {
      const v = value.trim();
      if (!v) return;
      setInput(v);
      setTerm(v);
      setPages(1);
      void logSearch(v).then(() => {
        qc.invalidateQueries({ queryKey: ["search-history"] });
        qc.invalidateQueries({ queryKey: ["popular-searches"] });
      });
    },
    [qc],
  );

  const toggleVoice = () => {
    if (listening) {
      stopVoice.current();
      setListening(false);
      return;
    }
    if (!speechSupported()) return;
    setListening(true);
    let heard = "";
    stopVoice.current = startVoiceSearch(
      (text) => {
        heard = text;
        setInput(text);
      },
      () => {
        setListening(false);
        if (heard.trim()) submit(heard);
      },
    );
  };

  const suggestions = useQuery({
    queryKey: ["search-suggest", debounced],
    queryFn: () => fetchSuggestions(debounced),
    enabled: debounced.trim().length >= 2 && !active,
    staleTime: 60_000,
  });

  const results = useQuery({
    queryKey: ["search-v2", term, tab, filters, pages],
    queryFn: async () => {
      const chunks = await Promise.all(
        Array.from({ length: pages }, (_, i) => fetchSearchV2(term, tab, filters, i)),
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
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setPages((p) => p + 1), {
      rootMargin: "400px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [canLoadMore, results.isFetching, results.data?.length]);

  const filterCount = activeFilterCount(filters);

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
            className="h-12 rounded-full border-transparent bg-[color:var(--surface-2)] pl-11 pr-20 text-[15px]"
            enterKeyHint="search"
          />
          <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {input ? (
              <button
                type="button"
                onClick={() => {
                  setInput("");
                  setTerm("");
                }}
                aria-label="Limpar"
                className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--surface)] text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            {speechSupported() ? (
              <button
                type="button"
                onClick={toggleVoice}
                aria-label={listening ? "Parar de ouvir" : "Buscar por voz"}
                className={
                  listening
                    ? "grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"
                    : "grid h-8 w-8 place-items-center rounded-full bg-[color:var(--surface)] text-muted-foreground"
                }
              >
                <Mic className={listening ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
              </button>
            ) : null}
          </div>
        </form>

        {listening ? (
          <p className="pt-2 text-center text-[12px] text-primary">Ouvindo… fale agora</p>
        ) : null}

        {active ? (
          <div className="-mx-4 mt-3 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
            {RESULT_TABS.map((t) => (
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
                {t.key === "ask" ? (
                  <span className="flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5" />
                    {t.label}
                  </span>
                ) : (
                  t.label
                )}
              </button>
            ))}
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={
                filterCount > 0
                  ? "ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[13px] font-semibold text-primary"
                  : "ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-[13px] text-muted-foreground"
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {filterCount > 0 ? filterCount : "Filtros"}
            </button>
          </div>
        ) : null}

        {active && filtersOpen ? (
          <FiltersPanel
            value={filters}
            onChange={(f) => {
              setFilters(f);
              setPages(1);
            }}
            onClose={() => setFiltersOpen(false)}
          />
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
          term={term}
          tab={tab}
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

/* ---------------- filtros ---------------- */

function FiltersPanel({
  value,
  onChange,
  onClose,
}: {
  value: SearchFilters;
  onChange: (f: SearchFilters) => void;
  onClose: () => void;
}) {
  const [placeInput, setPlaceInput] = useState(value.place ?? "");
  const debouncedPlace = useDebounced(placeInput, 300);
  const places = useQuery({
    queryKey: ["search-places", debouncedPlace],
    queryFn: () => fetchPlaces(debouncedPlace),
    enabled: debouncedPlace.trim().length >= 2,
    staleTime: 120_000,
  });

  return (
    <div className="mt-3 space-y-3 rounded-[20px] border border-white/[0.07] bg-[color:var(--surface)] p-3">
      <FilterRow label="Mostrar">
        {SEEN_FILTERS.map((f) => (
          <Chip
            key={f.key}
            active={value.seen === f.key}
            onClick={() => onChange({ ...value, seen: f.key })}
          >
            {f.label}
          </Chip>
        ))}
      </FilterRow>
      <FilterRow label="Ordenar por">
        {SORT_MODES.map((s) => (
          <Chip
            key={s.key}
            active={value.sort === s.key}
            onClick={() => onChange({ ...value, sort: s.key })}
          >
            {s.label}
          </Chip>
        ))}
      </FilterRow>
      <FilterRow label="Período">
        {PERIODS.map((p) => (
          <Chip
            key={p.key}
            active={value.period === p.key}
            onClick={() => onChange({ ...value, period: p.key })}
          >
            {p.label}
          </Chip>
        ))}
      </FilterRow>

      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Local
        </div>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={placeInput}
            onChange={(e) => setPlaceInput(e.target.value)}
            placeholder="Cidade ou região"
            className="h-10 rounded-full border-transparent bg-[color:var(--surface-2)] pl-9 text-[14px]"
          />
        </div>
        {value.place ? (
          <Chip active onClick={() => {
            onChange({ ...value, place: null });
            setPlaceInput("");
          }}>
            {value.place} ✕
          </Chip>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {(places.data ?? []).map((p) => (
            <Chip
              key={p.place}
              active={value.place === p.place}
              onClick={() => onChange({ ...value, place: p.place })}
            >
              {p.place} · {p.people}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex justify-between pt-1">
        <button
          onClick={() => {
            onChange(DEFAULT_FILTERS);
            setPlaceInput("");
          }}
          className="text-[13px] text-muted-foreground"
        >
          Limpar filtros
        </button>
        <button onClick={onClose} className="text-[13px] font-semibold text-primary">
          Pronto
        </button>
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground"
          : "rounded-full bg-[color:var(--surface-2)] px-3 py-1.5 text-[12.5px] text-muted-foreground"
      }
    >
      {children}
    </button>
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
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- descoberta (campo vazio) ---------------- */

function DiscoveryView({ onPick }: { onPick: (term: string) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const blocks = useBlocks();
  const hidden = blocks.data?.hidden;

  const history = useQuery({ queryKey: ["search-history"], queryFn: fetchHistory });
  const popular = useQuery({
    queryKey: ["popular-searches"],
    queryFn: fetchPopularSearches,
    staleTime: 120_000,
  });
  const trending = useQuery({
    queryKey: ["trending-topics"],
    queryFn: fetchTrendingTopics,
    staleTime: 120_000,
  });
  const recommended = useQuery({
    queryKey: ["recommended-for-me"],
    queryFn: fetchRecommended,
    staleTime: 120_000,
  });
  const viewed = useQuery({ queryKey: ["view-history"], queryFn: fetchViewHistory });

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
  const clearViews = useMutation({
    mutationFn: clearViewHistory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["view-history"] }),
  });

  const grid = useQuery({
    queryKey: ["explore", "posts", hidden ? hidden.size : 0],
    enabled: !!blocks.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, media_url, thumbnail_url, media_type, post_kind, author_id, view_count")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      return (data ?? [])
        .filter((p) => !hidden!.has(p.author_id) && p.media_type !== "text")
        .slice(0, 60);
    },
  });

  const hashtagsUp = (trending.data ?? []).filter((t) => t.kind === "hashtag");
  const termsUp = (trending.data ?? []).filter((t) => t.kind === "term");

  return (
    <div className="space-y-7 px-4 pt-4">
      {hashtagsUp.length > 0 ? (
        <section className="space-y-2.5">
          <SectionTitle icon={<Flame className="h-3.5 w-3.5" />} title="Em alta agora" />
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {hashtagsUp.map((t) => (
              <Link
                key={t.slug}
                to="/t/$tag"
                params={{ tag: t.slug }}
                className="shrink-0 rounded-[18px] border border-white/[0.07] bg-[color:var(--surface)] px-4 py-3"
              >
                <div className="text-[14px] font-semibold">#{t.label}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted-foreground tabular">
                  <span>{t.posts} publicações</span>
                  {t.growth && t.growth > 0 ? (
                    <span className="flex items-center gap-0.5 font-semibold text-primary">
                      <TrendingUp className="h-3 w-3" />
                      {Math.round(t.growth)}%
                    </span>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {popular.data && popular.data.length > 0 ? (
        <section className="space-y-1">
          <SectionTitle icon={<TrendingUp className="h-3.5 w-3.5" />} title="Pesquisas populares" />
          <ul>
            {popular.data.map((t, i) => (
              <li key={t.term}>
                <button
                  onClick={() => onPick(t.display_term)}
                  className="flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <span className="w-4 shrink-0 text-[13px] font-bold tabular text-primary">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{t.display_term}</span>
                  {t.growth && t.growth > 0 ? (
                    <span className="shrink-0 text-[11.5px] font-semibold text-primary tabular">
                      +{Math.round(t.growth)}%
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[12px] text-muted-foreground tabular">{t.hits}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {termsUp.length > 0 ? (
        <section className="space-y-2.5">
          <SectionTitle icon={<TrendingUp className="h-3.5 w-3.5" />} title="Tendências" />
          <div className="flex flex-wrap gap-2">
            {termsUp.map((t) => (
              <button
                key={t.slug}
                onClick={() => onPick(t.label)}
                className="rounded-full bg-[color:var(--surface-2)] px-3.5 py-2 text-[13px] font-medium"
              >
                {t.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {recommended.data && recommended.data.length > 0 ? (
        <section className="space-y-2.5">
          <SectionTitle icon={<Sparkles className="h-3.5 w-3.5" />} title="Você pode gostar" />
          <div className="flex flex-wrap gap-2">
            {recommended.data.map((s) =>
              s.kind === "user" ? (
                <button
                  key={`u-${s.slug}`}
                  onClick={() => navigate({ to: "/u/$username", params: { username: s.slug } })}
                  className="flex items-center gap-2 rounded-full bg-[color:var(--surface-2)] py-1.5 pl-1.5 pr-3.5"
                >
                  <UserAvatar avatarPath={s.image} displayName={s.label} className="h-7 w-7" />
                  <span className="text-[13px] font-medium">{s.label}</span>
                </button>
              ) : (
                <Link
                  key={`h-${s.slug}`}
                  to="/t/$tag"
                  params={{ tag: s.slug }}
                  className="rounded-full bg-[color:var(--surface-2)] px-3.5 py-2 text-[13px] font-medium"
                >
                  #{s.label}
                </Link>
              ),
            )}
          </div>
        </section>
      ) : null}

      {history.data && history.data.length > 0 ? (
        <section className="space-y-2">
          <SectionTitle icon={<Clock className="h-3.5 w-3.5" />} title="Pesquisas recentes">
            <button
              onClick={() => clearAll.mutate()}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              Limpar
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

      {viewed.data && viewed.data.length > 0 ? (
        <section className="space-y-2.5">
          <SectionTitle icon={<Eye className="h-3.5 w-3.5" />} title="Você viu recentemente">
            <button
              onClick={() => clearViews.mutate()}
              className="text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
          </SectionTitle>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {viewed.data
              .filter((v) => v.posts)
              .map((v) => (
                <div key={v.post_id} className="w-24 shrink-0">
                  <MediaCell
                    id={v.post_id}
                    path={v.posts!.thumbnail_url ?? v.posts!.media_url}
                    isVideo={v.posts!.media_type === "video" || v.posts!.post_kind === "reel"}
                  />
                </div>
              ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-2.5">
        <SectionTitle icon={<Play className="h-3.5 w-3.5" />} title="Explorar" />
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
  term,
  tab,
  query,
  rows,
  onRelated,
  sentinel,
  canLoadMore,
}: {
  term: string;
  tab: ResultTab;
  query: { isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => void };
  rows: SearchRowV2[];
  onRelated: (term: string) => void;
  sentinel: React.RefObject<HTMLDivElement | null>;
  canLoadMore: boolean;
}) {
  const related = useQuery({
    queryKey: ["related-searches", term],
    queryFn: () => fetchRelatedSearches(term),
    staleTime: 120_000,
  });
  const didYouMean = useQuery({
    queryKey: ["did-you-mean", term],
    queryFn: () => fetchDidYouMean(term),
    enabled: rows.length < 3,
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

  return (
    <div className="space-y-6 px-4 pt-4">
      {tab === "ask" ? <AskBlock term={term} /> : null}

      {didYouMean.data ? (
        <p className="text-[13px] text-muted-foreground">
          Você quis dizer{" "}
          <button
            onClick={() => onRelated(didYouMean.data!.suggestion)}
            className="font-semibold text-primary"
          >
            {didYouMean.data.kind === "hashtag" ? "#" : ""}
            {didYouMean.data.suggestion}
          </button>
          ?
        </p>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="pt-6 text-center">
          <p className="text-[15px] font-semibold">Nenhum resultado encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tente outro termo, ajuste os filtros ou veja algo relacionado.
          </p>
        </div>
      ) : (
        <>
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
                      {u.subtitle} · {u.count1 ?? 0} seguidores · {u.count2 ?? 0} publicações
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
                  seen={!!m.seen}
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
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{p.subtitle}</span>
                    {p.seen ? <span className="text-[10.5px]">· já visto</span> : null}
                  </div>
                  <p className="mt-1 line-clamp-3 text-[14px] leading-snug">{p.title}</p>
                </Link>
              ))}
            </section>
          ) : null}
        </>
      )}

      {related.data && related.data.length > 0 ? (
        <section className="space-y-2.5 pt-2">
          <SectionTitle icon={<Search className="h-3.5 w-3.5" />} title="Pesquisas relacionadas" />
          <div className="flex flex-wrap gap-2">
            {related.data.map((r) => (
              <button
                key={`${r.kind}-${r.term}`}
                onClick={() => onRelated(r.term)}
                className="rounded-full bg-[color:var(--surface-2)] px-3.5 py-2 text-[13px]"
              >
                {r.term}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div ref={sentinel} className="h-6" aria-hidden />
      {canLoadMore && query.isFetching ? (
        <p className="pb-4 text-center text-[12px] text-muted-foreground">Carregando mais…</p>
      ) : null}
    </div>
  );
}

/* ---------------- aba Perguntar ---------------- */

function AskBlock({ term }: { term: string }) {
  const ask = useServerFn(searchAsk);
  const answer = useQuery({
    queryKey: ["search-ask", term],
    queryFn: () => ask({ data: { q: term } }),
    enabled: term.trim().length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return (
    <div className="rounded-[22px] border border-primary/25 bg-primary/[0.06] p-4">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
        <Bot className="h-3.5 w-3.5" />
        Resposta com base no app
      </div>
      {answer.isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-4 w-full rounded-full" />
          <Skeleton className="h-4 w-4/5 rounded-full" />
        </div>
      ) : answer.isError ? (
        <p className="mt-2 text-[14px] text-muted-foreground">
          Não consegui responder agora. Os resultados abaixo continuam valendo.
        </p>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-[14.5px] leading-relaxed">
          {answer.data?.answer}
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Só usamos publicações, pessoas e hashtags que existem no Vibely.
      </p>
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
      <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      <div className="ml-auto">{children}</div>
    </div>
  );
}

export function MediaCell({
  id,
  path,
  isVideo,
  likes,
  views,
  seen,
}: {
  id: string;
  path: string | null;
  isVideo: boolean;
  likes?: number;
  /** Visualizações — exibidas só aqui (navegar/pesquisar). */
  views?: number | null;
  seen?: boolean;
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

      {seen ? <div className="absolute inset-0 bg-black/45" /> : null}

      {isVideo ? (
        <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white">
          <Play className="h-3 w-3 fill-current" />
        </span>
      ) : null}
      {seen ? (
        <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/55 text-white">
          <Eye className="h-3 w-3" />
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
