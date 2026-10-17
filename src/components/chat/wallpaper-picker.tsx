import { Palette, Check, ImagePlus, Loader2, Sun, Moon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { uploadMedia, createSignedUrl } from "@/lib/media";
import { useAuth } from "@/hooks/use-auth";
import { Slider } from "@/components/ui/slider";
import { useWallpaperDimming } from "@/lib/wallpaper-dimming";
import noite from "@/assets/wallpapers/noite.jpg";
import neblina from "@/assets/wallpapers/neblina.jpg";
import cidade from "@/assets/wallpapers/cidade.jpg";
import folhas from "@/assets/wallpapers/folhas.jpg";
import mar from "@/assets/wallpapers/mar.jpg";
import doodle from "@/assets/wallpapers/doodle.jpg";

export type ChatWallpaper = { id: string; label: string; image?: string };

export const CHAT_WALLPAPERS: ChatWallpaper[] = [
  { id: "default", label: "Padrão (Desenhos Vibely)", image: doodle },
  { id: "none", label: "Sem imagem" },
  { id: "mono", label: "Desenhos Vibely", image: doodle },
  { id: "midnight", label: "Céu estrelado", image: noite },
  { id: "graphite", label: "Montanhas na neblina", image: neblina },
  { id: "aurora", label: "Cidade na chuva", image: cidade },
  { id: "forest", label: "Folhas e gotas", image: folhas },
  { id: "ocean", label: "Mar ao entardecer", image: mar },
];

export function wallpaperImage(type?: string | null) {
  return CHAT_WALLPAPERS.find((w) => w.id === (type || "default"))?.image;
}

export function wallpaperBackground(image: string | null | undefined, dim: number) {
  if (!image) return undefined;
  const scrim = `color-mix(in srgb, var(--wallpaper-scrim) ${dim}%, transparent)`;
  return { backgroundImage: `linear-gradient(${scrim}, ${scrim}), url(${JSON.stringify(image)})`, backgroundSize: "cover", backgroundPosition: "center" };
}

export function WallpaperPicker({
  conversationId,
  current,
  currentValue,
  open,
  onOpenChange,
}: {
  conversationId: string;
  current?: string | null;
  currentValue?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { dim, updateDim } = useWallpaperDimming(conversationId);
  const [selected, setSelected] = useState(current ?? "default");
  const customUrl = useCustomWallpaperUrl(current, currentValue);
  useEffect(() => { if (open) setSelected(current ?? "default"); }, [open, current]);
  const previewImage = selected === "custom" ? customUrl : wallpaperImage(selected);

  async function apply(type: string, value: string | null) {
    setSaving(type);
    try {
      const { error } = await supabase.rpc("set_conversation_wallpaper", {
        _conversation: conversationId, _type: type, _value: value ?? undefined,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
      toast.success(type === "default" ? "Papel de parede removido" : "Papel de parede atualizado");
      onOpenChange(false);
      return true;
    } catch {
      toast.error("Não foi possível mudar o papel de parede. Tente novamente.");
      return false;
    } finally { setSaving(null); }
  }

  async function handleUpload(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie uma imagem");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 8MB)");
      return;
    }
    setUploading(true);
    try {
      const path = await uploadMedia("chats", user.id, file);
      await apply("custom", path);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar imagem");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-auto bottom-0 translate-y-0 sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 max-w-md max-h-[92dvh] gap-0 overflow-hidden rounded-t-3xl sm:rounded-3xl border-hairline bg-background p-0 flex flex-col">
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-muted sm:hidden" />
        <DialogHeader className="px-5 pt-3 pb-3 text-left">
          <DialogTitle className="font-display text-lg">Papel de parede</DialogTitle>
          <p className="text-xs text-muted-foreground">Só você vê o fundo desta conversa.</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">
          {/* Prévia realista */}
          <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[28px] border border-hairline bg-surface shadow-lg">
            <div className="flex items-center gap-2 border-b border-hairline bg-background/80 px-3 py-2 backdrop-blur">
              <span className="h-7 w-7 shrink-0 rounded-full bg-muted" />
              <div className="min-w-0"><p className="truncate text-xs font-semibold">Sofia</p><p className="text-[10px] text-muted-foreground">online</p></div>
            </div>
            <div className="flex h-56 flex-col justify-end gap-2 p-3 transition-all duration-300" style={wallpaperBackground(previewImage, dim)} aria-label="Prévia do papel de parede">
              <span className="max-w-[80%] self-start rounded-2xl rounded-bl-md bg-surface px-3 py-1.5 text-xs text-foreground shadow-sm">Que lugar bonito! <span className="ml-1 text-[9px] text-muted-foreground">17:32</span></span>
              <span className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-chat-mine px-3 py-1.5 text-xs text-chat-mine-foreground shadow-sm">Nossa próxima viagem ✨ <span className="ml-1 text-[9px] opacity-70">17:33</span></span>
            </div>
          </div>

          {/* Escurecimento */}
          <div className={cn("rounded-2xl bg-surface p-3.5 transition-opacity", !previewImage && "opacity-50 pointer-events-none")}>
            <div className="mb-3 flex items-center justify-between text-sm"><label id="wallpaper-dim-label" className="font-medium">Escurecimento</label><span className="tabular-nums text-muted-foreground">{dim}%</span></div>
            <div className="flex items-center gap-3">
              <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Slider aria-labelledby="wallpaper-dim-label" value={[dim]} min={0} max={80} step={5} onValueChange={(v) => updateDim(v[0] ?? 35)} />
              <Moon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = "";
          }} />

          {/* Grade */}
          <div className="grid grid-cols-3 gap-2.5">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || saving !== null}
              className="group flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline bg-surface text-muted-foreground transition hover:text-foreground active:scale-95">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-background">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              </span>
              <span className="px-1 text-center text-[11px] font-medium leading-tight">{uploading ? "Enviando…" : "Sua foto"}</span>
            </button>
            {CHAT_WALLPAPERS.map((wallpaper) => {
              const active = selected === wallpaper.id;
              return (
                <button type="button" key={wallpaper.id} aria-pressed={active} aria-label={wallpaper.label} onClick={() => setSelected(wallpaper.id)} disabled={saving !== null || uploading}
                  className={cn("relative aspect-[9/16] overflow-hidden rounded-2xl bg-surface ring-offset-2 ring-offset-background transition active:scale-95", active ? "ring-2 ring-primary" : "ring-1 ring-hairline")}>
                  {wallpaper.image ? <img src={wallpaper.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" /> : <Palette className="absolute inset-0 m-auto h-5 w-5 text-muted-foreground" />}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent px-1.5 pb-1.5 pt-6 text-left text-[10px] font-medium leading-tight text-foreground">{wallpaper.label}</span>
                  {active ? <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground shadow"><Check className="h-3 w-3" /></span> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 gap-2 border-t border-hairline bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button variant="secondary" className="flex-1 rounded-full" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="flex-1 rounded-full" disabled={saving !== null || uploading} onClick={() => void apply(selected, selected === "custom" ? currentValue ?? null : null)}>
            {saving !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Aplicar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useCustomWallpaperUrl(
  type: string | null | undefined,
  value: string | null | undefined,
) {
  const [resolved, setResolved] = useState<{ key: string; url: string | null } | null>(null);
  const key = type === "custom" && value ? value : null;
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void createSignedUrl("chats", key).then((url) => {
      if (!cancelled) setResolved({ key, url });
    }).catch(() => { if (!cancelled) setResolved({ key, url: null }); });
    return () => { cancelled = true; };
  }, [key]);
  return key && resolved?.key === key ? resolved.url : null;
}
