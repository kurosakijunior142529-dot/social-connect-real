import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type StickerItem = { id: string; url: string; name: string; own?: boolean; path?: string };

const MAX_MB = 3;

/** Official pack + the current user's own stickers (signed URLs). */
export function useStickers(userId?: string) {
  return useQuery({
    queryKey: ["stickers", userId ?? "anon"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ official: StickerItem[]; mine: StickerItem[] }> => {
      const { data: official } = await (supabase as any)
        .from("stickers")
        .select("id, name, url, position")
        .eq("active", true)
        .order("position", { ascending: true });

      let mine: StickerItem[] = [];
      if (userId) {
        const { data: rows } = await (supabase as any)
          .from("user_stickers")
          .select("id, storage_path, name")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        const paths = (rows ?? []).map((r: any) => r.storage_path);
        if (paths.length) {
          const { data: signed } = await supabase.storage
            .from("stickers")
            .createSignedUrls(paths, 60 * 60);
          const byPath = new Map((signed ?? []).map((s: any) => [s.path, s.signedUrl]));
          mine = (rows ?? [])
            .map((r: any) => ({
              id: r.id,
              name: r.name ?? "Figurinha",
              url: byPath.get(r.storage_path) ?? "",
              path: r.storage_path,
              own: true,
            }))
            .filter((s: StickerItem) => !!s.url);
        }
      }

      return {
        official: (official ?? []).map((s: any) => ({ id: s.id, name: s.name, url: s.url })),
        mine,
      };
    },
  });
}

export function StickerGrid({
  userId,
  onPick,
}: {
  userId?: string;
  onPick: (s: StickerItem) => void;
}) {
  const qc = useQueryClient();
  const stickers = useStickers(userId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!userId) return;
    setBusy(true);
    try {
      await uploadUserSticker(userId, file);
      qc.invalidateQueries({ queryKey: ["stickers", userId] });
    } finally {
      setBusy(false);
    }
  }

  async function removeOwn(s: StickerItem) {
    await deleteUserSticker(s);
    qc.invalidateQueries({ queryKey: ["stickers", userId] });
  }

  if (stickers.isLoading) {
    return (
      <div className="flex h-[240px] items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando figurinhas…
      </div>
    );
  }

  const official = stickers.data?.official ?? [];
  const mine = stickers.data?.mine ?? [];

  return (
    <div className="h-[280px] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
      <div className="mb-1 text-[11px] text-muted-foreground">Pacote oficial</div>
      <div className="grid grid-cols-4 gap-1">
        {official.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-xl p-1 hover:bg-white/10"
            aria-label={s.name}
          >
            <img src={s.url} alt={s.name} loading="lazy" className="h-full w-full object-contain" />
          </button>
        ))}
      </div>

      {userId ? (
        <>
          <div className="mb-1 mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Minhas figurinhas</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px]"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
              Adicionar
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-1 pb-2">
            {mine.map((s) => (
              <div key={s.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="w-full rounded-xl p-1 hover:bg-white/10"
                  aria-label={s.name}
                >
                  <img src={s.url} alt={s.name} loading="lazy" className="h-full w-full object-contain" />
                </button>
                <button
                  type="button"
                  onClick={() => removeOwn(s)}
                  aria-label="Remover figurinha"
                  className="absolute -right-1 -top-1 rounded-full bg-black/70 p-1 opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            {mine.length === 0 ? (
              <div className="col-span-4 py-4 text-center text-[11px] text-muted-foreground">
                Envie uma imagem para criar sua figurinha.
              </div>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

export function StickerPicker({
  userId,
  onPick,
  trigger,
}: {
  userId?: string;
  onPick: (s: StickerItem) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="glass w-[320px] border-white/10 p-2">
        <StickerGrid
          userId={userId}
          onPick={(s) => {
            onPick(s);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
