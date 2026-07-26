import { useState } from "react";
import { Palette, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BUBBLE_THEMES, type BubbleThemeId } from "@/lib/bubble-themes";
import { cn } from "@/lib/utils";

type Props = {
  currentId: BubbleThemeId;
  onSelect: (id: BubbleThemeId) => void;
};

export function BubbleThemePicker({ currentId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-full active:bg-[color:var(--surface-2)]"
        aria-label="Estilo dos balões"
        title="Estilo dos balões"
      >
        <Palette className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle>Estilo dos balões</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto">
            {BUBBLE_THEMES.map((t) => {
              const active = t.id === currentId;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelect(t.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "relative rounded-2xl border p-3 text-left transition",
                    active
                      ? "border-primary ring-2 ring-primary/60"
                      : "border-white/10 hover:border-white/25",
                  )}
                >
                  <div className="flex items-end gap-2 h-16 mb-2">
                    <div
                      className={cn("px-3 py-1.5 text-[12px] rounded-[16px]", t.theirs)}
                      style={{ minWidth: 60 }}
                    >
                      Olá 👋
                    </div>
                    <div className="flex-1" />
                    <div
                      className={cn("px-3 py-1.5 text-[12px] rounded-[16px]", t.mine)}
                      style={{ minWidth: 60 }}
                    >
                      Tudo bem?
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold">{t.label}</span>
                    <span
                      className="h-4 w-8 rounded-full"
                      style={{ background: t.swatch }}
                    />
                  </div>
                  {active ? (
                    <span className="absolute top-2 right-2 h-5 w-5 grid place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
