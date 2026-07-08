import { useRef, type ReactNode } from "react";
import { motion, type PanInfo } from "framer-motion";
import { useNavigate, useRouterState } from "@tanstack/react-router";

const TABS = ["/", "/reels", "/explore", "/messages", "/notifications"] as const;

/**
 * Horizontal swipe between top-level authenticated tabs.
 * Ignores vertical scroll — only fires when horizontal delta dominates.
 */
export function SwipeableTabs({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const startX = useRef(0);
  const startY = useRef(0);

  const idx = TABS.findIndex((p) => (p === "/" ? pathname === "/" : pathname === p));
  if (idx === -1) return <>{children}</>;

  const go = (dir: 1 | -1) => {
    const next = idx + dir;
    if (next < 0 || next >= TABS.length) return;
    navigate({ to: TABS[next] });
  };

  return (
    <motion.div
      style={{ touchAction: "pan-y" }}
      onPanStart={(_, info: PanInfo) => {
        startX.current = info.point.x;
        startY.current = info.point.y;
      }}
      onPanEnd={(_, info: PanInfo) => {
        const dx = info.offset.x;
        const dy = info.offset.y;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
        const width = window.innerWidth;
        const threshold = width * 0.22;
        if (dx < -threshold || info.velocity.x < -500) go(1);
        else if (dx > threshold || info.velocity.x > 500) go(-1);
      }}
    >
      {children}
    </motion.div>
  );
}
