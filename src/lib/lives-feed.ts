import { supabase } from "@/integrations/supabase/client";

export type LiveFeedRow = {
  id: string;
  host_id: string;
  title: string;
  category: string | null;
  tags: string[] | null;
  thumbnail_url: string | null;
  viewer_count: number;
  peak_viewer_count: number;
  started_at: string | null;
  ended_at?: string | null;
  language?: string | null;
  age_restricted?: boolean;
  host: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    is_verified: boolean;
    badge_variant: string | null;
  } | null;
};

async function attachHosts(rows: any[]): Promise<LiveFeedRow[]> {
  if (!rows.length) return [];
  const ids = Array.from(new Set(rows.map((r) => r.host_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, is_verified, badge_variant")
    .in("id", ids);
  const map = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows.map((r) => ({ ...r, host: (map.get(r.host_id) as any) ?? null }));
}

/** Closes abandoned broadcasts, then returns the ones actually streaming. */
export async function fetchActiveLives(limit = 60): Promise<LiveFeedRow[]> {
  try {
    await (supabase as any).rpc("end_stale_lives");
  } catch {
    /* best effort — listing still filters by heartbeat below */
  }
  const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const { data } = await (supabase as any)
    .from("lives")
    .select(
      "id, host_id, title, category, tags, thumbnail_url, viewer_count, peak_viewer_count, started_at, language, age_restricted, last_heartbeat_at",
    )
    .eq("status", "live")
    .gte("last_heartbeat_at", cutoff)
    .order("viewer_count", { ascending: false })
    .limit(limit);
  return attachHosts((data ?? []) as any[]);
}

export async function fetchPastLives(limit = 20): Promise<LiveFeedRow[]> {
  const { data } = await (supabase as any)
    .from("lives")
    .select("id, host_id, title, category, tags, thumbnail_url, viewer_count, peak_viewer_count, started_at, ended_at")
    .eq("status", "ended")
    .order("ended_at", { ascending: false })
    .limit(limit);
  return attachHosts((data ?? []) as any[]);
}

export function timeOnAir(startedAt: string | null | undefined): string {
  if (!startedAt) return "agora";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/** Duração de um replay, no formato 1h 12min / 42min. */
export function replayDuration(startedAt?: string | null, endedAt?: string | null): string | null {
  if (!startedAt || !endedAt) return null;
  const mins = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  if (mins < 1) return "menos de 1min";
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

export type SocialGraph = { following: Set<string>; friends: Set<string> };

/** Quem o usuário segue e quem segue de volta (amigos). */
export async function fetchSocialGraph(userId: string | null | undefined): Promise<SocialGraph> {
  if (!userId) return { following: new Set(), friends: new Set() };
  const [{ data: out }, { data: inc }] = await Promise.all([
    supabase.from("follows").select("following_id").eq("follower_id", userId),
    supabase.from("follows").select("follower_id").eq("following_id", userId),
  ]);
  const following = new Set((out ?? []).map((r: any) => r.following_id as string));
  const followers = new Set((inc ?? []).map((r: any) => r.follower_id as string));
  const friends = new Set([...following].filter((id) => followers.has(id)));
  return { following, friends };
}

