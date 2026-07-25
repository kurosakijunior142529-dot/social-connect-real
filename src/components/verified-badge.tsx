import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerifiedBadge({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <span
      title="Criador verificado"
      aria-label="Criador verificado"
      className={cn(
        "inline-grid place-items-center rounded-full bg-primary text-primary-foreground shrink-0",
        className,
      )}
      style={{ height: size, width: size }}
    >
      <Check strokeWidth={3.5} style={{ height: size * 0.62, width: size * 0.62 }} />
    </span>
  );
}
