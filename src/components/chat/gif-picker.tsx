import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { searchGifs } from "@/lib/gifs.functions";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Gif = { id: string; url: string; w: number; h: number; alt: string };

const cache = new Map<string, Gif[]>();
const TRENDING_TERMS = ["feliz", "amor", "haha", "chorando", "wow", "ok"];
const STORE_KEY = "vibely:gifcache:v1";

function loadStore(): Record<string, Gif[]> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function persist(key: string, items: Gif[]) {
  if (typeof window === "undefined") return;
  try {
    const store = loadStore();
    store[key] = items.slice(0, 24);
    const keys = Object.keys(store);
    if (keys.length > 12) delete store[keys[0]!];
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* quota — ignore */
  }
}

export function GifPicker({
  onPick,
  trigger,
}: {
  onPick: (g: Gif) => void;
  trigger: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const search = useServerFn(searchGifs);
  const reqId = useRef(0);

  async function run(query: string) {
    const key = query.trim().toLowerCase();
    const cached = cache.get(key) ?? loadStore()[key];
    if (cached?.length) {
      cache.set(key, cached);
      setItems(cached);
      setErr(null);
      setLoading(false);
      return;
    }
    const my = ++reqId.current;
    setLoading(true);
    setErr(null);
    let lastErr: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await search({ data: { q: key } });
        if (my !== reqId.current) return;
        cache.set(key, res.items);
        persist(key, res.items);
        setItems(res.items);
        setLoading(false);
        return;
      } catch (e: any) {
        lastErr = e;
        if (String(e?.message ?? "").includes("inválida")) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (my !== reqId.current) return;
    setErr(lastErr?.message ?? "Falha ao carregar GIFs");
    setItems([]);
    setLoading(false);
  }


  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void run(q), q ? 300 : 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[320px] p-2 glass border-white/10">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar GIFs…"
          autoFocus
          className="mb-2 h-9"
        />
        {!q && !loading && !err ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {TRENDING_TERMS.map((t) => (
              <button
                key={t}
                onClick={() => setQ(t)}
                className="text-[11px] px-2 py-1 rounded-full bg-white/10 hover:bg-white/20"
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
        <div className="h-[320px] overflow-y-auto overscroll-contain -mx-1 px-1 [-webkit-overflow-scrolling:touch]">
          {loading ? (
            <div className="columns-2 gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="mb-1 w-full animate-pulse rounded-md bg-white/10"
                  style={{ height: 90 + (i % 3) * 40 }}
                />
              ))}
              <div className="col-span-full flex items-center justify-center gap-2 py-2 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando GIFs…
              </div>
            </div>
          ) : err ? (

            <div className="flex flex-col items-center justify-center gap-2 h-full text-center">
              <div className="text-xs text-red-400 px-4">{err}</div>
              <Button size="sm" variant="ghost" onClick={() => void run(q)}>
                <RefreshCw className="h-3 w-3 mr-1" /> Tentar de novo
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8">Nada encontrado</div>
          ) : (
            <div className="columns-2 gap-1 [column-fill:_balance]">
              {items.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="mb-1 block w-full overflow-hidden rounded-md bg-black/20 hover:ring-2 hover:ring-primary"
                  onClick={() => {
                    onPick(g);
                    setOpen(false);
                  }}
                >
                  <img
                    src={g.url}
                    alt={g.alt}
                    loading="lazy"
                    className="w-full h-auto block"
                    style={{ aspectRatio: g.w && g.h ? `${g.w}/${g.h}` : undefined }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground text-center pt-1">Powered by Tenor</div>
      </PopoverContent>
    </Popover>
  );
}
