import type { WatchProviderPlayer } from "./provider";

declare global {
  interface Window {
    Twitch?: any;
  }
}

let apiReadyPromise: Promise<void> | null = null;

function loadTwitchAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Twitch?.Player) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;
  apiReadyPromise = new Promise<void>((resolve) => {
    const existing = document.querySelector('script[src="https://player.twitch.tv/js/embed/v1.js"]');
    if (existing) {
      const check = () => (window.Twitch?.Player ? resolve() : setTimeout(check, 50));
      check();
      return;
    }
    const tag = document.createElement("script");
    tag.src = "https://player.twitch.tv/js/embed/v1.js";
    tag.onload = () => resolve();
    document.body.appendChild(tag);
  });
  return apiReadyPromise;
}

export type TwitchSource = { kind: "channel" | "video"; id: string };

export async function createTwitchPlayer(
  container: HTMLElement,
  source: TwitchSource,
  events: { onReady?: (p: WatchProviderPlayer) => void; onStateChange?: (s: "playing" | "paused") => void } = {},
): Promise<WatchProviderPlayer> {
  await loadTwitchAPI();
  const Twitch = window.Twitch!;
  container.innerHTML = "";
  const inner = document.createElement("div");
  inner.style.width = "100%";
  inner.style.height = "100%";
  container.appendChild(inner);

  const opts: any = {
    width: "100%",
    height: "100%",
    parent: [window.location.hostname],
    autoplay: true,
    muted: false,
  };
  if (source.kind === "channel") opts.channel = source.id;
  else opts.video = source.id;

  const player = new Twitch.Player(inner, opts);

  const wrapped: WatchProviderPlayer = {
    play: () => player.play?.(),
    pause: () => player.pause?.(),
    seek: (s: number) => player.seek?.(s),
    getCurrentTime: () => player.getCurrentTime?.() ?? 0,
    getDuration: () => player.getDuration?.() ?? 0,
    isPlaying: () => !(player.isPaused?.() ?? true),
    destroy: () => {
      try {
        container.innerHTML = "";
      } catch {
        /* ignore */
      }
    },
  };

  player.addEventListener?.(Twitch.Player.READY, () => events.onReady?.(wrapped));
  player.addEventListener?.(Twitch.Player.PLAYING, () => events.onStateChange?.("playing"));
  player.addEventListener?.(Twitch.Player.PAUSE, () => events.onStateChange?.("paused"));

  // Fallback ready
  setTimeout(() => events.onReady?.(wrapped), 800);
  return wrapped;
}
