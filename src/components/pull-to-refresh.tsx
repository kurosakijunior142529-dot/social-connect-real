import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PullToRefresh({ children, onRefresh }: { children: ReactNode; onRefresh: () => Promise<unknown> }) {
  const gesture = useRef<{ x: number; y: number; distance: number } | null>(null);
  const busy = useRef(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const reset = () => { gesture.current = null; setDistance(0); };

  return (
    <div className="overscroll-y-contain" onTouchStart={(event) => {
      if (busy.current || window.innerWidth >= 768 || event.touches.length !== 1 || window.scrollY > 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, button, [role="dialog"], [data-swipe-lock]')) return;
      let element = target;
      while (element && element !== event.currentTarget) {
        const overflow = getComputedStyle(element).overflowY;
        if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(overflow)) return;
        element = element.parentElement;
      }
      gesture.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, distance: 0 };
    }} onTouchMove={(event) => {
      const start = gesture.current;
      if (!start || event.touches.length !== 1) { reset(); return; }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (dy < 0 || Math.abs(dx) > 24 && Math.abs(dx) > dy) { reset(); return; }
      start.distance = Math.min(96, dy * 0.45);
      setDistance(start.distance);
    }} onTouchCancel={reset} onTouchEnd={async () => {
      const shouldRefresh = (gesture.current?.distance ?? 0) >= 64;
      reset();
      if (!shouldRefresh || busy.current) return;
      busy.current = true;
      setRefreshing(true);
      try {
        navigator.vibrate?.(10);
        await onRefresh();
      } catch {
        toast.error("Não foi possível atualizar agora");
      } finally { busy.current = false; setRefreshing(false); }
    }}>
      {(distance > 8 || refreshing) && <div role="status" aria-label={refreshing ? "Atualizando" : "Puxar para atualizar"}
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+72px)] z-40 flex justify-center md:hidden">
        <span className={cn("grid h-10 w-10 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm", distance >= 64 && "text-primary")}>
          {refreshing ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <ArrowDown className={cn("h-5 w-5 transition-transform motion-reduce:transition-none", distance >= 64 && "rotate-180")} />}
        </span>
      </div>}
      {children}
    </div>
  );
}