/** Metadados compartilhados das salas de assistir (Streaming Amigo). */

export const ROOM_CATEGORIES = [
  { id: "geral", label: "Geral", emoji: "✨" },
  { id: "musica", label: "Música", emoji: "🎵" },
  { id: "games", label: "Games", emoji: "🎮" },
  { id: "filmes", label: "Filmes & séries", emoji: "🍿" },
  { id: "esportes", label: "Esportes", emoji: "⚽" },
  { id: "humor", label: "Humor", emoji: "😂" },
  { id: "estudo", label: "Estudo", emoji: "📚" },
  { id: "podcast", label: "Podcast", emoji: "🎙️" },
] as const;

export type RoomCategoryId = (typeof ROOM_CATEGORIES)[number]["id"];

export function categoryLabel(id?: string | null) {
  return ROOM_CATEGORIES.find((c) => c.id === id)?.label ?? "Geral";
}

export function categoryEmoji(id?: string | null) {
  return ROOM_CATEGORIES.find((c) => c.id === id)?.emoji ?? "✨";
}

export type RoomVisibility = "public" | "private" | "invite";

export const VISIBILITY_OPTIONS: { id: RoomVisibility; label: string; hint: string }[] = [
  { id: "public", label: "Pública", hint: "Aparece na lista de salas públicas." },
  { id: "invite", label: "Por convite", hint: "Só entra quem tiver o link/código." },
  { id: "private", label: "Privada", hint: "Fechada: só você e quem já está dentro." },
];

/** Traduz os códigos de erro das funções do backend. */
export function roomErrorMessage(raw?: string | null) {
  const msg = String(raw ?? "");
  if (msg.includes("NOT_AUTHENTICATED")) return "Entre na sua conta para acessar a sala.";
  if (msg.includes("ROOM_NOT_FOUND") || msg.includes("Room not found"))
    return "Sala não encontrada. Confira se o código/link foi copiado completo.";
  if (msg.includes("ROOM_CLOSED")) return "Esta sala foi encerrada pelo criador.";
  if (msg.includes("ROOM_FULL")) return "Esta sala está cheia no momento.";
  if (msg.includes("INVITE_REQUIRED")) return "Sala privada: você precisa de um convite para entrar.";
  if (msg.includes("INVALID_CODE")) return "Convite inválido.";
  return msg || "Não foi possível entrar na sala.";
}

/** Extrai o código de convite de um link colado. */
export function extractInviteCode(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    const fromQuery = url.searchParams.get("code");
    if (fromQuery) return fromQuery;
    const seg = url.pathname.replace(/\/+$/, "").split("/").pop();
    return seg ?? value;
  } catch {
    if (value.includes("code=")) return value.split("code=")[1]?.split("&")[0] ?? value;
    if (value.includes("/")) return value.replace(/\/+$/, "").split("/").pop() ?? value;
    return value;
  }
}

export function inviteLinkFor(code: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/watch/j/${encodeURIComponent(code)}`;
}

export function roomThumb(room: { provider?: string | null; video_id?: string | null; cover_url?: string | null }) {
  if (room.cover_url) return room.cover_url;
  if (room.provider === "youtube" && room.video_id)
    return `https://i.ytimg.com/vi/${room.video_id}/hqdefault.jpg`;
  return null;
}

/** Chave usada para retomar um convite após o login. */
export const PENDING_INVITE_KEY = "vibely:pending-watch-invite";
