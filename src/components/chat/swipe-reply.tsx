import { useRef, useState, type ReactNode } from "react";
import { Reply } from "lucide-react";

/** Deslizar o balão para a direita responde; dois toques curtem com ❤️. */
export function SwipeReply({
  children,
  onReply,
  onDoubleTap,
}: {
  children: ReactNode;
  onReply: () => void;
  onDoubleTap: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [heart, setHeart] = useState(0);
  const s = useRef({ x: 0, y: 0, on: false, fired: false, lastTap: 0 });

  const buzz = (ms: number) => {
    try { navigator.vibrate?.(ms); } catch { /* noop */ }
  };

  return (
    <div
      data-swipe-lock
      className="relative"
      style={{ touchAction: "pan-y" }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        s.current = { ...s.current, x: t.clientX, y: t.clientY, on: true, fired: false };
      }}
      onTouchMove={(e) => {
        if (!s.current.on) return;
        const t = e.touches[0];
        const mx = t.clientX - s.current.x;
        const my = t.clientY - s.current.y;
        if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 10) { s.current.on = false; setDx(0); return; }
        const v = Math.max(0, Math.min(80, mx));
        setDx(v);
        if (v >= 60 && !s.current.fired) { s.current.fired = true; buzz(8); }
      }}
      onTouchEnd={() => {
        const fired = s.current.fired;
        s.current.on = false;
        setDx(0);
        if (fired) { onReply(); return; }
        const now = Date.now();
        if (now - s.current.lastTap < 280) {
          s.current.lastTap = 0;
          buzz(10);
          setHeart((h) => h + 1);
          onDoubleTap();
        } else s.current.lastTap = now;
      }}
    >
      <div
        className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary"
        style={{ opacity: dx / 60, transform: `translateY(-50%) scale(${0.6 + Math.min(dx, 60) / 150})` }}
      >
        <Reply className="h-4 w-4" />
      </div>
      <div style={{ transform: `translateX(${dx}px)`, transition: dx ? "none" : "transform 200ms ease" }}>
        {children}
      </div>
      {heart ? (
        <span key={heart} className="chat-heart-pop pointer-events-none absolute inset-0 flex items-center justify-center text-3xl">
          ❤️
        </span>
      ) : null}
    </div>
  );
}
