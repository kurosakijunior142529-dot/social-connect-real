import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type TenorGif = {
  id: string;
  title?: string;
  media_formats?: Record<string, { url: string; dims?: [number, number]; size?: number }>;
  content_description?: string;
};

function pickFormat(gif: TenorGif) {
  const m = gif.media_formats ?? {};
  return (
    m.tinygif ??
    m.gif ??
    m.mediumgif ??
    m.nanogif ??
    m.tinymp4 ??
    m.mp4 ?? { url: "", dims: [0, 0] as [number, number] }
  );
}

async function tenor(path: string, params: Record<string, string>) {
  const key = process.env.TENOR_API_KEY;
  if (!key) throw new Error("TENOR_API_KEY not configured");
  const q = new URLSearchParams({ key, client_key: "vibely", ...params });
  const r = await fetch(`https://tenor.googleapis.com/v2/${path}?${q}`);
  if (!r.ok) throw new Error(`Tenor error ${r.status}`);
  return (await r.json()) as { results: TenorGif[]; next?: string };
}

export const searchGifs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ q: z.string().max(120).default(""), pos: z.string().optional() }).parse(i),
  )
  .handler(async ({ data }) => {
    const params: Record<string, string> = {
      limit: "24",
      media_filter: "tinygif,gif,mediumgif,nanogif",
      contentfilter: "high",
    };
    if (data.pos) params.pos = data.pos;
    const res = data.q.trim()
      ? await tenor("search", { ...params, q: data.q.trim() })
      : await tenor("featured", params);
    return {
      next: res.next ?? null,
      items: res.results.map((g) => {
        const f = pickFormat(g);
        return {
          id: g.id,
          url: f.url,
          w: f.dims?.[0] ?? 0,
          h: f.dims?.[1] ?? 0,
          alt: g.content_description ?? g.title ?? "gif",
        };
      }),
    };
  });
