// Provider abstraction — YouTube today, other platforms in the future (co-watch mode).
export interface WatchProviderPlayer {
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPlaying(): boolean;
  destroy(): void;
}

export type WatchProviderKind = "youtube";

export function extractYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // If bare ID (11 chars, alnum + - _)
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    if (url.hostname.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      // /embed/ID or /shorts/ID
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    // not a URL
  }
  return null;
}
