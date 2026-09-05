import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VIDEO_FILTERS, filterById } from "@/lib/video-filters";
import { RotateCw, FlipHorizontal, Crop, Sun, Contrast, Droplets, RefreshCw } from "lucide-react";

export type ImageEditState = {
  aspect: string; // "original" | "1" | "0.8" | "0.5625" | "1.7778"
  zoom: number;
  offsetX: number; // -1..1 relative to free space
  offsetY: number;
  rotation: number; // 0|90|180|270
  flip: boolean;
  filter: string;
  brightness: number; // 1 = neutro
  contrast: number;
  saturation: number;
};

export const defaultImageEdit: ImageEditState = {
  aspect: "1",
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  flip: false,
  filter: "none",
  brightness: 1,
  contrast: 1,
  saturation: 1,
};

const ASPECTS: { id: string; label: string; value: number | null }[] = [
  { id: "original", label: "Original", value: null },
  { id: "1", label: "1:1", value: 1 },
  { id: "0.8", label: "4:5", value: 0.8 },
  { id: "0.5625", label: "9:16", value: 9 / 16 },
  { id: "1.7778", label: "16:9", value: 16 / 9 },
];

function cssFilter(v: ImageEditState) {
  const base = filterById(v.filter).css;
  const adj = `brightness(${v.brightness}) contrast(${v.contrast}) saturate(${v.saturation})`;
  return base === "none" ? adj : `${base} ${adj}`;
}

/** Editor de fotos: recorte com arraste/zoom, giro, espelho, filtros e ajustes. */
export function ImageEditor({
  src,
  value,
  onChange,
}: {
  src: string;
  value: ImageEditState;
  onChange: (v: ImageEditState) => void;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const rotated = value.rotation === 90 || value.rotation === 270;
  const imgRatio = natural ? (rotated ? natural.h / natural.w : natural.w / natural.h) : 1;
  const aspect = useMemo(() => {
    const found = ASPECTS.find((a) => a.id === value.aspect);
    return found?.value ?? imgRatio;
  }, [value.aspect, imgRatio]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, ox: value.offsetX, oy: value.offsetY };
    },
    [value.offsetX, value.offsetY],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      const rect = frameRef.current?.getBoundingClientRect();
      if (!d || !rect) return;
      const nx = d.ox + (e.clientX - d.x) / rect.width;
      const ny = d.oy + (e.clientY - d.y) / rect.height;
      onChange({
        ...value,
        offsetX: Math.max(-1, Math.min(1, nx)),
        offsetY: Math.max(-1, Math.min(1, ny)),
      });
    },
    [onChange, value],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
  }, []);

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-3xl bg-black touch-none select-none"
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={src}
          alt="Edição da foto"
          draggable={false}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          className="absolute left-1/2 top-1/2 h-full w-full object-cover will-change-transform"
          style={{
            filter: cssFilter(value),
            transform: `translate(calc(-50% + ${value.offsetX * 50}%), calc(-50% + ${value.offsetY * 50}%)) scale(${value.zoom}) rotate(${value.rotation}deg) scaleX(${value.flip ? -1 : 1})`,
          }}
        />
        {/* guias de recorte */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="border border-white/20" />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ASPECTS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange({ ...value, aspect: a.id })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
              value.aspect === a.id
                ? "border-primary bg-primary/15 text-primary"
                : "border-white/10 text-muted-foreground",
            )}
          >
            <Crop className="h-3.5 w-3.5" />
            {a.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...value, rotation: ((value.rotation + 90) % 360) as number })}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-medium text-muted-foreground"
        >
          <RotateCw className="h-3.5 w-3.5" /> Girar
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, flip: !value.flip })}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition",
            value.flip ? "border-primary bg-primary/15 text-primary" : "border-white/10 text-muted-foreground",
          )}
        >
          <FlipHorizontal className="h-3.5 w-3.5" /> Espelhar
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...defaultImageEdit, aspect: value.aspect })}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-medium text-muted-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Redefinir
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Zoom</span>
          <span className="tabular-nums">{value.zoom.toFixed(2)}x</span>
        </div>
        <Slider
          min={1}
          max={3}
          step={0.01}
          value={[value.zoom]}
          onValueChange={([z]) => onChange({ ...value, zoom: z })}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {VIDEO_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onChange({ ...value, filter: f.id })}
            className={cn(
              "shrink-0 rounded-2xl border p-1 text-center transition",
              value.filter === f.id ? "border-primary" : "border-white/10",
            )}
          >
            <img
              src={src}
              alt=""
              className="h-14 w-14 rounded-xl object-cover"
              style={{ filter: f.css }}
            />
            <span className="mt-1 block text-[10px] text-muted-foreground">{f.label}</span>
          </button>
        ))}
      </div>

      <Adjust
        icon={<Sun className="h-3.5 w-3.5" />}
        label="Brilho"
        v={value.brightness}
        set={(n) => onChange({ ...value, brightness: n })}
      />
      <Adjust
        icon={<Contrast className="h-3.5 w-3.5" />}
        label="Contraste"
        v={value.contrast}
        set={(n) => onChange({ ...value, contrast: n })}
      />
      <Adjust
        icon={<Droplets className="h-3.5 w-3.5" />}
        label="Saturação"
        v={value.saturation}
        set={(n) => onChange({ ...value, saturation: n })}
      />
    </div>
  );
}

