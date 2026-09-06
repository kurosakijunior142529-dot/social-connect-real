import { supabase } from "@/integrations/supabase/client";
import type { RealityPrivacy } from "@/lib/reality/catalog";

export type Reality = {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  original_image: string | null;
  generated_image: string;
  transformation_prompt: string | null;
  style: string;
  privacy: RealityPrivacy;
  is_featured: boolean;
  room_id: string | null;
  voice_channel_id: string | null;
  created_at: string;
};

export type PublicReality = {
  id: string;
  name: string;
  description: string | null;
  generated_image: string;
  style: string;
  creator_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  room_id: string | null;
  people: number;
  created_at: string;
};

const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

/** Redimensiona a foto antes de enviar para a IA (mais rápido e mais barato). */
export async function fileToDataUrl(file: File, max = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível ler a imagem.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.86);
}

export async function uploadRealityImage(userId: string, dataUrl: string, tag: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userId}/${tag}-${crypto.randomUUID()}.${blob.type.includes("png") ? "png" : "jpg"}`;
  const { error } = await supabase.storage.from("realities").upload(path, blob, {
    cacheControl: "31536000, immutable",
    upsert: false,
    contentType: blob.type || "image/jpeg",
  });
  if (error) throw error;
  return path;
}

export async function fetchMyRealities(userId: string): Promise<Reality[]> {
  const { data, error } = await db
    .from("realities")
    .select("*")
    .eq("creator_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Reality[];
}

export async function fetchReality(id: string): Promise<Reality | null> {
  const { data, error } = await db.from("realities").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Reality | null;
}

export async function fetchPublicRealities(limit = 30): Promise<PublicReality[]> {
  const { data, error } = await db.rpc("list_public_realities", { _limit: limit, _offset: 0 });
  if (error) throw error;
  return (data ?? []) as PublicReality[];
}

/** Cria a realidade + a sala (reutiliza as salas do Streaming Amigo). */
export async function createReality(input: {
  userId: string;
  name: string;
  description: string;
  privacy: RealityPrivacy;
  style: string;
  prompt: string;
  originalPath: string | null;
  generatedPath: string;
}): Promise<Reality> {
  const { data: room, error: roomError } = await db
    .from("watch_rooms")
    .insert({
      host_id: input.userId,
      title: input.name,
      provider: "youtube",
      is_private: input.privacy !== "public",
      visibility: input.privacy === "public" ? "public" : "invite",
      category: "geral",
    })
    .select("id")
    .single();
  if (roomError) throw roomError;

  const { data, error } = await db
    .from("realities")
    .insert({
      creator_id: input.userId,
      name: input.name,
      description: input.description || null,
      original_image: input.originalPath,
      generated_image: input.generatedPath,
      transformation_prompt: input.prompt,
      style: input.style,
      privacy: input.privacy,
      room_id: room.id,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Reality;
}

export async function deleteReality(id: string) {
  const { error } = await db.from("realities").delete().eq("id", id);
  if (error) throw error;
}

export async function updateReality(id: string, patch: Partial<Pick<Reality, "name" | "privacy" | "is_featured">>) {
  const { error } = await db.from("realities").update(patch).eq("id", id);
  if (error) throw error;
}

/** Marca uma realidade como destaque do perfil (só uma por usuário). */
export async function featureReality(userId: string, id: string) {
  await db.from("realities").update({ is_featured: false }).eq("creator_id", userId).eq("is_featured", true);
  await updateReality(id, { is_featured: true });
}

/** Cria (uma vez) o canal de voz da realidade, reutilizando as salas de voz. */
export async function ensureVoiceChannel(reality: Reality, userId: string): Promise<string> {
  if (reality.voice_channel_id) return reality.voice_channel_id;
  const { data, error } = await db
    .from("voice_channels")
    .insert({ name: reality.name, created_by: userId, emoji: "🌀", is_public: reality.privacy === "public" })
    .select("id")
    .single();
  if (error) throw error;
  await db.from("realities").update({ voice_channel_id: data.id }).eq("id", reality.id);
  return data.id as string;
}

export function realityInviteLink(id: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/reality/${id}`;
}
