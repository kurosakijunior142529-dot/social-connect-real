import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCw, ZoomIn, Move } from "lucide-react";

const RATIO = 2.4; // proporção panorâmica da capa
const BOX_W = 320;
const BOX_H = Math.round(BOX_W / RATIO);
const OUT_W = 1800;
const OUT_H = Math.round(OUT_W / RATIO);

interface Props {
  file: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (file: File) => void | Promise<void>;
  busy?: boolean;
}

/** Recorte panorâmico da capa do perfil: arrastar, pinça/zoom e girar. */
export function CoverEditor({ file, open, onOpenChange, onConfirm, busy }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!file) return setImg(null);
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const rotated = rotation % 180 !== 0;
  const iw = img ? (rotated ? img.height : img.width) : 1;
  const ih = img ? (rotated ? img.width : img.height) : 1;
  const baseScale = Math.max(BOX_W / iw, BOX_H / ih);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (!img) return;
      const k = w / BOX_W;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + offset.x * k, h / 2 + offset.y * k);
      ctx.rotate((rotation * Math.PI) / 180);
      const s = baseScale * zoom * k;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s);
      ctx.restore();
    },
    [img, offset, zoom, rotation, baseScale],
  );

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) draw(ctx, c.width, c.height);
  }, [draw]);

  function onDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    }
  }
  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(Math.min(4, Math.max(1, (pinch.current.z * d) / pinch.current.d)));
    } else if (drag.current) {
      setOffset({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
    }
  }
  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  async function confirm() {
    if (!img || !file) return;
    const out = document.createElement("canvas");
    out.width = OUT_W;
    out.height = OUT_H;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    draw(ctx, OUT_W, OUT_H);
    const blob: Blob | null = await new Promise((res) => out.toBlob(res, "image/jpeg", 0.9));
    if (!blob) return;
    const name = file.name.replace(/\.[^.]+$/, "") + "-capa.jpg";
    await onConfirm(new File([blob], name, { type: "image/jpeg" }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Ajustar capa</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative touch-none select-none overflow-hidden rounded-2xl bg-[color:var(--surface-2)] ring-1 ring-[color:var(--hairline)]"
            style={{ width: BOX_W, height: BOX_H }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <canvas ref={canvasRef} width={BOX_W * 2} height={BOX_H * 2} style={{ width: BOX_W, height: BOX_H }} className="cursor-grab active:cursor-grabbing" />
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="border border-foreground/10" />
              ))}
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Move className="h-3.5 w-3.5" /> Arraste para enquadrar · use dois dedos para zoom
          </p>
          <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
              <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={(v) => setZoom(v[0])} aria-label="Zoom" />
            </div>
            <Button type="button" variant="secondary" className="w-full gap-2 rounded-full" onClick={() => setRotation((r) => (r + 90) % 360)}>
              <RotateCw className="h-4 w-4" /> Girar
            </Button>
          </div>
          <div className="grid w-full grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" className="rounded-full" onClick={confirm} disabled={!img || busy}>
              {busy ? "Enviando…" : "Salvar capa"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
