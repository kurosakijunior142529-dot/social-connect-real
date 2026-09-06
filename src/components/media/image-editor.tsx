import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { VIDEO_FILTERS, filterById } from "@/lib/video-filters";
import {
  RotateCw,
  FlipHorizontal,
  Crop,
  Sun,
  Contrast,
  Droplets,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Sparkles,
  SlidersHorizontal,
  Hand,
} from "lucide-react";

export type CropRect = { x: number; y: number; w: number; h: number }; // % da imagem (0..100)

export type ImageEditState = {
  aspect: string; // "original" | "free" | "1" | "0.8" | "0.5625" | "1.7778"
  crop: CropRect | null; // corte livre (manual)
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
  crop: null,
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
  { id: "free", label: "Livre", value: null },
  { id: "1", label: "1:1", value: 1 },
  { id: "0.8", label: "4:5", value: 0.8 },
  { id: "0.5625", label: "9:16", value: 9 / 16 },
  { id: "1.7778", label: "16:9", value: 16 / 9 },
];

type Tab = "crop" | "filters" | "adjust";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "crop", label: "Cortar", icon: <Crop className="h-4 w-4" /> },
  { id: "filters", label: "Filtros", icon: <Sparkles className="h-4 w-4" /> },
  { id: "adjust", label: "Ajustes", icon: <SlidersHorizontal className="h-4 w-4" /> },
];

