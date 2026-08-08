import { useCallback, useEffect, useState } from "react";

/** Persisted recents/favorites for the emoji · GIF · sticker panel. */

export type FavGif = { kind: "gif"; id: string; url: string; w: number; h: number; alt: string };
export type FavSticker = {
  kind: "sticker";
  id: string;
  url: string;
  name: string;
  path?: string;
  own?: boolean;
};
export type FavEmoji = { kind: "emoji"; id: string; char: string };
export type FavItem = FavGif | FavSticker | FavEmoji;

const PREFIX = "vibely:expr:";
const LIMIT = 60;

function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("[expression-store] read failed", key, err);
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value.slice(0, LIMIT)));
    window.dispatchEvent(new CustomEvent("vibely:expr-change", { detail: key }));
  } catch (err) {
    console.warn("[expression-store] write failed", key, err);
  }
}

function useStore<T>(key: string): [T[], (next: T[]) => void] {
  const [value, setValue] = useState<T[]>([]);

  useEffect(() => {
    setValue(read<T>(key));
    const onChange = (e: Event) => {
      if ((e as CustomEvent).detail === key) setValue(read<T>(key));
    };
    window.addEventListener("vibely:expr-change", onChange);
    return () => window.removeEventListener("vibely:expr-change", onChange);
  }, [key]);

  const set = useCallback(
    (next: T[]) => {
      setValue(next.slice(0, LIMIT));
      write(key, next);
    },
    [key],
  );

  return [value, set];
}

/** Recently used unicode/app emoji shortcodes (strings). */
export function useRecentEmojis() {
  const [items, set] = useStore<string>("recent-emojis");
  const push = useCallback(
    (char: string) => set([char, ...read<string>("recent-emojis").filter((c) => c !== char)]),
    [set],
  );
  return { items, push };
}

export function useRecentGifs() {
  const [items, set] = useStore<FavGif>("recent-gifs");
  const push = useCallback(
    (g: Omit<FavGif, "kind">) =>
      set([
        { kind: "gif", ...g },
        ...read<FavGif>("recent-gifs").filter((x) => x.id !== g.id),
      ]),
    [set],
  );
  return { items, push };
}

export function useRecentStickers() {
  const [items, set] = useStore<FavSticker>("recent-stickers");
  const push = useCallback(
    (s: Omit<FavSticker, "kind">) =>
      set([
        { kind: "sticker", ...s },
        ...read<FavSticker>("recent-stickers").filter((x) => x.id !== s.id),
      ]),
    [set],
  );
  return { items, push };
}

export function useFavorites() {
  const [items, set] = useStore<FavItem>("favorites");
  const has = useCallback((id: string) => items.some((i) => i.id === id), [items]);
  const toggle = useCallback(
    (item: FavItem) => {
      const current = read<FavItem>("favorites");
      const exists = current.some((i) => i.id === item.id);
      set(exists ? current.filter((i) => i.id !== item.id) : [item, ...current]);
      return !exists;
    },
    [set],
  );
  const remove = useCallback(
    (id: string) => set(read<FavItem>("favorites").filter((i) => i.id !== id)),
    [set],
  );
  return { items, has, toggle, remove };
}
