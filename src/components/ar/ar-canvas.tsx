import { useEffect, useRef } from "react";
import type { EffectEngine } from "@/lib/ar/types";

/** Mostra o canvas já renderizado pelo motor de efeitos. */
export function ArCanvas({
  engine,
  engineVersion,
  className,
}: {
  engine: EffectEngine | null;
  engineVersion: number;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = engine?.getOutputCanvas() ?? null;
    if (!host || !canvas) return;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.objectFit = "cover";
    canvas.style.display = "block";
    host.replaceChildren(canvas);
    return () => {
      if (canvas.parentElement === host) host.removeChild(canvas);
    };
  }, [engine, engineVersion]);

  return <div ref={hostRef} className={className} />;
}
