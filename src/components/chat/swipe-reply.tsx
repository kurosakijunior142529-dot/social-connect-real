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
  const s = useRef({ x: 0, y: 0, on: false, fired: false, lastTap: 0, moved: false });

  const isControl = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest(
      'button, a, input, textarea, select, audio, video, [role="button"], [role="slider"], [contenteditable], [data-swipe-lock]',
    )?.closest('[data-swipe-lock]') && target instanceof Element && !!target.closest(
      'button, a, input, textarea, select, audio, video, [role="button"], [role="slider"], [contenteditable]',
    );

  const buzz = (ms: number) => {
    try { navigator.vibrate?.(ms); } catch { /* noop */ }
  };

  return (
    <div
      data-swipe-lock
      className="relative"
      style={{ touchAction: "pan-y" }}
      onTouchStart={(e) => {
        if (e.touches.length !== 1 || isControl(e.target)) {
          s.current.on = false;
          s.current.lastTap = 0;
          return;
        }
        const t = e.touches[0];
        s.current = { ...s.current, x: t.clientX, y: t.clientY, on: true, fired: false, moved: false };
      }}
      onTouchMove={(e) => {
        if (!s.current.on) return;
        const t = e.touches[0];
        const mx = t.clientX - s.current.x;
        const my = t.clientY - s.current.y;
        if (Math.abs(mx) > 10 || Math.abs(my) > 10) {
          s.current.moved = true;
          s.current.lastTap = 0;
        }
        if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > 10) { s.current.on = false; setDx(0); return; }
        const v = Math.max(0, Math.min(80, mx));
        setDx(v);
        if (v >= 60 && !s.current.fired) { s.current.fired = true; buzz(8); }
      }}
      onTouchEnd={(e) => {
        const active = s.current.on;
        const fired = s.current.fired;
        s.current.on = false;
        setDx(0);
        if (!active || isControl(e.target)) return;
        if (fired) { onReply(); return; }
        if (s.current.moved) return;
        const now = Date.now();
        if (s.current.lastTap && now - s.current.lastTap < 280) {
          s.current.lastTap = 0;
          buzz(10);
          setHeart((h) => h + 1);
          onDoubleTap();
        } else s.current.lastTap = now;
      }}
      onTouchCancel={() => {
        s.current.on = false;
        s.current.lastTap = 0;
        setDx(0);
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
