import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar", className)}>{children}</div>;
}

export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SliderRow({
  label,
  value,
  min = -100,
  max = 100,
  step = 1,
  suffix,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  onReset?: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onReset}
          className="tabular-nums font-medium text-foreground/80"
        >
          {Math.round(value)}
          {suffix ?? ""}
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="studio-range w-full"
      />
    </div>
  );
}

export function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-sm font-semibold">{children}</h3>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-muted-foreground">{children}</p>;
}
