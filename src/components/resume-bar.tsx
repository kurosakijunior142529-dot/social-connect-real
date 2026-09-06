import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, X } from "lucide-react";
import { clearResume, readResume, type ResumePoint } from "@/lib/resume";

export function ResumeBar() {
  const navigate = useNavigate();
  const [point, setPoint] = useState<ResumePoint | null>(null);

  useEffect(() => {
    setPoint(readResume());
  }, []);

  if (!point) return null;

  return (
    <div className="px-4 pb-2 pt-1">
      <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-[color:var(--surface)] py-1.5 pl-4 pr-1.5">
        <button
          type="button"
          onClick={() => {
            clearResume();
            setPoint(null);
            void navigate({ to: point.path });
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="truncate text-[13px] text-muted-foreground">{point.label}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
        </button>
        <button
          type="button"
          aria-label="Dispensar"
          onClick={() => {
            clearResume();
            setPoint(null);
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition active:scale-90"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
