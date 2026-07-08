import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { useRouter } from "@tanstack/react-router";

/**
 * iOS-style swipe-back-from-edge. Wrap a route's content.
 * Only reacts to gestures that begin within 24px of the left edge.
 */
export function SwipeBack({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  const router = useRouter();
  const x = useMotionValue(0);
  const opacity = useTransform(x, [0, 200], [1, 0.6]);
  const started = useRef(false);

  if (disabled) return <>{children}</>;

  return (
    <motion.div
      style={{ x, opacity, touchAction: "pan-y" }}
      onPanStart={(_, info: PanInfo) => {
        started.current = info.point.x - info.offset.x < 24;
      }}
      onPan={(_, info: PanInfo) => {
        if (!started.current) return;
        if (info.offset.x > 0) x.set(info.offset.x);
      }}
      onPanEnd={(_, info: PanInfo) => {
        if (!started.current) return;
        started.current = false;
        const width = window.innerWidth;
        if (info.offset.x > width * 0.4 || info.velocity.x > 500) {
          const distance = width - x.get();
          const duration = Math.min(0.28, distance / 1400);
          const anim = { duration, ease: [0.25, 1, 0.5, 1] as const };
          x.set(x.get());
          const start = performance.now();
          const from = x.get();
          const to = width;
          const step = (t: number) => {
            const p = Math.min(1, (t - start) / (duration * 1000));
            const eased = 1 - Math.pow(1 - p, 4);
            x.set(from + (to - from) * eased);
            if (p < 1) requestAnimationFrame(step);
            else router.history.back();
          };
          requestAnimationFrame(step);
          void anim;
        } else {
          const from = x.get();
          const start = performance.now();
          const dur = 220;
          const step = (t: number) => {
            const p = Math.min(1, (t - start) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            x.set(from + (0 - from) * eased);
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      }}
    >
      {children}
    </motion.div>
  );
}
