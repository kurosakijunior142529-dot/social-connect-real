import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  if (!key) throw new Error("GIFs indisponíveis no momento");
  const q = new URLSearchParams({ key, client_key: "vibely", ...params });
  const url = `https://tenor.googleapis.com/v2/${path}?${q}`;
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    throw new Error("Sem conexão com o serviço de GIFs");
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    // Log detalhado no servidor, mensagem amigável ao usuário
    console.error(`[tenor] ${r.status} ${path}:`, body.slice(0, 300));
    if (r.status === 400 || r.status === 401 || r.status === 403) {
      throw new Error("GIFs indisponíveis no momento");
    }
    if (r.status === 429) throw new Error("Muitas buscas — tente em instantes");
    throw new Error("GIFs indisponíveis no momento");
  }
  return (await r.json()) as { results: TenorGif[]; next?: string };
}

export const searchGifs = createServerFn({ method: "POST" })
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
