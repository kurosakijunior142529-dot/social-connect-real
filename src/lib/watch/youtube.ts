import type { WatchProviderPlayer } from "./provider";

// Minimal YT typings we need
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReadyPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;
  apiReadyPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      resolve();
    };
    if (!existing) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  });
  return apiReadyPromise;
}

export type YouTubePlayerEvents = {
  onReady?: (player: WatchProviderPlayer) => void;
  onStateChange?: (state: "playing" | "paused" | "ended" | "buffering" | "cued") => void;
};

export async function createYouTubePlayer(
  container: HTMLElement,
  videoId: string,
  events: YouTubePlayerEvents = {},
): Promise<WatchProviderPlayer> {
  await loadYouTubeAPI();
  return new Promise((resolve) => {
    const YT = window.YT!;
    const inner = document.createElement("div");
    container.innerHTML = "";
    container.appendChild(inner);
    const player = new YT.Player(inner, {
      videoId,
      width: "100%",
      height: "100%",
      playerVars: {
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
      },
      events: {
        onReady: () => {
          const wrapped: WatchProviderPlayer = {
            play: () => player.playVideo?.(),
            pause: () => player.pauseVideo?.(),
            seek: (s: number) => player.seekTo?.(s, true),
            getCurrentTime: () => player.getCurrentTime?.() ?? 0,
            getDuration: () => player.getDuration?.() ?? 0,
            isPlaying: () => player.getPlayerState?.() === YT.PlayerState.PLAYING,
            destroy: () => {
              try {
                player.destroy?.();
              } catch { /* ignore */ }
            },
          };
          events.onReady?.(wrapped);
          resolve(wrapped);
        },
        onStateChange: (ev: any) => {
          const map: Record<number, "playing" | "paused" | "ended" | "buffering" | "cued"> = {
            1: "playing",
            2: "paused",
            0: "ended",
            3: "buffering",
            5: "cued",
          };
          const s = map[ev.data];
          if (s) events.onStateChange?.(s);
        },
      },
    });
  });
}
