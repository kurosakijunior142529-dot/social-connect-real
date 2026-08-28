/**
 * Preferência global de som dos vídeos.
 * O app inicia com som ligado; se o navegador bloquear o autoplay com áudio,
 * o player cai para mudo automaticamente (sem mudar a preferência do usuário).
 */
const KEY = "vibely:video-sound-on";

let soundOn = true;
if (typeof window !== "undefined") {
  const saved = window.localStorage.getItem(KEY);
  soundOn = saved === null ? true : saved === "1";
}

const listeners = new Set<(on: boolean) => void>();

export function isSoundOn() {
  return soundOn;
}

export function setSoundOn(on: boolean) {
  soundOn = on;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* noop */
  }
  listeners.forEach((l) => l(on));
}

export function subscribeSound(fn: (on: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
