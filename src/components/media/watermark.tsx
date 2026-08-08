import { cn } from "@/lib/utils";

/**
 * Marca d'água do app exibida sobre todo vídeo publicado.
 * Discreta, não interativa e sempre no canto inferior direito.
 */
export function VideoWatermark({
  className,
  size = "md",
  username,
}: {
  className?: string;
  size?: "sm" | "md";
  username?: string | null;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-20 select-none",
        size === "sm" ? "bottom-2 right-2" : "bottom-3 right-3",
        className,
      )}
    >
      <div className="flex flex-col items-end gap-0.5 opacity-70 mix-blend-screen">
        <span
          className={cn(
            "font-display font-semibold tracking-tight text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.65)]",
            size === "sm" ? "text-[10px]" : "text-[13px]",
          )}
        >
          Vibely
        </span>
        {username ? (
          <span
            className={cn(
              "font-medium text-white/80 drop-shadow-[0_1px_6px_rgba(0,0,0,0.65)]",
              size === "sm" ? "text-[8px]" : "text-[10px]",
            )}
          >
            @{username}
          </span>
        ) : null}
      </div>
    </div>
  );
}
