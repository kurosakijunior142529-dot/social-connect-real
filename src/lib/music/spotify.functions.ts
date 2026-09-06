import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProviderTrack = {
  provider: "spotify";
  externalId: string;
  title: string;
  artist: string;
  album: string | null;
  coverUrl: string | null;
  durationMs: number;
  /** prévia oficial autorizada pelo provedor (pode não existir) */
  previewUrl: string | null;
};

let cachedToken: { value: string; exp: number } | null = null;

async function token(id: string, secret: string): Promise<string | null> {
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cachedToken = { value: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

/**
 * Busca APENAS metadados no Spotify (nome, artista, álbum, capa, duração) e a
 * prévia oficial quando o provedor a disponibiliza. Nada de áudio é baixado,
 * copiado ou armazenado pelo Vibely.
 */
export const searchSpotifyTracks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => ({ q: String(input?.q ?? "").slice(0, 80) }))
  .handler(async ({ data }): Promise<{ tracks: ProviderTrack[]; configured: boolean }> => {
    const id = process.env["SPOTIFY_CLIENT_ID"];
    const secret = process.env["SPOTIFY_CLIENT_SECRET"];
    if (!id || !secret) return { tracks: [], configured: false };
    const q = data.q.trim();
    if (!q) return { tracks: [], configured: true };
    try {
      const t = await token(id, secret);
      if (!t) return { tracks: [], configured: true };
      const res = await fetch(
        `https://api.spotify.com/v1/search?type=track&limit=20&q=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${t}` } },
      );
      if (!res.ok) return { tracks: [], configured: true };
      const json = (await res.json()) as any;
      const items = (json?.tracks?.items ?? []) as any[];
      return {
        configured: true,
        tracks: items.map((it) => ({
          provider: "spotify" as const,
          externalId: String(it.id),
          title: String(it.name ?? ""),
          artist: (it.artists ?? []).map((a: any) => a.name).join(", "),
          album: it.album?.name ?? null,
          coverUrl: it.album?.images?.[1]?.url ?? it.album?.images?.[0]?.url ?? null,
          durationMs: Number(it.duration_ms ?? 0),
          previewUrl: it.preview_url ?? null,
        })),
      };
    } catch (err) {
      console.warn("[music] spotify search failed", err);
      return { tracks: [], configured: true };
    }
  });
