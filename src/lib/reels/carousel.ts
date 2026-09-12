/**
 * Reels — mídias extras (carrossel) e contexto social de republicação.
 * Nada aqui altera o feed tradicional: é usado só na aba Reels.
 */
import { supabase } from "@/integrations/supabase/client";

export type ReelMedia = {
  id: string;
  post_id: string;
  position: number;
  media_type: "image" | "video";
  media_url: string;
  thumbnail_url: string | null;
};

export type RepostInfo = {
  post_id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  comment: string | null;
  created_at: string;
  is_following: boolean;
  total_reposts: number;
};

/** Mídias adicionais de cada Reel, na ordem de publicação. */
export async function fetchPostMedia(postIds: string[]) {
  const out = new Map<string, ReelMedia[]>();
  if (postIds.length === 0) return out;
  const { data, error } = await (supabase as any)
    .from("post_media")
    .select("id, post_id, position, media_type, media_url, thumbnail_url")
    .in("post_id", postIds)
    .order("position", { ascending: true });
  if (error) return out;
  for (const row of (data ?? []) as ReelMedia[]) {
    const list = out.get(row.post_id) ?? [];
    list.push(row);
    out.set(row.post_id, list);
  }
  return out;
}

/** Quem republicou cada Reel (prioriza quem a pessoa segue). */
export async function fetchRepostContext(postIds: string[]) {
  const out = new Map<string, RepostInfo[]>();
  if (postIds.length === 0) return out;
  const { data, error } = await (supabase.rpc as any)("reel_repost_context", { _post_ids: postIds });
  if (error) return out;
  for (const row of (data ?? []) as RepostInfo[]) {
    const list = out.get(row.post_id) ?? [];
    list.push(row);
    out.set(row.post_id, list);
  }
  return out;
}

/** Texto agrupado: "João, Maria e mais 3 republicaram". */
export function repostHeadline(list: RepostInfo[]) {
  const names = list
    .slice(0, 3)
    .map((r) => r.display_name || (r.username ? `@${r.username}` : "alguém"));
  const rest = list.length - names.length;
  if (names.length === 0) return "";
  const base =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  if (rest > 0) return `${base} e mais ${rest} republicaram`;
  return `${base} republic${names.length === 1 ? "ou" : "aram"}`;
}
