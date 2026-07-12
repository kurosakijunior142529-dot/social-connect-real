import { Palette, Check } from "lucide-react";
import { useState } from "react";
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
  { id: "mono", label: "Mono", className: "bg-[linear-gradient(135deg,rgba(255,255,255,0.07)_0_1px,transparent_1px_18px),#0a0a0b]" },
];

export function wallpaperClass(type?: string | null) {
  return CHAT_WALLPAPERS.find((w) => w.id === type)?.className ?? CHAT_WALLPAPERS[0].className;
}

export function WallpaperPicker({
  conversationId,
  current,
  open,
  onOpenChange,
}: {
  conversationId: string;
  current?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);

  async function pick(id: string) {
    setSaving(id);
    const { error } = await (supabase as any).rpc("set_conversation_wallpaper", {
      _conversation: conversationId,
      _type: id,
      _value: null,
    });
    setSaving(null);
    if (error) return toast.error(error.message ?? "Não foi possível mudar o papel de parede");
    queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    toast.success(id === "default" ? "Papel de parede removido" : "Papel de parede atualizado");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-white/10 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" /> Papel de parede
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {CHAT_WALLPAPERS.map((wallpaper) => {
            const active = (current ?? "default") === wallpaper.id;
            return (
              <button
                key={wallpaper.id}
                type="button"
                onClick={() => pick(wallpaper.id)}
                disabled={!!saving}
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
        <Button variant="secondary" className="rounded-full" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
}