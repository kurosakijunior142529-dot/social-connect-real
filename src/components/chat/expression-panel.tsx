import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Loader2, Plus, RefreshCw, Search, Star, Trash2, X } from "lucide-react";
import { searchGifs } from "@/lib/gifs.functions";
import { EMOJI_CATEGORIES, searchEmojis, type EmojiCategoryId } from "@/lib/emoji-data";
import { APP_EMOJIS } from "@/lib/app-emojis";
import {
  useFavorites,
  useRecentEmojis,
  useRecentGifs,
  useRecentStickers,
  type FavItem,
} from "@/lib/expression-store";
import {
  useStickers,
  uploadUserSticker,
  deleteUserSticker,
  type StickerItem,
} from "@/components/chat/sticker-picker";
import { cn } from "@/lib/utils";

export type PanelTab = "emoji" | "gif" | "sticker" | "fav";
type Gif = { id: string; url: string; w: number; h: number; alt: string };

const GIF_TERMS = ["amor", "feliz", "risada", "parabéns", "dança", "aplausos"];

const gifCache = new Map<string, Gif[]>();

/* ------------------------------- shell ---------------------------------- */

export function ExpressionPanel({
  open,
  tab,
  onTabChange,
  onClose,
  userId,
  onEmoji,
  onGif,
  onSticker,
}: {
  open: boolean;
  tab: PanelTab;
  onTabChange: (t: PanelTab) => void;
  onClose: () => void;
  userId?: string;
  onEmoji: (text: string) => void;
  onGif: (g: Gif) => void;
  onSticker: (s: StickerItem) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Keep the latest onClose without retriggering the history effect on re-render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Android back button closes the panel first.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    window.history.pushState({ vibelyPanel: true }, "");
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (window.history.state?.vibelyPanel) window.history.back();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col justify-end sm:items-center">
      <button
        type="button"
        aria-label="Fechar painel"
        onClick={onClose}
        className="flex-1 bg-transparent"
      />
      <div
        role="dialog"
        aria-label="Emojis, GIFs e figurinhas"
        className="flex w-full flex-col rounded-t-2xl border-t bg-background shadow-2xl animate-in slide-in-from-bottom duration-200 sm:max-w-[430px] sm:border-x"
        style={{
          height: "min(48dvh, 390px)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <TabBar tab={tab} onTabChange={onTabChange} onClose={onClose} />
        <div className="min-h-0 flex-1">
          {tab === "emoji" ? (
            <EmojiTab onEmoji={onEmoji} />
          ) : tab === "gif" ? (
            <GifTab onGif={onGif} />
          ) : tab === "sticker" ? (
            <StickerTab userId={userId} onSticker={onSticker} />
          ) : (
            <FavoritesTab onEmoji={onEmoji} onGif={onGif} onSticker={onSticker} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const TABS: { id: PanelTab; icon: string; label: string }[] = [
  { id: "emoji", icon: "☺", label: "Emojis" },
  { id: "gif", icon: "GIF", label: "GIF" },
  { id: "sticker", icon: "◇", label: "Figurinhas" },
  { id: "fav", icon: "♡", label: "Favoritos" },
];

function TabBar({
  tab,
  onTabChange,
  onClose,
}: {
  tab: PanelTab;
  onTabChange: (t: PanelTab) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-12 shrink-0 items-stretch border-b px-2">
      <div className="grid min-w-0 flex-1 grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            aria-pressed={tab === t.id}
            className={cn(
              "relative flex min-w-0 items-center justify-center gap-1.5 px-1 text-[11px] font-medium transition-colors",
              tab === t.id ? "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary" : "text-muted-foreground",
            )}
          >
            <span className={t.id === "gif" ? "text-[9px] font-bold" : "text-lg leading-none"}>
              {t.icon}
            </span>
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        className="grid w-10 shrink-0 place-items-center text-muted-foreground active:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mx-3 my-2 flex h-9 shrink-0 items-center gap-2 rounded-lg bg-muted px-3">
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="Limpar">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------- emojis -------------------------------- */

const EmojiButton = memo(function EmojiButton({
  char,
  onPick,
  onLong,
}: {
  char: string;
  onPick: (c: string) => void;
  onLong?: (c: string) => void;
}) {
  const timer = useRef<number | null>(null);
  const long = useRef(false);
  return (
    <button
      type="button"
      aria-label={char}
      onPointerDown={() => {
        long.current = false;
        if (!onLong) return;
        timer.current = window.setTimeout(() => {
          long.current = true;
          onLong(char);
        }, 450);
      }}
      onPointerUp={() => timer.current && window.clearTimeout(timer.current)}
      onPointerLeave={() => timer.current && window.clearTimeout(timer.current)}
      onClick={() => {
        if (long.current) return;
        onPick(char);
      }}
      className="emoji-anim-hover grid h-10 w-full place-items-center rounded-xl text-[26px] leading-none transition active:scale-90 active:bg-muted"
    >
      <span className="emoji-char inline-block">{char}</span>
    </button>

  );
});

function EmojiTab({ onEmoji }: { onEmoji: (t: string) => void }) {
  const [q, setQ] = useState("");
  const recents = useRecentEmojis();
  const favs = useFavorites();
  const scrollRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => (q ? searchEmojis(q) : []), [q]);

  const pick = useCallback(
    (char: string) => {
      recents.push(char);
      onEmoji(char);
    },
    [onEmoji, recents],
  );

  const fav = useCallback(
    (char: string) => favs.toggle({ kind: "emoji", id: `emoji:${char}`, char }),
    [favs],
  );

  function jump(id: EmojiCategoryId | "recent") {
    const el = scrollRef.current?.querySelector(`[data-cat="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex h-full flex-col">
      <SearchField value={q} onChange={setQ} placeholder="Pesquisar emojis…" />
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 [-webkit-overflow-scrolling:touch]"
      >
        {q ? (
          results.length ? (
            <div className="grid grid-cols-8 gap-1">
              {results.map((c) => (
                <EmojiButton key={c} char={c} onPick={pick} onLong={fav} />
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">Nenhum emoji encontrado</p>
          )
        ) : (
          <>
            {recents.items.length ? (
              <section data-cat="recent" className="pt-1">
                <h3 className="mb-1 text-[11px] font-medium text-muted-foreground">🕘 Recentes</h3>
                <div className="grid grid-cols-8 gap-1">
                  {recents.items.slice(0, 24).map((c) => (
                    <EmojiButton key={`r-${c}`} char={c} onPick={pick} onLong={fav} />
                  ))}
                </div>
              </section>
            ) : null}

            <section data-cat="app" className="pt-3">
              <h3 className="mb-1 text-[11px] font-medium text-muted-foreground">
                ✨ Exclusivos do app
              </h3>
              <div className="grid grid-cols-8 gap-1">
                {APP_EMOJIS.map((e, i) => (
                  <button
                    key={e.code}
                    type="button"
                    aria-label={e.label}
                    onClick={() => pick(`:${e.code}:`)}
                    className="emoji-anim-hover grid h-10 w-full place-items-center rounded-xl transition active:scale-90 active:bg-muted"
                  >
                    <img
                      src={e.src}
                      alt={e.label}
                      loading="lazy"
                      decoding="async"
                      style={{ animationDelay: `${i * 45}ms` }}
                      className="emoji-anim h-7 w-7 object-contain"
                    />
                  </button>
                ))}

              </div>
            </section>

            {EMOJI_CATEGORIES.map((cat) => (
              <section key={cat.id} data-cat={cat.id} className="pt-3">
                <h3 className="mb-1 text-[11px] font-medium text-muted-foreground">
                  {cat.icon} {cat.label}
                </h3>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map(([c]) => (
                    <EmojiButton key={c} char={c} onPick={pick} onLong={fav} />
                  ))}
                </div>
              </section>
            ))}
            <p className="py-3 text-center text-[10px] text-muted-foreground">
              Segure um emoji para favoritar
            </p>
          </>
        )}
      </div>
      {!q ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t px-2 py-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
          {recents.items.length ? (
            <button
              type="button"
              aria-label="Recentes"
              onClick={() => jump("recent")}
              className="shrink-0 rounded-lg px-2 py-1.5 text-lg active:bg-muted"
            >
              🕘
            </button>
          ) : null}
          {EMOJI_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.label}
              onClick={() => jump(c.id)}
              className="shrink-0 rounded-lg px-2 py-1.5 text-lg active:bg-muted"
            >
              {c.icon}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------- gifs --------------------------------- */

function GifTab({ onGif }: { onGif: (g: Gif) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const search = useServerFn(searchGifs);
  const recents = useRecentGifs();
  const favs = useFavorites();
  const reqId = useRef(0);

  const run = useCallback(
    async (query: string) => {
      const key = query.trim().toLowerCase();
      const cached = gifCache.get(key);
      if (cached?.length) {
        setItems(cached);
        setErr(null);
        setLoading(false);
        return;
      }
      const my = ++reqId.current;
      setLoading(true);
      setErr(null);
      try {
        const res = await search({ data: { q: key } });
        if (my !== reqId.current) return;
        if (!res.ok) {
          setErr(res.detail ? `${res.message} — ${res.detail}` : res.message);
          setItems([]);
        } else {
          gifCache.set(key, res.items);
          setItems(res.items);
        }
      } catch (e: any) {
        console.error("[gif-panel] search failed", e);
        if (my !== reqId.current) return;
        setErr(e?.message ?? "Falha ao carregar GIFs");
        setItems([]);
      } finally {
        if (my === reqId.current) setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    const t = window.setTimeout(() => void run(q), q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [q, run]);

  const pick = (g: Gif) => {
    recents.push(g);
    onGif(g);
  };

  return (
    <div className="flex h-full flex-col">
      <SearchField value={q} onChange={setQ} placeholder="Pesquisar GIFs…" />
      {!q ? <div className="flex shrink-0 gap-1 overflow-x-auto px-3 pb-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        {GIF_TERMS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setQ(t)}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1 text-[11px] transition",
              q === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 [-webkit-overflow-scrolling:touch]">
        {!q && recents.items.length ? (
          <div className="mb-2">
            <h3 className="mb-1 text-[11px] font-medium text-muted-foreground">🕘 Recentes</h3>
            <div className="flex gap-1 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
              {recents.items.slice(0, 12).map((g) => (
                <button
                  key={`r-${g.id}`}
                  type="button"
                  onClick={() => pick(g)}
                  className="h-16 shrink-0 overflow-hidden rounded-lg bg-muted"
                >
                  <img src={g.url} alt={g.alt} loading="lazy" className="h-full w-auto" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="columns-2 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="mb-1 w-full animate-pulse rounded-lg bg-muted"
                style={{ height: 90 + (i % 3) * 40 }}
              />
            ))}
          </div>
        ) : err ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="px-4 text-xs text-destructive">{err}</p>
            <button
              type="button"
              onClick={() => void run(q)}
              className="flex items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-xs"
            >
              <RefreshCw className="h-3 w-3" /> Tentar de novo
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">Nada encontrado</p>
        ) : (
          <div className="columns-2 gap-1 [column-fill:_balance]">
            {items.map((g) => {
              const id = `gif:${g.id}`;
              const isFav = favs.has(id);
              return (
                <div key={g.id} className="relative mb-1 break-inside-avoid">
                  <button
                    type="button"
                    onClick={() => pick(g)}
                    className="block w-full overflow-hidden rounded-lg bg-muted active:scale-[0.98]"
                  >
                    <img
                      src={g.url}
                      alt={g.alt}
                      loading="lazy"
                      decoding="async"
                      className="block h-auto w-full"
                      style={{ aspectRatio: g.w && g.h ? `${g.w}/${g.h}` : undefined }}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={isFav ? "Remover dos favoritos" : "Favoritar"}
                    onClick={() => favs.toggle({ kind: "gif", ...g, id })}
                    className="absolute right-1 top-1 rounded-full bg-background/70 p-1.5 backdrop-blur"
                  >
                    <Heart className={cn("h-3.5 w-3.5", isFav && "fill-primary text-primary")} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="pt-1 text-center text-[10px] text-muted-foreground">Powered by Tenor</p>
      </div>
    </div>
  );
}

/* ------------------------------- stickers -------------------------------- */

type PackId = "recent" | "fav" | "official" | "mine";

function StickerTab({
  userId,
  onSticker,
}: {
  userId?: string;
  onSticker: (s: StickerItem) => void;
}) {
  const [pack, setPack] = useState<PackId>("official");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const stickers = useStickers(userId);
  const recents = useRecentStickers();
  const favs = useFavorites();

  const official = stickers.data?.official ?? [];
  const mine = stickers.data?.mine ?? [];

  const list: StickerItem[] = useMemo(() => {
    const base =
      pack === "official"
        ? official
        : pack === "mine"
        ? mine
        : pack === "recent"
        ? recents.items.map((s) => ({ id: s.id, url: s.url, name: s.name, path: s.path, own: s.own }))
        : favs.items
            .filter((f): f is Extract<FavItem, { kind: "sticker" }> => f.kind === "sticker")
            .map((s) => ({ id: s.id.replace(/^sticker:/, ""), url: s.url, name: s.name, path: s.path, own: s.own }));
    const term = q.trim().toLowerCase();
    return term ? base.filter((s) => (s.name ?? "").toLowerCase().includes(term)) : base;
  }, [pack, official, mine, recents.items, favs.items, q]);

  async function handleUpload(file: File) {
    if (!userId) return;
    setBusy(true);
    const ok = await uploadUserSticker(userId, file);
    setBusy(false);
    if (ok) {
      qc.invalidateQueries({ queryKey: ["stickers", userId] });
      setPack("mine");
    }
  }

  const packs: { id: PackId; icon: React.ReactNode; label: string }[] = [
    { id: "recent", icon: "🕘", label: "Recentes" },
    { id: "fav", icon: "⭐", label: "Favoritas" },
    { id: "official", icon: "📦", label: "Pacote oficial" },
    { id: "mine", icon: "🎨", label: "Meus pacotes" },
  ];

  return (
    <div className="flex h-full flex-col">
      <SearchField value={q} onChange={setQ} placeholder="Pesquisar figurinhas…" />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 [-webkit-overflow-scrolling:touch]">
        {stickers.isLoading ? (
          <div className="flex h-32 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando figurinhas…
          </div>
        ) : list.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            {pack === "mine"
              ? "Toque em ➕ para criar sua figurinha."
              : pack === "fav"
              ? "Nenhuma figurinha favorita ainda."
              : pack === "recent"
              ? "Suas figurinhas recentes aparecem aqui."
              : "Nada encontrado"}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {list.map((s) => {
              const favId = `sticker:${s.id}`;
              const isFav = favs.has(favId);
              return (
                <div key={s.id} className="group relative">
                  <button
                    type="button"
                    aria-label={s.name}
                    onClick={() => {
                      recents.push({ id: s.id, url: s.url, name: s.name, path: s.path, own: s.own });
                      onSticker(s);
                    }}
                    className="aspect-square w-full rounded-xl p-1 transition active:scale-95 active:bg-muted"
                  >
                    <img
                      src={s.url}
                      alt={s.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={isFav ? "Remover dos favoritos" : "Favoritar"}
                    onClick={() =>
                      favs.toggle({
                        kind: "sticker",
                        id: favId,
                        url: s.url,
                        name: s.name,
                        path: s.path,
                        own: s.own,
                      })
                    }
                    className="absolute -right-0.5 -top-0.5 rounded-full bg-background/80 p-1 backdrop-blur"
                  >
                    <Star className={cn("h-3 w-3", isFav && "fill-primary text-primary")} />
                  </button>
                  {pack === "mine" && s.own ? (
                    <button
                      type="button"
                      aria-label="Remover figurinha"
                      onClick={async () => {
                        if (await deleteUserSticker(s)) {
                          qc.invalidateQueries({ queryKey: ["stickers", userId] });
                        }
                      }}
                      className="absolute -left-0.5 -top-0.5 rounded-full bg-background/80 p-1 backdrop-blur"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t px-2 py-1.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none]">
        {packs.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={p.label}
            aria-pressed={pack === p.id}
            onClick={() => setPack(p.id)}
            className={cn(
              "shrink-0 rounded-lg px-2.5 py-1.5 text-base transition",
              pack === p.id ? "bg-primary/15 ring-1 ring-primary/40" : "active:bg-muted",
            )}
          >
            {p.icon}
          </button>
        ))}
        {userId ? (
          <button
            type="button"
            aria-label="Adicionar pacote"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-muted-foreground active:bg-muted disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleUpload(f);
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------ favorites -------------------------------- */

function FavoritesTab({
  onEmoji,
  onGif,
  onSticker,
}: {
  onEmoji: (t: string) => void;
  onGif: (g: Gif) => void;
  onSticker: (s: StickerItem) => void;
}) {
  const favs = useFavorites();
  const emojis = favs.items.filter((i): i is Extract<FavItem, { kind: "emoji" }> => i.kind === "emoji");
  const gifs = favs.items.filter((i): i is Extract<FavItem, { kind: "gif" }> => i.kind === "gif");
  const stickers = favs.items.filter(
    (i): i is Extract<FavItem, { kind: "sticker" }> => i.kind === "sticker",
  );

  if (!favs.items.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <Heart className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">
          Nada favoritado ainda. Segure um emoji ou toque no ❤️/⭐ de um GIF ou figurinha.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-3 pb-3 [-webkit-overflow-scrolling:touch]">
      {emojis.length ? (
        <section className="pt-1">
          <h3 className="mb-1 text-[11px] font-medium text-muted-foreground">😀 Emojis</h3>
          <div className="grid grid-cols-8 gap-1">
            {emojis.map((e) => (
              <div key={e.id} className="relative">
                <button
                  type="button"
                  onClick={() => onEmoji(e.char)}
                  className="grid h-10 w-full place-items-center rounded-xl text-[26px] leading-none active:bg-muted"
                >
                  {e.char}
                </button>
                <button
                  type="button"
                  aria-label="Remover dos favoritos"
                  onClick={() => favs.remove(e.id)}
                  className="absolute -right-0.5 -top-0.5 rounded-full bg-background/80 p-0.5"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {stickers.length ? (
        <section className="pt-3">
          <h3 className="mb-1 text-[11px] font-medium text-muted-foreground">✨ Figurinhas</h3>
          <div className="grid grid-cols-4 gap-1">
            {stickers.map((s) => (
              <div key={s.id} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    onSticker({
                      id: s.id.replace(/^sticker:/, ""),
                      url: s.url,
                      name: s.name,
                      path: s.path,
                      own: s.own,
                    })
                  }
                  className="aspect-square w-full rounded-xl p-1 active:bg-muted"
                >
                  <img src={s.url} alt={s.name} loading="lazy" className="h-full w-full object-contain" />
                </button>
                <button
                  type="button"
                  aria-label="Remover dos favoritos"
                  onClick={() => favs.remove(s.id)}
                  className="absolute -right-0.5 -top-0.5 rounded-full bg-background/80 p-1"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {gifs.length ? (
        <section className="pt-3">
          <h3 className="mb-1 text-[11px] font-medium text-muted-foreground">GIFs</h3>
          <div className="columns-2 gap-1 [column-fill:_balance]">
            {gifs.map((g) => (
              <div key={g.id} className="relative mb-1 break-inside-avoid">
                <button
                  type="button"
                  onClick={() => onGif({ id: g.id.replace(/^gif:/, ""), url: g.url, w: g.w, h: g.h, alt: g.alt })}
                  className="block w-full overflow-hidden rounded-lg bg-muted"
                >
                  <img
                    src={g.url}
                    alt={g.alt}
                    loading="lazy"
                    className="block h-auto w-full"
                    style={{ aspectRatio: g.w && g.h ? `${g.w}/${g.h}` : undefined }}
                  />
                </button>
                <button
                  type="button"
                  aria-label="Remover dos favoritos"
                  onClick={() => favs.remove(g.id)}
                  className="absolute right-1 top-1 rounded-full bg-background/70 p-1.5 backdrop-blur"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
