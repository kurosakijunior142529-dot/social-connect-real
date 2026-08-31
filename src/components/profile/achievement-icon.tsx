import { cn } from "@/lib/utils";

export function AchievementIcon({ emoji, unlocked }: { emoji: string; unlocked: boolean }) {
  return (
    <span className={cn("achievement-3d-scene", !unlocked && "achievement-3d-locked")} aria-hidden>
      <span className="achievement-3d-shadow" />
      <span className="achievement-3d-orbit" />
      <span className="achievement-3d-face">{emoji}</span>
      {unlocked ? <span className="achievement-3d-spark">✦</span> : null}
    </span>
  );
}