import { useCallback, useEffect, useState } from "react";

const DEFAULT_DIM = 35;
const EVENT = "vibely:wallpaper-dim";

export function useWallpaperDimming(conversationId: string) {
  const key = `vibely.wallpaperDim.${conversationId}`;
  const [dim, setDim] = useState(DEFAULT_DIM);
  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(key);
        const value = raw === null ? DEFAULT_DIM : Number(raw);
        setDim(Number.isFinite(value) ? Math.max(0, Math.min(80, value)) : DEFAULT_DIM);
      } catch { setDim(DEFAULT_DIM); }
    }
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [key]);
  const updateDim = useCallback((value: number) => {
    const next = Math.max(0, Math.min(80, value));
    setDim(next);
    try { localStorage.setItem(key, String(next)); } catch { /* Device storage unavailable. */ }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return { dim, updateDim };
}