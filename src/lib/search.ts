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
