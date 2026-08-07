import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type TenorGif = {
  id: string;
  title?: string;
  media_formats?: Record<string, { url: string; dims?: [number, number]; size?: number }>;
  content_description?: string;
};

export type GifErrorCode =
  | "no_key"
  | "api_disabled"
  | "invalid_key"
  | "rate_limited"
  | "network"
  | "unknown";

export type GifItem = { id: string; url: string; w: number; h: number; alt: string };

export type GifResult =
  | { ok: true; items: GifItem[]; next: string | null }
  | { ok: false; code: GifErrorCode; message: string; detail?: string };

class TenorError extends Error {
  code: GifErrorCode;
  detail?: string;
  constructor(code: GifErrorCode, message: string, detail?: string) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

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

function classify(status: number, body: string): TenorError {
  const b = body.toLowerCase();
  if (b.includes("api key not valid") || b.includes("api_key_invalid")) {
    return new TenorError(
      "invalid_key",
      "A chave da API de GIFs é inválida.",
      "Gere uma nova chave no Google Cloud e salve como TENOR_API_KEY.",
    );
  }
  if (
    b.includes("has not been used") ||
    b.includes("is disabled") ||
    b.includes("service_disabled") ||
    b.includes("accessnotconfigured")
  ) {
    return new TenorError(
      "api_disabled",
      "A Tenor API está desativada para esta chave.",
      "Ative a “Tenor API” na Biblioteca de APIs do projeto Google Cloud da chave e aguarde alguns minutos.",
    );
  }
  if (status === 429) {
    return new TenorError("rate_limited", "Muitas buscas — tente em instantes.");
  }
  if (status === 400 || status === 401 || status === 403) {
    return new TenorError(
      "api_disabled",
      "Acesso aos GIFs negado pelo provedor.",
      "Confira se a Tenor API está ativada e se a chave não tem restrições de IP/referrer.",
    );
  }
  return new TenorError("unknown", "GIFs indisponíveis no momento.");
}

async function tenor(path: string, params: Record<string, string>) {
  const key = process.env["TENOR_API_KEY"];
  if (!key) {
    throw new TenorError(
      "no_key",
      "GIFs ainda não configurados.",
      "Adicione a chave TENOR_API_KEY nas configurações do app.",
    );
  }
  const q = new URLSearchParams({ key, client_key: "vibely", ...params });
  const url = `https://tenor.googleapis.com/v2/${path}?${q}`;
  let r: Response;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    r = await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    console.error("[tenor] network", e);
    throw new TenorError("network", "Sem conexão com o serviço de GIFs.");
  } finally {
    clearTimeout(timer);
  }
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error(`[tenor] ${r.status} ${path}:`, body.slice(0, 300));
    throw classify(r.status, body);
  }
  return (await r.json()) as { results: TenorGif[]; next?: string };
}

export const searchGifs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ q: z.string().max(120).default(""), pos: z.string().optional() }).parse(i),
  )
  .handler(async ({ data }): Promise<GifResult> => {
    const params: Record<string, string> = {
      limit: "24",
      media_filter: "tinygif,gif,mediumgif,nanogif",
      contentfilter: "high",
    };
    if (data.pos) params.pos = data.pos;
    try {
      const res = data.q.trim()
        ? await tenor("search", { ...params, q: data.q.trim() })
        : await tenor("featured", params);
      return {
        ok: true,
        next: res.next ?? null,
        items: res.results
          .map((g) => {
            const f = pickFormat(g);
            return {
              id: g.id,
              url: f.url,
              w: f.dims?.[0] ?? 0,
              h: f.dims?.[1] ?? 0,
              alt: g.content_description ?? g.title ?? "gif",
            };
          })
          .filter((g) => !!g.url),
      };
    } catch (e) {
      const te = e instanceof TenorError ? e : new TenorError("unknown", "GIFs indisponíveis no momento.");
      console.error("[gifs] search failed:", te.code, te.message);
      return { ok: false, code: te.code, message: te.message, detail: te.detail };
    }
  });
