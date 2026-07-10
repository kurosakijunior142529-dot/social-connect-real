import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { searchGifs } from "@/lib/gifs.functions";
import { Loader2 } from "lucide-react";

type Gif = { id: string; url: string; w: number; h: number; alt: string };

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

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await search({ data: { q } });
        setItems(res.items);
      } catch (e: any) {
        setErr(e?.message ?? "Falha ao carregar GIFs");
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, open, search]);

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
        <div className="h-[320px] overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="grid place-items-center h-full text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : err ? (
            <div className="text-center text-xs text-red-500 py-8">{err}</div>
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
