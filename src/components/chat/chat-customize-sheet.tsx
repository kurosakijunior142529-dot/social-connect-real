import { useState } from "react";
import { Sparkles, Palette, Type, Ruler, Zap, Check, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BUBBLE_THEMES, CHAT_FONTS, useChatPrefs } from "@/lib/bubble-themes";
import { WallpaperPicker } from "@/components/chat/wallpaper-picker";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  /** When present, enables the "Papel de parede" tab (only DMs support this today). */
  dmConversationId?: string;
  currentWallpaper?: string | null;
  currentWallpaperValue?: string | null;
};

export function ChatCustomizeSheet({
  open,
  onOpenChange,
  chatId,
  dmConversationId,
  currentWallpaper,
  currentWallpaperValue,
}: Props) {
  const { prefs, update, theme, font } = useChatPrefs(chatId);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="glass border-white/10 max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Personalizar conversa
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="bubbles" className="flex flex-col">
            <TabsList className="mx-4 grid grid-cols-4 rounded-full bg-[color:var(--surface-2)] p-1">
              <TabsTrigger value="bubbles" className="rounded-full text-xs gap-1"><Palette className="h-3.5 w-3.5" /> Balões</TabsTrigger>
              <TabsTrigger value="font" className="rounded-full text-xs gap-1"><Type className="h-3.5 w-3.5" /> Fonte</TabsTrigger>
              <TabsTrigger value="radius" className="rounded-full text-xs gap-1"><Ruler className="h-3.5 w-3.5" /> Bordas</TabsTrigger>
              <TabsTrigger value="anim" className="rounded-full text-xs gap-1"><Zap className="h-3.5 w-3.5" /> Animações</TabsTrigger>
            </TabsList>

            <div className="max-h-[65vh] overflow-y-auto p-4 pt-3">
              <TabsContent value="bubbles" className="mt-0 space-y-3">
                {dmConversationId ? (
                  <button
                    type="button"
                    onClick={() => setWallpaperOpen(true)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[color:var(--surface-2)] px-3 py-2.5 text-left transition hover:border-white/25"
                  >
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold">Papel de parede</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {currentWallpaper && currentWallpaper !== "default" ? `Atual: ${currentWallpaper}` : "Escolher fundo da conversa"}
                      </div>
                    </div>
                  </button>
                ) : null}

                <div className="grid grid-cols-2 gap-2.5">
                  {BUBBLE_THEMES.map((t) => {
                    const active = t.id === prefs.themeId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => update({ themeId: t.id })}
                        className={cn(
                          "relative rounded-2xl border p-2.5 text-left transition",
                          active ? "border-primary ring-2 ring-primary/60" : "border-white/10 hover:border-white/25",
                        )}
                      >
                        <div className="flex items-end gap-2 h-14 mb-1.5">
                          <div className={cn("px-3 py-1.5 text-[11px] rounded-[14px]", t.theirs)}>Oi 👋</div>
                          <div className="flex-1" />
                          <div className={cn("px-3 py-1.5 text-[11px] rounded-[14px]", t.mine)}>Tudo bem?</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[12px] font-semibold">{t.label}</span>
                          <span className="h-3 w-6 rounded-full" style={{ background: t.swatch }} />
                        </div>
                        {active ? (
                          <span className="absolute top-1.5 right-1.5 h-4 w-4 grid place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5" strokeWidth={3} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="font" className="mt-0 space-y-2">
                {CHAT_FONTS.map((f) => {
                  const active = f.id === prefs.font;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => update({ font: f.id })}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl border px-4 py-3 transition",
                        active ? "border-primary ring-2 ring-primary/40" : "border-white/10 hover:border-white/25",
                      )}
                    >
                      <span className={cn("text-[15px]", f.className)}>Aa · {f.label}</span>
                      {active ? <Check className="h-4 w-4 text-primary" /> : null}
                    </button>
                  );
                })}
                <div
                  className={cn("mt-3 rounded-2xl border border-white/10 bg-[color:var(--surface-2)] px-4 py-3", font.className)}
                >
                  <div className="text-[11px] text-muted-foreground mb-1">Prévia</div>
                  <div className="text-[15px]">Ei, olha esse novo visual!</div>
                </div>
              </TabsContent>

              <TabsContent value="radius" className="mt-0 space-y-4">
                <div className="flex items-end gap-4 justify-center py-3">
                  <div
                    className="bg-[color:var(--surface-2)] text-foreground text-[13px] px-4 py-2"
                    style={{ borderRadius: prefs.radius, borderBottomLeftRadius: 6 }}
                  >
                    Oi 👋
                  </div>
                  <div
                    className="bg-primary text-primary-foreground text-[13px] px-4 py-2"
                    style={{ borderRadius: prefs.radius, borderBottomRightRadius: 6 }}
                  >
                    Tudo bem?
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[13px]">
                    <span>Raio</span>
                    <span className="text-muted-foreground">{prefs.radius}px</span>
                  </div>
                  <Slider
                    value={[prefs.radius]}
                    min={8}
                    max={28}
                    step={1}
                    onValueChange={(v) => update({ radius: v[0] })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="anim" className="mt-0 space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[color:var(--surface-2)] px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">Animações da conversa</div>
                    <div className="text-[12px] text-muted-foreground">Entradas, reações e transições animadas</div>
                  </div>
                  <Switch checked={prefs.animations} onCheckedChange={(v) => update({ animations: v })} />
                </div>
                <p className="text-[12px] text-muted-foreground px-1">
                  Desative se preferir menos movimento. Respeitamos automaticamente <code>prefers-reduced-motion</code>.
                </p>
              </TabsContent>
            </div>

            <div className="p-3 border-t border-white/10 flex justify-end">
              <Button variant="secondary" className="rounded-full" onClick={() => onOpenChange(false)}>Fechar</Button>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {dmConversationId ? (
        <WallpaperPicker
          conversationId={dmConversationId}
          current={currentWallpaper}
          currentValue={currentWallpaperValue}
          open={wallpaperOpen}
          onOpenChange={setWallpaperOpen}
        />
      ) : null}
    </>
  );
}
