import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AR_CATEGORY_LABELS, AR_CATEGORIES, type ArCategory, type ArEffect } from "@/lib/ar/types";

/** Galeria horizontal de efeitos com abas de categoria. */
export function ArEffectTray({
  effects,
  active,
  onSelect,
  disabled,
}: {
  effects: ArEffect[];
  active: ArEffect;
  onSelect: (effect: ArEffect) => void;
  disabled?: boolean;
}) {
  const [category, setCategory] = useState<ArCategory | "todos">("todos");

  const categories = useMemo(
    () => AR_CATEGORIES.filter((c) => effects.some((e) => e.lensId && e.category === c)),
    [effects],
  );

  const list = useMemo(() => {
    const rest = effects.filter((e) => e.lensId && (category === "todos" || e.category === category));
    const normal = effects.find((e) => !e.lensId);
    return normal ? [normal, ...rest] : rest;
  }, [effects, category]);

  return (
    <div className="space-y-2">
      {categories.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-1">
          {(["todos", ...categories] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c as ArCategory | "todos")}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-[11px] font-medium transition",
                category === c ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70",
              )}
            >
              {c === "todos" ? "Todos" : AR_CATEGORY_LABELS[c as ArCategory]}
            </button>
          ))}
        </div>
      )}

      <div className="no-scrollbar flex gap-3 overflow-x-auto px-1 pb-1">
        {list.map((e) => {
          const selected = e.id === active.id;
          return (
            <button
              key={e.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(e)}
              aria-label={e.name}
              className="flex w-[62px] shrink-0 flex-col items-center gap-1 disabled:opacity-50"
            >
              <span
                className={cn(
                  "grid h-[54px] w-[54px] place-items-center overflow-hidden rounded-full border transition active:scale-95",
                  selected ? "border-primary ring-2 ring-primary/40" : "border-white/20",
                )}
              >
                {e.thumbnailUrl ? (
                  <img src={e.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Sparkles className="h-5 w-5 text-white/70" />
                )}
              </span>
              <span className="line-clamp-1 text-[10px] text-white/70">{e.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