function cssFilter(v: ImageEditState) {
  const base = filterById(v.filter).css;
  const adj = `brightness(${v.brightness}) contrast(${v.contrast}) saturate(${v.saturation})`;
  return base === "none" ? adj : `${base} ${adj}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Editor de fotos: recorte com arraste/pinça, giro, espelho, filtros e ajustes. */
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
  const [tab, setTab] = useState<Tab>("crop");
  const [hint, setHint] = useState(true);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const rotated = value.rotation === 90 || value.rotation === 270;
  const imgRatio = natural ? (rotated ? natural.h / natural.w : natural.w / natural.h) : 1;
  const freeMode = value.aspect === "free";
  const aspect = useMemo(() => {
    if (value.aspect === "free") return imgRatio;
    const found = ASPECTS.find((a) => a.id === value.aspect);
    return found?.value ?? imgRatio;
  }, [value.aspect, imgRatio]);

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(false), 4000);
    return () => window.clearTimeout(t);
  }, [hint]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (value.aspect === "free") return; // no corte livre, os gestos pertencem à moldura
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setHint(false);
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: value.zoom };
        drag.current = null;
        return;
      }
      drag.current = { x: e.clientX, y: e.clientY, ox: value.offsetX, oy: value.offsetY };
    },
    [value.offsetX, value.offsetY, value.zoom, value.aspect],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Pinça: dois dedos controlam o zoom
      if (pinch.current && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current.dist > 0 && dist > 0) {
          onChange({ ...value, zoom: clamp(pinch.current.zoom * (dist / pinch.current.dist), 1, 4) });
        }
        return;
      }

      const d = drag.current;
      const rect = frameRef.current?.getBoundingClientRect();
      if (!d || !rect) return;
      // Sensibilidade suave: meio frame de arraste cobre todo o espaço livre
      const nx = d.ox + ((e.clientX - d.x) / rect.width) * 1.6;
      const ny = d.oy + ((e.clientY - d.y) / rect.height) * 1.6;
      onChange({
        ...value,
        offsetX: clamp(nx, -1, 1),
        offsetY: clamp(ny, -1, 1),
      });
    },
    [onChange, value],
  );

  const endPointer = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }, []);

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault?.();
      onChange({ ...value, zoom: clamp(value.zoom - e.deltaY * 0.002, 1, 4) });
    },
    [onChange, value],
  );

  return (
    <div className="space-y-3">
      {/* Pré-visualização */}
      <div
        ref={frameRef}
        className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl bg-black touch-none select-none"
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
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
            transform: freeMode
              ? `translate(-50%, -50%) rotate(${value.rotation}deg) scaleX(${value.flip ? -1 : 1})`
              : `translate(calc(-50% + ${value.offsetX * 50}%), calc(-50% + ${value.offsetY * 50}%)) scale(${value.zoom}) rotate(${value.rotation}deg) scaleX(${value.flip ? -1 : 1})`,
          }}
        />
        {freeMode ? (
          <CropOverlay
            crop={value.crop ?? { x: 8, y: 8, w: 84, h: 84 }}
            onCrop={(crop) => onChange({ ...value, crop })}
            frameRef={frameRef}
          />
        ) : null}
        {/* guias de recorte */}
        {!freeMode && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white/20" />
            ))}
          </div>
        )}
        {/* dica de gestos */}
        {hint && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[11px] text-white backdrop-blur">
              <Hand className="h-3.5 w-3.5" />{" "}
              {freeMode ? "Arraste a moldura ou puxe os cantos" : "Arraste para mover · dois dedos para zoom"}
            </span>
          </div>
        )}
        {/* zoom rápido */}
        {!freeMode && (
        <div className="absolute right-2 top-2 flex flex-col gap-1.5">
          <button
            type="button"
            aria-label="Aumentar zoom"
            onClick={() => onChange({ ...value, zoom: clamp(value.zoom + 0.25, 1, 4) })}
            className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Diminuir zoom"
            onClick={() => onChange({ ...value, zoom: clamp(value.zoom - 0.25, 1, 4) })}
            className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
        </div>
        )}
      </div>

      {/* Abas */}
      <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-medium transition",
              tab === t.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "crop" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {ASPECTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    aspect: a.id,
                    crop: a.id === "free" ? (value.crop ?? { x: 8, y: 8, w: 84, h: 84 }) : value.crop,
                  })
                }
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition",
                  value.aspect === a.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-white/10 text-muted-foreground hover:border-white/25",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...value, rotation: ((value.rotation + 90) % 360) as number })}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:border-white/25"
            >
              <RotateCw className="h-3.5 w-3.5" /> Girar
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...value, flip: !value.flip })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition",
                value.flip ? "border-primary bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:border-white/25",
              )}
            >
              <FlipHorizontal className="h-3.5 w-3.5" /> Espelhar
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...defaultImageEdit,
                  aspect: value.aspect,
                  crop: value.aspect === "free" ? { x: 8, y: 8, w: 84, h: 84 } : null,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground transition hover:border-white/25"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Redefinir
            </button>
          </div>
          {!freeMode && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Zoom</span>
              <span className="tabular-nums">{value.zoom.toFixed(2)}x</span>
            </div>
            <Slider
              min={1}
              max={4}
              step={0.01}
              value={[value.zoom]}
              onValueChange={([z]) => onChange({ ...value, zoom: z })}
            />
          </div>
        </div>
      )}

      {tab === "filters" && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {VIDEO_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onChange({ ...value, filter: f.id })}
              className={cn(
                "shrink-0 rounded-2xl border p-1 text-center transition",
                value.filter === f.id ? "border-primary" : "border-white/10 hover:border-white/25",
              )}
            >
              <img
                src={src}
                alt=""
                className="h-16 w-16 rounded-xl object-cover"
                style={{ filter: f.css }}
                loading="lazy"
              />
              <span
                className={cn(
                  "mt-1 block text-[10px]",
                  value.filter === f.id ? "text-primary" : "text-muted-foreground",
                )}
              >
                {f.label}
              </span>
            </button>
          ))}
        </div>
      )}

      {tab === "adjust" && (
        <div className="space-y-3">
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
      )}
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
        <button
          type="button"
          onClick={() => set(1)}
          className="tabular-nums rounded-full px-2 py-0.5 transition hover:bg-white/5"
          title="Voltar ao padrão"
        >
          {Math.round(v * 100)}%
        </button>
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
