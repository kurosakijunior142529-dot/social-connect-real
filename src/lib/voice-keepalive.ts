/**
 * Mantém a sessão de áudio viva quando o app vai para segundo plano
 * (tela bloqueada, outro app/jogo em foco, aba oculta).
 *
 * Equivalentes web do Foreground Service (Android) / AVAudioSession (iOS):
 *  - Screen Wake Lock API              -> evita suspensão enquanto a tela está ligada
 *  - MediaSession (notificação de mídia) -> o SO trata a aba como "tocando áudio"
 *  - Trilha de áudio silenciosa em loop -> impede o SO de encerrar a sessão de áudio
 *  - Watchdog                           -> reproduz de novo qualquer elemento pausado
 */

type Watchdog = { stop: () => void };

let refCount = 0;
let wakeLock: WakeLockSentinel | null = null;
let silentEl: HTMLAudioElement | null = null;
let audioCtx: AudioContext | null = null;
let watchdogId: number | null = null;
let visListener: (() => void) | null = null;

/** WAV de 1s em silêncio (mono, 8kHz) — leve o suficiente para loop infinito. */
const SILENCE =
  "data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==";

async function requestWakeLock() {
  try {
    const nav = navigator as Navigator & { wakeLock?: WakeLock };
    if (!nav.wakeLock) return;
    wakeLock = await nav.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    /* sem wake lock: seguimos com os demais mecanismos */
  }
}

function startSilentTrack() {
  if (silentEl) return;
  const el = document.createElement("audio");
  el.src = SILENCE;
  el.loop = true;
  el.volume = 0.0001; // volume zero real faz alguns SOs ignorarem a sessão
  (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  el.setAttribute("aria-hidden", "true");
  el.style.display = "none";
  document.body.appendChild(el);
  silentEl = el;
  void el.play().catch(() => undefined);

  // Mantém o AudioContext acordado (iOS suspende ao minimizar).
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      audioCtx = new Ctor({ latencyHint: "interactive" });
      void audioCtx.resume().catch(() => undefined);
    }
  } catch {
    /* ignore */
  }
}

function stopSilentTrack() {
  silentEl?.pause();
  silentEl?.remove();
  silentEl = null;
  void audioCtx?.close().catch(() => undefined);
  audioCtx = null;
}

export function setVoiceMediaSession(opts: {
  title: string;
  artist?: string;
  onHangUp?: () => void;
  onToggleMic?: () => void;
}) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: opts.title,
      artist: opts.artist ?? "Chat de voz",
      album: "vibely",
    });
    navigator.mediaSession.playbackState = "playing";
    navigator.mediaSession.setActionHandler("play", () => opts.onToggleMic?.());
    navigator.mediaSession.setActionHandler("pause", () => opts.onToggleMic?.());
    navigator.mediaSession.setActionHandler("stop", () => opts.onHangUp?.());
  } catch {
    /* ignore */
  }
}

export function clearVoiceMediaSession() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = "none";
    navigator.mediaSession.metadata = null;
    (["play", "pause", "stop"] as const).forEach((a) => navigator.mediaSession.setActionHandler(a, null));
  } catch {
    /* ignore */
  }
}

/**
 * Inicia o keep-alive. `getAudioEls` devolve os elementos de áudio remotos
 * para o watchdog reproduzir novamente caso o SO os pause.
 */
export function startVoiceKeepAlive(getAudioEls: () => Iterable<HTMLAudioElement>): Watchdog {
  refCount += 1;

  if (refCount === 1) {
    void requestWakeLock();
    startSilentTrack();

    const resumeAll = () => {
      if (silentEl?.paused) void silentEl.play().catch(() => undefined);
      if (audioCtx?.state === "suspended") void audioCtx.resume().catch(() => undefined);
      for (const el of getAudioEls()) {
        if (el.paused || el.ended) void el.play().catch(() => undefined);
      }
    };

    // Watchdog leve: 1 checagem/2s, sem trabalho na thread de UI quando tudo está ok.
    watchdogId = window.setInterval(resumeAll, 2000);

    visListener = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
      resumeAll();
    };
    document.addEventListener("visibilitychange", visListener);
    window.addEventListener("pageshow", visListener);
    window.addEventListener("focus", visListener);
  }

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      refCount = Math.max(0, refCount - 1);
      if (refCount === 0) {
        if (watchdogId !== null) window.clearInterval(watchdogId);
        watchdogId = null;
        if (visListener) {
          document.removeEventListener("visibilitychange", visListener);
          window.removeEventListener("pageshow", visListener);
          window.removeEventListener("focus", visListener);
        }
        visListener = null;
        void wakeLock?.release().catch(() => undefined);
        wakeLock = null;
        stopSilentTrack();
        clearVoiceMediaSession();
      }
    },
  };
}
