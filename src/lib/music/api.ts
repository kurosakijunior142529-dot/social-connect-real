import { supabase } from "@/integrations/supabase/client";
import { MUSIC_VIBES, renderVibe } from "@/lib/music-catalog";

export type MusicTrack = {
  id: string;
  provider: string;
  external_id: string | null;
  title: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
  duration_ms: number;
  audio_source: string;
  audio_url: string | null;
  is_available: boolean;
};

export type MusicSelection = {
  track: MusicTrack;
  startMs: number;
  endMs: number;
  /** volume da música (0..1) */
  volume: number;
  /** volume do áudio original do vídeo (0..1) */
  originalVolume: number;
};

export const MAX_CLIP_MS = 30_000;

export function clipLength(sel: Pick<MusicSelection, "startMs" | "endMs">) {
  return Math.max(0, sel.endMs - sel.startMs);
}

export function fmtMs(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const TRACK_SELECT =
  "id, provider, external_id, title, artist, album, cover_url, duration_ms, audio_source, audio_url, is_available";

export async function listVibelyTracks(): Promise<MusicTrack[]> {
  const { data } = await supabase
    .from("music_tracks")
    .select(TRACK_SELECT)
    .eq("provider", "vibely")
    .order("title");
  return (data ?? []) as MusicTrack[];
}

export async function searchLocalTracks(q: string): Promise<MusicTrack[]> {
  const term = q.trim();
  let query = supabase.from("music_tracks").select(TRACK_SELECT).limit(30);
  if (term) {
    const like = `%${term}%`;
    query = query.or(`title.ilike.${like},artist.ilike.${like},album.ilike.${like}`);
  } else {
    query = query.eq("provider", "vibely");
  }
  const { data } = await query;
  return (data ?? []) as MusicTrack[];
}

export async function getTrack(id: string): Promise<MusicTrack | null> {
  const { data } = await supabase.from("music_tracks").select(TRACK_SELECT).eq("id", id).maybeSingle();
  return (data as MusicTrack | null) ?? null;
}

/** Garante uma linha de metadados para uma faixa vinda de um provedor externo. */
export async function ensureProviderTrack(t: {
  provider: string;
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  durationMs: number;
  previewUrl: string | null;
}): Promise<MusicTrack | null> {
  const existing = await supabase
    .from("music_tracks")
    .select(TRACK_SELECT)
    .eq("provider", t.provider)
    .eq("external_id", t.externalId)
    .maybeSingle();
  if (existing.data) return existing.data as MusicTrack;
  const { data, error } = await supabase
    .from("music_tracks")
    .insert({
      provider: t.provider,
      external_id: t.externalId,
      title: t.title,
      artist: t.artist,
      album: t.album,
      cover_url: t.coverUrl,
      duration_ms: t.durationMs,
      // Só a prévia oficial é reproduzível; sem prévia a faixa fica só como metadado.
      audio_source: t.previewUrl ? "preview" : "metadata",
      audio_url: t.previewUrl,
    })
    .select(TRACK_SELECT)
    .maybeSingle();
  if (error) {
    console.warn("[music] ensure track failed", error);
    return null;
  }
  return (data as MusicTrack | null) ?? null;
}

/** URL de áudio realmente tocável para a faixa, ou null quando não houver fonte autorizada. */
export async function trackAudioUrl(track: MusicTrack): Promise<string | null> {
  if (!track.is_available) return null;
  if (track.audio_source === "vibely") {
    const vibe = MUSIC_VIBES.find((v) => v.id === track.external_id);
    if (!vibe) return null;
    try {
      return await renderVibe(vibe, 60);
    } catch {
      return null;
    }
  }
  return track.audio_url;
}

export function playableDurationMs(track: MusicTrack) {
  if (track.audio_source === "vibely") return 60_000;
  return track.duration_ms || 30_000;
}

export async function postsUsingTrack(trackId: string, limit = 60) {
  const { data } = await supabase
    .from("posts")
    .select("id, media_url, media_type, caption, author_id, created_at")
    .eq("music_track_id", trackId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function countPostsUsingTrack(trackId: string) {
  const { count } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("music_track_id", trackId);
  return count ?? 0;
}
