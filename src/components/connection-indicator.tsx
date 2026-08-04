import { Loader2, WifiOff } from "lucide-react";
import { useConnectionHealth } from "@/hooks/use-connection-health";

/** Faixa discreta de "Reconectando…" / "Sem conexão" — nunca deixa o app mudo em silêncio. */
export function ConnectionIndicator() {
  const state = useConnectionHealth();
  if (state === "online") return null;

  const offline = state === "offline";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md">
        {offline ? (
          <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        )}
        <span className={offline ? "text-muted-foreground" : "text-foreground"}>
          {offline ? "Sem conexão" : "Reconectando…"}
        </span>
      </div>
    </div>
  );
}
