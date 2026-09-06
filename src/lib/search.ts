import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SearchKind = "all" | "videos" | "photos" | "users" | "hashtags" | "posts";

export const SEARCH_TABS: { key: SearchKind; label: string }[] = [
  { key: "all", label: "Tudo" },
  { key: "videos", label: "Vídeos" },
  { key: "photos", label: "Fotos" },
  { key: "users", label: "Usuários" },
  { key: "hashtags", label: "Hashtags" },
  { key: "posts", label: "Publicações" },
];

export type SearchRow = {
  kind: "user" | "hashtag" | "video" | "photo" | "post";
  id: string;
  title: string | null;
  subtitle: string | null;
  image: string | null;
  media_type: string | null;
  post_kind: string | null;
  author_username: string | null;
  author_display: string | null;
  author_avatar: string | null;
  author_verified: boolean | null;
  author_badge: string | null;
  count1: number | null;
  count2: number | null;
  score: number;
  created_at: string;
};

export type SuggestRow = {
  kind: "hashtag" | "user" | "term";
  label: string;
  sublabel: string | null;
  image: string | null;
  score: number;
};

export const SEARCH_PAGE_SIZE = 20;

/** Remove acentos e normaliza para comparação/rota. */
export function normalizeTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function tagSlug(value: string) {
  return normalizeTerm(value.replace(/^#/, "")).replace(/[^a-z0-9_]/g, "");
}

/** Espera o usuário parar de digitar antes de consultar o banco. */
export function useDebounced<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function fetchSearch(q: string, kind: SearchKind, page: number) {
  const { data, error } = await rpc("search_all", {
    _q: q,
    _kind: kind,
    _limit: SEARCH_PAGE_SIZE,
    _offset: page * SEARCH_PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SearchRow[];
}

export async function fetchSuggestions(q: string) {
  const { data, error } = await rpc("search_suggest", { _q: q });
  if (error) throw new Error(error.message);
  return (data ?? []) as SuggestRow[];
}

export async function logSearch(term: string) {
  await rpc("log_search", { _term: term });
}

export async function fetchHistory() {
  const { data, error } = await rpc("my_search_history", { _limit: 12 });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; display_term: string; created_at: string }[];
}

export async function fetchTrendingSearches() {
  const { data } = await rpc("trending_searches", { _limit: 8 });
  return (data ?? []) as { term: string; hits: number; growth: number | null }[];
}

export async function fetchTrendingHashtags() {
  const { data } = await rpc("trending_hashtags", { _limit: 12 });
  return (data ?? []) as { tag: string; display_tag: string; post_count: number; recent: number }[];
}

export async function fetchSuggestedForMe() {
  const { data } = await rpc("suggested_for_me", { _limit: 8 });
  return (data ?? []) as { kind: string; label: string; sublabel: string | null }[];
}

export async function fetchHashtagInfo(tag: string) {
  const { data } = await rpc("hashtag_info", { _tag: tag });
  const rows = (data ?? []) as { tag: string; display_tag: string; post_count: number }[];
  return rows[0] ?? null;
}

export type HashtagPost = {
  id: string;
  media_url: string | null;
  thumbnail_url: string | null;
  media_type: string;
  post_kind: string;
  caption: string | null;
  view_count: number;
  likes: number;
  comments: number;
  created_at: string;
  author_username: string;
  author_display: string;
  author_avatar: string | null;
};

export async function fetchHashtagFeed(tag: string, sort: "recent" | "popular", page: number) {
  const { data, error } = await rpc("hashtag_feed", {
    _tag: tag,
    _sort: sort,
    _limit: 24,
    _offset: page * 24,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as HashtagPost[];
}

export async function logHashtagView(tag: string) {
  await rpc("log_hashtag_view", { _tag: tag });
}

/* ==================== Central de busca v2 ==================== */

export type ResultTab = "ask" | "best" | "videos" | "photos" | "users" | "hashtags";

export const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: "ask", label: "Perguntar" },
  { key: "best", label: "Melhores" },
  { key: "videos", label: "Vídeos" },
  { key: "photos", label: "Fotos" },
  { key: "users", label: "Usuários" },
  { key: "hashtags", label: "Hashtags" },
];

export type SeenFilter = "all" | "unseen" | "seen" | "fresh";
export type SortMode = "relevance" | "recent" | "views" | "likes" | "comments";
export type PeriodFilter = "all" | "day" | "week" | "month";

export const SEEN_FILTERS: { key: SeenFilter; label: string }[] = [
  { key: "all", label: "Tudo" },
  { key: "unseen", label: "Ainda não vi" },
  { key: "seen", label: "Já vi" },
  { key: "fresh", label: "Novidades" },
];

export const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: "relevance", label: "Mais relevantes" },
  { key: "recent", label: "Mais recentes" },
  { key: "views", label: "Mais vistos" },
  { key: "likes", label: "Mais curtidos" },
  { key: "comments", label: "Mais comentados" },
];

export const PERIODS: { key: PeriodFilter; label: string }[] = [
  { key: "all", label: "Sempre" },
  { key: "day", label: "24 horas" },
  { key: "week", label: "7 dias" },
  { key: "month", label: "30 dias" },
];

export type SearchFilters = {
  seen: SeenFilter;
  sort: SortMode;
  period: PeriodFilter;
  place: string | null;
};

export const DEFAULT_FILTERS: SearchFilters = {
  seen: "all",
  sort: "relevance",
  period: "all",
  place: null,
};

export function activeFilterCount(f: SearchFilters) {
  return (
    (f.seen !== "all" ? 1 : 0) +
    (f.sort !== "relevance" ? 1 : 0) +
    (f.period !== "all" ? 1 : 0) +
    (f.place ? 1 : 0)
  );
}

export type SearchRowV2 = SearchRow & { views: number | null; seen: boolean | null };

export async function fetchSearchV2(
  q: string,
  tab: ResultTab,
  filters: SearchFilters,
  page: number,
) {
  const { data, error } = await rpc("search_v2", {
    _q: q,
    _kind: tab === "ask" ? "best" : tab,
    _filter: filters.seen,
    _sort: filters.sort,
    _period: filters.period,
    _place: filters.place,
    _limit: SEARCH_PAGE_SIZE,
    _offset: page * SEARCH_PAGE_SIZE,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SearchRowV2[];
}

export type TrendingTopic = {
  kind: string;
  label: string;
  slug: string;
  posts: number;
  growth: number | null;
};

export async function fetchTrendingTopics() {
  const { data } = await rpc("trending_topics", { _limit: 12 });
  return (data ?? []) as TrendingTopic[];
}

export async function fetchPopularSearches() {
  const { data } = await rpc("popular_searches", { _limit: 10 });
  return (data ?? []) as { term: string; display_term: string; hits: number; growth: number | null }[];
}

export async function fetchRecommended() {
  const { data } = await rpc("recommended_for_me", { _limit: 12 });
  return (data ?? []) as {
    kind: string;
    label: string;
    slug: string;
    sublabel: string | null;
    image: string | null;
  }[];
}

export async function fetchRelatedSearches(q: string) {
  const { data } = await rpc("related_searches", { _q: q, _limit: 8 });
  return (data ?? []) as { term: string; kind: string }[];
}

export async function fetchRelatedHashtags(tag: string) {
  const { data } = await rpc("related_hashtags", { _tag: tag, _limit: 8 });
  return (data ?? []) as { tag: string; display_tag: string; post_count: number; weight: number }[];
}

export async function fetchDidYouMean(q: string) {
  const { data } = await rpc("search_did_you_mean", { _q: q });
  const rows = (data ?? []) as { suggestion: string; kind: string }[];
  return rows[0] ?? null;
}

export async function fetchPlaces(q: string) {
  const { data } = await rpc("search_places", { _q: q, _limit: 5 });
  return (data ?? []) as { place: string; people: number }[];
}

/** Registra que a pessoa realmente viu esta publicação. */
export async function logPostView(postId: string) {
  await rpc("log_post_view", { _post_id: postId });
}

export async function recomputeMyAffinity() {
  await rpc("recompute_my_affinity", {});
}

/** Histórico do que a pessoa já viu (privado). */
export async function fetchViewHistory() {
  const { data, error } = await supabase
    .from("post_views")
    .select("post_id, viewed_at, posts(id, media_url, thumbnail_url, media_type, post_kind)")
    .order("viewed_at", { ascending: false })
    .limit(24);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as {
    post_id: string;
    viewed_at: string;
    posts: {
      id: string;
      media_url: string | null;
      thumbnail_url: string | null;
      media_type: string | null;
      post_kind: string | null;
    } | null;
  }[];
}

export async function clearViewHistory() {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return;
  await supabase.from("post_views").delete().eq("user_id", uid);
}

/** Reconhecimento de voz do navegador (quando disponível). */
export function speechSupported() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w["SpeechRecognition"] || w["webkitSpeechRecognition"]);
}

export function startVoiceSearch(
  onResult: (text: string) => void,
  onEnd?: (error?: string) => void,
) {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
    | (new () => any)
    | undefined;
  if (!Ctor) {
    onEnd?.("unsupported");
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = "pt-BR";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e: any) => {
    const text = Array.from(e.results as ArrayLike<any>)
      .map((r: any) => r[0].transcript)
      .join(" ")
      .trim();
    if (text) onResult(text);
  };
  rec.onerror = (e: any) => onEnd?.(String(e?.error ?? "error"));
  rec.onend = () => onEnd?.();
  rec.start();
  return () => {
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  };
}
