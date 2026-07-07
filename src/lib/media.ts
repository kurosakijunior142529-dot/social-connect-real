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
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

export async function createSignedUrl(
  bucket: MediaBucket,
  path: string,
  expiresIn = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
