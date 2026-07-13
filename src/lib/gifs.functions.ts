import { createServerFn } from "@tanstack/react-start";
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
  if (!key) throw new Error("Serviço de GIFs não configurado");
  const q = new URLSearchParams({ key, client_key: "vibely", ...params });
  const url = `https://tenor.googleapis.com/v2/${path}?${q}`;
  let r: Response;
  try {
    r = await fetch(url);
  } catch (e: any) {
    throw new Error(`Falha de rede ao contatar Tenor: ${e?.message ?? "desconhecido"}`);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(`Tenor ${r.status}: ${body.slice(0, 140)}`);
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
