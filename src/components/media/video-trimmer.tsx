import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Volume2, VolumeX, Crop } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrimState = {
  from: number;
  to: number;
  duration: number;
  muted: boolean;
  aspect: "original" | "vertical";
  coverAt: number;
};

export const defaultTrim: TrimState = {
  from: 0,
  to: 0,
  duration: 0,
  muted: false,
  aspect: "original",
  coverAt: 0,
};

function fmt(s: number) {
  const total = Math.max(0, Math.round(s));
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/**
 * Lightweight trim/edit controls rendered under an existing video preview.
 * Purely presentational — the parent owns the state and applies it on upload.
 */
export function VideoTrimmer({
  src,
  value,
  onChange,
  className,
}: {
  src: string;
  value: TrimState;
  onChange: (next: TrimState) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
  }, [src]);

  return (
    <div className={cn("space-y-3 rounded-2xl bg-[color:var(--surface-2)] p-3", className)}>
      <video
        ref={videoRef}
        src={src}
        className="hidden"
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setReady(true);
            onChange({ ...value, duration: d, to: value.to > 0 ? Math.min(value.to, d) : d });
          }
        }}
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Cortar vídeo</span>
        <span className="tabular-nums">
          {fmt(value.from)} – {fmt(value.to || value.duration)}
        </span>
      </div>

      <Slider
        min={0}
        max={Math.max(0.1, value.duration || 0.1)}
        step={0.1}
        value={[value.from, value.to || value.duration]}
        disabled={!ready}
        onValueChange={([a, b]) => {
          if (b - a < 0.5) return;
          onChange({ ...value, from: a, to: b, coverAt: Math.min(Math.max(value.coverAt, a), b) });
        }}
      />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Capa</span>
        <span className="tabular-nums">{fmt(value.coverAt)}</span>
      </div>
      <Slider
        min={value.from}
        max={Math.max(value.from + 0.1, value.to || value.duration)}
        step={0.1}
        value={[value.coverAt]}
        disabled={!ready}
        onValueChange={([a]) => onChange({ ...value, coverAt: a })}
      />

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => onChange({ ...value, muted: !value.muted })}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
            value.muted ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface)] text-muted-foreground",
          )}
        >
          {value.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {value.muted ? "Sem áudio" : "Com áudio"}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, aspect: value.aspect === "vertical" ? "original" : "vertical" })}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
            value.aspect === "vertical"
              ? "bg-primary text-primary-foreground"
              : "bg-[color:var(--surface)] text-muted-foreground",
          )}
        >
          <Crop className="h-3.5 w-3.5" />
          {value.aspect === "vertical" ? "Vertical 9:16" : "Original"}
        </button>
      </div>
    </div>
  );
}
