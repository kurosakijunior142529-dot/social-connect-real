import { supabase } from "@/integrations/supabase/client";

export type MediaBucket = "avatars" | "posts" | "stories" | "chats" | "covers";

export async function uploadMedia(
  bucket: MediaBucket,
  userId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    // O caminho contém um UUID único, então o conteúdo é imutável:
    // cache agressivo no browser e na CDN (antes eram só 3600s).
    cacheControl: "31536000, immutable",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

/**
 * Batches signed-URL requests: every call made within the same tick for the
 * same bucket is coalesced into a single `createSignedUrls` round-trip.
 * A feed with 20 medias goes from 20 HTTP requests to 1.
 */
type PendingEntry = {
  path: string;
  resolve: (url: string | null) => void;
  reject: (err: unknown) => void;
};

const pending = new Map<string, PendingEntry[]>();

function flush(bucketKey: string, bucket: MediaBucket, expiresIn: number) {
  const batch = pending.get(bucketKey);
  if (!batch || batch.length === 0) return;
  pending.delete(bucketKey);

  const paths = Array.from(new Set(batch.map((b) => b.path)));

  void (async () => {
    try {
      if (paths.length === 1) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(paths[0]!, expiresIn);
        if (error) throw error;
        for (const item of batch) item.resolve(data?.signedUrl ?? null);
        return;
      }
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, expiresIn);
      if (error) throw error;
      const map = new Map<string, string | null>(
        (data ?? []).map((d) => [d.path ?? "", d.signedUrl ?? null]),
      );
      for (const item of batch) item.resolve(map.get(item.path) ?? null);
    } catch (err) {
      for (const item of batch) item.reject(err);
    }
  })();
}

/**
 * URLs assinadas eram recriadas a cada sessão (1h de validade). Como o token
 * faz parte da URL, toda nova assinatura vira uma chave de cache diferente:
 * MISS na CDN e download do zero no browser. Agora a assinatura vale 7 dias e
 * é persistida, então o mesmo arquivo reusa exatamente a mesma URL — HIT na
 * CDN e reaproveitamento do cache HTTP local.
 */
const SIGNED_TTL = 7 * 24 * 60 * 60;
const SAFETY_WINDOW = 60 * 60 * 1000; // renova 1h antes de expirar
const memoryCache = new Map<string, { url: string; exp: number }>();

function storeKey(bucket: MediaBucket, path: string) {
  return `su:${bucket}:${path}`;
}

function readCache(bucket: MediaBucket, path: string): string | null {
  const key = storeKey(bucket, path);
  const mem = memoryCache.get(key);
  const now = Date.now();
  if (mem && mem.exp - SAFETY_WINDOW > now) return mem.url;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url: string; exp: number };
    if (!parsed?.url || parsed.exp - SAFETY_WINDOW <= now) {
      localStorage.removeItem(key);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed.url;
  } catch {
    return null;
  }
}

function writeCache(bucket: MediaBucket, path: string, url: string) {
  const key = storeKey(bucket, path);
  const entry = { url, exp: Date.now() + SIGNED_TTL * 1000 };
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota cheia: cache em memória já ajuda */
  }
}

export async function createSignedUrl(
  bucket: MediaBucket,
  path: string,
  expiresIn = SIGNED_TTL,
): Promise<string | null> {
  if (!path) return null;
  const cached = readCache(bucket, path);
  if (cached) return cached;

  const bucketKey = `${bucket}:${expiresIn}`;
  const url = await new Promise<string | null>((resolve, reject) => {
    const batch = pending.get(bucketKey);
    if (batch) {
      batch.push({ path, resolve, reject });
      return;
    }
    pending.set(bucketKey, [{ path, resolve, reject }]);
    setTimeout(() => flush(bucketKey, bucket, expiresIn), 16);
  });
  if (url) writeCache(bucket, path, url);
  return url;
}

