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

export async function createSignedUrl(
  bucket: MediaBucket,
  path: string,
  expiresIn = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  const bucketKey = `${bucket}:${expiresIn}`;
  return new Promise<string | null>((resolve, reject) => {
    const batch = pending.get(bucketKey);
    if (batch) {
      batch.push({ path, resolve, reject });
      return;
    }
    pending.set(bucketKey, [{ path, resolve, reject }]);
    setTimeout(() => flush(bucketKey, bucket, expiresIn), 16);
  });
}

