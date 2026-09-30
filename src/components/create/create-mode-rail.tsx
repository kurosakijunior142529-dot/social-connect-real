import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type CreateMode = "feed" | "vibes" | "reels" | "studio";

const MODES: { id: CreateMode; label: string; to: string }[] = [
  { id: "feed", label: "Feed", to: "/create" },
  { id: "vibes", label: "Vibes", to: "/stories/new" },
  { id: "reels", label: "Reels", to: "/create/video" },
  { id: "studio", label: "Studio", to: "/create/studio" },
];

function buzz() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* sem vibração */
  }
}

/** Régua tátil que alterna entre os modos de criação sem sair do fluxo. */
export function CreateModeRail({
  active,
  className,
  onBeforeLeave,
}: {
  active: CreateMode;
  className?: string;
  onBeforeLeave?: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/40 bg-background/55 p-1 backdrop-blur-xl [scrollbar-width:none]">
        {MODES.map((m) => {
          const isActive = m.id === active;
          return (
            <button
              key={m.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                if (isActive) return;
                buzz();
                onBeforeLeave?.();
                void navigate({ to: m.to });
              }}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide transition",
                isActive
                  ? "bg-primary/15 text-primary shadow-[0_0_18px_-6px_var(--primary)] ring-1 ring-primary/50"
                  : "text-foreground/60 active:scale-95",
              )}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