function Adjust({
  icon,
  label,
  v,
  set,
}: {
  icon: React.ReactNode;
  label: string;
  v: number;
  set: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="tabular-nums">{Math.round(v * 100)}%</span>
      </div>
      <Slider min={0.4} max={1.8} step={0.02} value={[v]} onValueChange={([n]) => set(n)} />
    </div>
  );
}

export function imageEditIsNeutral(v: ImageEditState) {
  return (
    v.zoom === 1 &&
    v.offsetX === 0 &&
    v.offsetY === 0 &&
    v.rotation === 0 &&
    !v.flip &&
    v.filter === "none" &&
    v.brightness === 1 &&
    v.contrast === 1 &&
    v.saturation === 1 &&
    v.aspect === "original"
  );
}

/** Renderiza a edição num arquivo JPEG novo, respeitando recorte, giro e filtros. */
export async function exportEditedImage(src: string, v: ImageEditState, maxSide = 1440): Promise<File> {
  const img = await loadImage(src);
  const rotated = v.rotation === 90 || v.rotation === 270;
  const iw = rotated ? img.naturalHeight : img.naturalWidth;
  const ih = rotated ? img.naturalWidth : img.naturalHeight;
  const found = ASPECTS.find((a) => a.id === v.aspect);
  const target = found?.value ?? iw / ih;

  let outW = Math.min(maxSide, target >= 1 ? maxSide : maxSide * target);
  let outH = outW / target;
  if (outH > maxSide) {
    outH = maxSide;
    outW = outH * target;
  }
  outW = Math.round(outW);
  outH = Math.round(outH);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, outW, outH);
  ctx.filter = cssFilter(v);

  // "object-cover" + zoom
  const cover = Math.max(outW / iw, outH / ih) * v.zoom;
  const drawW = iw * cover;
  const drawH = ih * cover;
  const dx = (outW - drawW) / 2 + (v.offsetX * outW) / 2;
  const dy = (outH - drawH) / 2 + (v.offsetY * outH) / 2;

  ctx.save();
  ctx.translate(dx + drawW / 2, dy + drawH / 2);
  ctx.rotate((v.rotation * Math.PI) / 180);
  ctx.scale(v.flip ? -1 : 1, 1);
  const rw = rotated ? drawH : drawW;
  const rh = rotated ? drawW : drawH;
  ctx.drawImage(img, -rw / 2, -rh / 2, rw, rh);
  ctx.restore();

  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao gerar a imagem"))), "image/jpeg", 0.92),
  );
  return new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Não foi possível abrir a imagem"));
    img.src = src;
  });
}
