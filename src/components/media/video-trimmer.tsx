import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Volume2, VolumeX, Crop, Sparkles, Music2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MUSIC_VIBES, renderVibe } from "@/lib/music-catalog";
import type { MusicTrack, WatermarkCorner } from "@/lib/video-export";
import { toast } from "sonner";

export type TrimState = {
  from: number;
  to: number;
  duration: number;
  muted: boolean;
  aspect: "original" | "vertical";
  coverAt: number;
  dewatermark: WatermarkCorner[];
  music: (MusicTrack & { id: string }) | null;
};

export const defaultTrim: TrimState = {
  from: 0,
  to: 0,
  duration: 0,
  muted: false,
  aspect: "original",
  coverAt: 0,
  dewatermark: [],
  music: null,
};

function fmt(s: number) {
  const total = Math.max(0, Math.round(s));
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const CORNERS: { id: WatermarkCorner; label: string }[] = [
  { id: "br", label: "Inferior direito" },
  { id: "bl", label: "Inferior esquerdo" },
  { id: "tr", label: "Superior direito" },
  { id: "tl", label: "Superior esquerdo" },
];

const chip = (active: boolean) =>
  cn(
    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
    active ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface)] text-muted-foreground",
  );

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
  const [loadingVibe, setLoadingVibe] = useState<string | null>(null);

  useEffect(() => {
    setReady(false);
  }, [src]);

  async function pickVibe(id: string) {
    if (value.music?.id === id) return onChange({ ...value, music: null });
    const vibe = MUSIC_VIBES.find((v) => v.id === id);
    if (!vibe) return;
    setLoadingVibe(id);
    try {
      const url = await renderVibe(vibe);
      onChange({
        ...value,
        music: { id, url, name: vibe.name, volume: 0.55, offset: 0, originalVolume: 0.5 },
      });
    } catch (err) {
      console.warn("[trimmer] music render failed", err);
      toast.error("Não foi possível preparar a música neste dispositivo");
    } finally {
      setLoadingVibe(null);
    }
  }

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
          className={chip(value.muted)}
        >
          {value.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {value.muted ? "Sem áudio" : "Com áudio"}
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, aspect: value.aspect === "vertical" ? "original" : "vertical" })}
          className={chip(value.aspect === "vertical")}
        >
          <Crop className="h-3.5 w-3.5" />
          {value.aspect === "vertical" ? "Vertical 9:16" : "Original"}
        </button>
      </div>

      {/* Remoção inteligente de marca d'água */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Remover marca d'água (IA)
        </div>
        <div className="flex flex-wrap gap-2">
          {CORNERS.map((c) => {
            const active = value.dewatermark.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    dewatermark: active
                      ? value.dewatermark.filter((x) => x !== c.id)
                      : [...value.dewatermark, c.id],
                  })
                }
                className={chip(active)}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {value.dewatermark.length ? (
          <p className="text-[11px] text-muted-foreground">
            A área selecionada é reconstruída com os pixels vizinhos ao redor, apagando logos e @ de outros apps.
          </p>
        ) : null}
      </div>

      {/* Música */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Music2 className="h-3.5 w-3.5" />
          Música
        </div>
        <div className="flex flex-wrap gap-2">
          {MUSIC_VIBES.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => pickVibe(v.id)}
              className={chip(value.music?.id === v.id)}
            >
              {loadingVibe === v.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span aria-hidden>{v.emoji}</span>
              )}
              {v.name}
            </button>
          ))}
        </div>

        {value.music ? (
          <div className="space-y-2 rounded-xl bg-[color:var(--surface)] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{value.music.name}</span>
              <button
                type="button"
                onClick={() => onChange({ ...value, music: null })}
                className="text-muted-foreground"
                aria-label="Remover música"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Volume da música</span>
              <span className="tabular-nums">{Math.round(value.music.volume * 100)}%</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[value.music.volume]}
              onValueChange={([a]) => onChange({ ...value, music: { ...value.music!, volume: a } })}
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Áudio original</span>
              <span className="tabular-nums">{Math.round(value.music.originalVolume * 100)}%</span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[value.music.originalVolume]}
              onValueChange={([a]) => onChange({ ...value, music: { ...value.music!, originalVolume: a } })}
            />
            <audio src={value.music.url} controls className="w-full h-8" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
