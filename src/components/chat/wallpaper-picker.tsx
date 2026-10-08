import { Palette, Check, Upload, Loader2 } from "lucide-react";
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
  { id: "default", label: "Sem imagem" },
  { id: "mono", label: "Desenhos Vibely", image: doodle },
  { id: "midnight", label: "Céu estrelado", image: noite },
  { id: "graphite", label: "Montanhas na neblina", image: neblina },
  { id: "aurora", label: "Cidade na chuva", image: cidade },
  { id: "forest", label: "Folhas e gotas", image: folhas },
  { id: "ocean", label: "Mar ao entardecer", image: mar },
];

export function wallpaperImage(type?: string | null) {
  return CHAT_WALLPAPERS.find((w) => w.id === type)?.image;
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
      <DialogContent className="border-hairline bg-background max-w-md max-h-[85dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader><DialogTitle>Papel de parede</DialogTitle></DialogHeader>
        <div className="relative flex h-36 flex-col justify-center gap-3 overflow-hidden rounded-lg bg-surface p-4" style={wallpaperBackground(previewImage, dim)} aria-label="Prévia do papel de parede">
          <span className="relative self-start rounded-2xl rounded-bl-md bg-surface px-3 py-2 text-sm text-foreground">Que lugar bonito!</span>
          <span className="relative self-end rounded-2xl rounded-br-md bg-chat-mine px-3 py-2 text-sm text-chat-mine-foreground">Nossa próxima viagem ✨</span>
        </div>
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between text-sm"><label id="wallpaper-dim-label">Escurecimento</label><span className="text-muted-foreground">{dim}%</span></div>
          <Slider aria-labelledby="wallpaper-dim-label" value={[dim]} min={0} max={80} step={5} onValueChange={(v) => updateDim(v[0] ?? 35)} />
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = "";
        }} />
        <Button variant="outline" className="h-12 justify-start gap-3 border-hairline" onClick={() => fileRef.current?.click()} disabled={uploading || saving !== null}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? "Enviando imagem…" : "Escolher da galeria"}
        </Button>
        <div className="grid grid-cols-2 gap-2.5">
          {CHAT_WALLPAPERS.map((wallpaper) => (
            <Button key={wallpaper.id} variant="ghost" aria-pressed={selected === wallpaper.id} onClick={() => setSelected(wallpaper.id)} disabled={saving !== null || uploading}
              className={cn("relative flex h-auto min-w-0 flex-col items-stretch gap-0 overflow-hidden rounded-lg border p-0 text-left", selected === wallpaper.id ? "border-primary" : "border-hairline")}>
              <span className="relative block h-24 w-full bg-surface">
                {wallpaper.image ? <img src={wallpaper.image} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Palette className="absolute inset-0 m-auto h-6 w-6 text-muted-foreground" />}
                {selected === wallpaper.id ? <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground"><Check className="h-3.5 w-3.5" /></span> : null}
              </span>
              <span className="w-full whitespace-normal px-2.5 py-2 text-xs font-medium">{wallpaper.label}</span>
            </Button>
          ))}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-hairline bg-background pt-3">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button disabled={saving !== null || uploading} onClick={() => void apply(selected, selected === "custom" ? currentValue ?? null : null)}>
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
