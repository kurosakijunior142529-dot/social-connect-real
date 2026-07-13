import { Palette, Check, Upload, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
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

export type ChatWallpaper = {
  id: string;
  label: string;
  className: string;
};

export const CHAT_WALLPAPERS: ChatWallpaper[] = [
  { id: "default", label: "Padrão", className: "bg-background" },
  { id: "aurora", label: "Aurora", className: "bg-[radial-gradient(circle_at_20%_10%,rgba(215,255,58,0.16),transparent_28%),radial-gradient(circle_at_90%_20%,rgba(74,222,128,0.12),transparent_24%),#0a0a0b]" },
  { id: "midnight", label: "Noite", className: "bg-[linear-gradient(135deg,#070707,#141418_48%,#0c1612)]" },
  { id: "lime", label: "Lima", className: "bg-[linear-gradient(160deg,rgba(215,255,58,0.18),rgba(17,17,19,0.94)_42%,rgba(245,245,247,0.05))]" },
  { id: "rose", label: "Rosa", className: "bg-[radial-gradient(circle_at_80%_5%,rgba(255,69,96,0.18),transparent_28%),linear-gradient(180deg,#111113,#09090a)]" },
  { id: "ocean", label: "Oceano", className: "bg-[radial-gradient(circle_at_15%_5%,rgba(56,189,248,0.18),transparent_28%),linear-gradient(145deg,#081015,#111113)]" },
  { id: "sunset", label: "Pôr do sol", className: "bg-[linear-gradient(160deg,#ff9966,#ff5e62_45%,#3a1c40)]" },
  { id: "forest", label: "Floresta", className: "bg-[radial-gradient(circle_at_25%_80%,rgba(34,197,94,0.28),transparent_32%),linear-gradient(160deg,#0b1a12,#0a0a0b)]" },
  { id: "cosmic", label: "Cósmico", className: "bg-[radial-gradient(circle_at_70%_20%,rgba(168,85,247,0.35),transparent_35%),radial-gradient(circle_at_20%_80%,rgba(59,130,246,0.28),transparent_30%),#050510]" },
  { id: "peach", label: "Pêssego", className: "bg-[linear-gradient(160deg,#fde2c8,#f8b4a0_45%,#c76e6e)]" },
  { id: "graphite", label: "Grafite", className: "bg-[linear-gradient(135deg,#1a1a1d,#2a2a30_50%,#101013)]" },
  { id: "paper", label: "Papel", className: "bg-[linear-gradient(180deg,#f5f1e8,#eae2d0)]" },
  { id: "mesh", label: "Mesh", className: "bg-[conic-gradient(from_180deg_at_50%_50%,rgba(215,255,58,0.18),rgba(56,189,248,0.14),rgba(255,69,96,0.14),rgba(215,255,58,0.18))]" },
  { id: "mono", label: "Mono", className: "bg-[linear-gradient(135deg,rgba(255,255,255,0.07)_0_1px,transparent_1px_18px),#0a0a0b]" },
];

export function wallpaperClass(type?: string | null) {
  return CHAT_WALLPAPERS.find((w) => w.id === type)?.className ?? CHAT_WALLPAPERS[0].className;
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

  async function apply(type: string, value: string | null) {
    setSaving(type);
    const { error } = await (supabase as any).rpc("set_conversation_wallpaper", {
      _conversation: conversationId,
      _type: type,
      _value: value,
    });
    setSaving(null);
    if (error) {
      toast.error(error.message ?? "Não foi possível mudar o papel de parede");
      return false;
    }
    queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    toast.success(type === "default" ? "Papel de parede removido" : "Papel de parede atualizado");
    onOpenChange(false);
    return true;
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
      <DialogContent className="glass border-white/10 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" /> Papel de parede
          </DialogTitle>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUpload(f);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || !!saving}
          className="group relative overflow-hidden rounded-2xl border-2 border-dashed border-[color:var(--hairline)] bg-[color:var(--surface-2)] p-4 text-left transition hover:border-primary/50 disabled:opacity-60"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full bg-primary/15 text-primary">
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                {current === "custom" ? "Trocar imagem enviada" : "Enviar imagem própria"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                PNG/JPG até 8MB · só você e a outra pessoa veem
              </div>
            </div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-3 pt-1">
          {CHAT_WALLPAPERS.map((wallpaper) => {
            const active = (current ?? "default") === wallpaper.id;
            return (
              <button
                key={wallpaper.id}
                type="button"
                onClick={() => apply(wallpaper.id, null)}
                disabled={!!saving || uploading}
                className="group overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] text-left transition active:scale-[0.98] disabled:opacity-60"
              >
                <div className={cn("relative h-24", wallpaper.className)}>
                  <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_30%_30%,currentColor_1px,transparent_1px)] [background-size:18px_18px]" />
                  {active ? (
                    <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>
                <div className="px-3 py-2 text-sm font-medium">{wallpaper.label}</div>
              </button>
            );
          })}
        </div>

        {current === "custom" && currentValue ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => apply("default", null)}
            disabled={!!saving || uploading}
          >
            Remover imagem
          </Button>
        ) : null}

        <Button variant="secondary" className="rounded-full" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function useCustomWallpaperUrl(
  type: string | null | undefined,
  value: string | null | undefined,
) {
  const [url, setUrl] = useState<string | null>(null);
  const lastKey = useRef<string | null>(null);
  const key = type === "custom" && value ? value : null;
  if (key !== lastKey.current) {
    lastKey.current = key;
    if (!key) {
      setUrl(null);
    } else {
      void createSignedUrl("chats", key, 60 * 60).then((u) => setUrl(u));
    }
  }
  return url;
}
