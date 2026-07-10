// Provider abstraction — YouTube + Twitch (extensible for other platforms).
export interface WatchProviderPlayer {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  destroy(): void;
}

export type WatchProviderKind = "youtube" | "twitch";

export type ResolvedSource =
  | { provider: "youtube"; videoId: string }
  | { provider: "twitch"; kind: "channel" | "video"; id: string };

export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    if (url.hostname.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "live");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export function extractTwitch(
  input: string,
): { kind: "channel" | "video"; id: string } | null {
  if (!input) return null;
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    if (!url.hostname.endsWith("twitch.tv")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "videos" && parts[1]) return { kind: "video", id: parts[1] };
    if (parts[0]) return { kind: "channel", id: parts[0] };
  } catch {
    // Bare channel name like "shroud"
    if (/^[A-Za-z0-9_]{3,25}$/.test(trimmed)) return { kind: "channel", id: trimmed };
  }
  return null;
}

export function resolveSource(input: string): ResolvedSource | null {
  const yt = extractYouTubeId(input);
  if (yt) return { provider: "youtube", videoId: yt };
  const tw = extractTwitch(input);
  if (tw) return { provider: "twitch", kind: tw.kind, id: tw.id };
  return null;
}
