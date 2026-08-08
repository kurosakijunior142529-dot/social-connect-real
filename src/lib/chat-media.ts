import { supabase } from "@/integrations/supabase/client";

export type ChatBucket = "chats" | "chat-audio" | "chat-video" | "chat-docs" | "stickers";

export type ChatMessageKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "location"
  | "contact";

export function bucketForFile(file: File): ChatBucket {
  if (file.type.startsWith("audio/")) return "chat-audio";
  if (file.type.startsWith("video/")) return "chat-video";
  if (file.type.startsWith("image/")) return "chats";
  return "chat-docs";
}

export function kindForFile(file: File): ChatMessageKind {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  return "document";
}

export async function uploadChatFile(
  userId: string,
  file: File | Blob,
  bucket: ChatBucket = file instanceof File ? bucketForFile(file) : "chats",
  filename?: string,
): Promise<{ bucket: ChatBucket; path: string }> {
  const name = filename ?? (file instanceof File ? file.name : "blob");
  const ext = name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return { bucket, path };
}

export async function signChatUrl(
  bucket: ChatBucket,
  path: string,
  expiresIn = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}

export function humanFileSize(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
