import { createYouTubePlayer } from "@/lib/watch/youtube";
import { createTwitchPlayer } from "@/lib/watch/twitch";
import type { WatchProviderPlayer } from "@/lib/watch/provider";
import type { StreamingProvider, StreamingProviderAdapter } from "./types";
import { PrimeVideoAdapter, NetflixAdapter, DisneyPlusAdapter } from "./licensed";

export * from "./types";
export * from "./licensed";

export type AdapterEvents = {
  onStateChange?: (state: "playing" | "paused" | "ended" | "buffering" | "cued") => void;
};

/** Adapter do YouTube: usa exatamente o player já existente do Vibely. */
export function YouTubeAdapter(
  container: HTMLElement | null,
  contentId: string | null,
  events: AdapterEvents = {},
): StreamingProviderAdapter {
  let player: WatchProviderPlayer | null = null;
  return {
    provider: "youtube",
    get playable() {
      return !!player;
    },
    async initialize() {
      if (!container || !contentId) return;
      player = await createYouTubePlayer(container, contentId, {
        onStateChange: events.onStateChange,
      });
    },
    async play() {
      player?.play();
    },
    async pause() {
      player?.pause();
    },
    async seek(s: number) {
      player?.seek(s);
    },
    async getCurrentTime() {
      return player?.getCurrentTime() ?? 0;
    },
    async getDuration() {
      return player?.getDuration() ?? 0;
    },
    isPlaying() {
      return player?.isPlaying() ?? false;
    },
    async destroy() {
      player?.destroy();
      player = null;
    },
  };
}

/** Adapter da Twitch (já suportado pela sala atual). */
export function TwitchAdapter(
  container: HTMLElement | null,
  contentId: string | null,
  events: AdapterEvents = {},
): StreamingProviderAdapter {
  let player: WatchProviderPlayer | null = null;
  return {
    provider: "twitch",
    get playable() {
      return !!player;
    },
    async initialize() {
      const raw = contentId ?? "";
      const [kind, id] = raw.split(":");
      if (!container || !id || (kind !== "channel" && kind !== "video")) return;
      player = await createTwitchPlayer(container, { kind, id }, { onStateChange: events.onStateChange });
    },
    async play() {
      player?.play();
    },
    async pause() {
      player?.pause();
    },
    async seek(s: number) {
      player?.seek(s);
    },
    async getCurrentTime() {
      return player?.getCurrentTime() ?? 0;
    },
    async getDuration() {
      return player?.getDuration() ?? 0;
    },
    isPlaying() {
      return player?.isPlaying() ?? false;
    },
    async destroy() {
      player?.destroy();
      player = null;
    },
  };
}

export function createAdapter(
  provider: StreamingProvider,
  container: HTMLElement | null,
  contentId: string | null,
  events: AdapterEvents = {},
): StreamingProviderAdapter {
  switch (provider) {
    case "twitch":
      return TwitchAdapter(container, contentId, events);
    case "prime":
      return PrimeVideoAdapter(container, contentId);
    case "netflix":
      return NetflixAdapter(container, contentId);
    case "disney":
      return DisneyPlusAdapter(container, contentId);
    case "youtube":
    default:
      return YouTubeAdapter(container, contentId, events);
  }
}
