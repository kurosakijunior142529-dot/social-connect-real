import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCw, ZoomIn } from "lucide-react";

const BOX = 288; // preview box (px)
const OUT = 512; // exported size (px)

interface Props {
  file: File | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (file: File) => void | Promise<void>;
  busy?: boolean;
}

/** Editor de foto de perfil com corte circular (estilo Instagram). */
export function AvatarEditor({ file, open, onOpenChange, onConfirm, busy }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
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

  // base scale: cobre a caixa inteira
  const baseScale = img ? Math.max(BOX / img.width, BOX / img.height) : 1;

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, size: number) => {
      if (!img) return;
      const k = size / BOX;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(size / 2 + offset.x * k, size / 2 + offset.y * k);
      ctx.rotate((rotation * Math.PI) / 180);
      const s = baseScale * zoom * k;
      ctx.drawImage(img, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s);
      ctx.restore();
    },
    [img, offset, zoom, rotation, baseScale],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    draw(ctx, canvas.width);
  }, [draw]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragging.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    setOffset({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
  }
  function onPointerUp() {
    dragging.current = null;
  }

  async function confirm() {
    if (!img || !file) return;
    const out = document.createElement("canvas");
    out.width = OUT;
    out.height = OUT;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    draw(ctx, OUT);
    const blob: Blob | null = await new Promise((res) => out.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return;
    const name = file.name.replace(/\.[^.]+$/, "") + "-avatar.jpg";
    await onConfirm(new File([blob], name, { type: "image/jpeg" }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle>Ajustar foto</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div
            className="relative touch-none select-none rounded-full overflow-hidden bg-[color:var(--surface-2)] ring-2 ring-primary/40"
            style={{ width: BOX, height: BOX }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <canvas ref={canvasRef} width={BOX} height={BOX} className="cursor-grab active:cursor-grabbing" />
          </div>

          <div className="w-full space-y-3">
            <div className="flex items-center gap-3">
              <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.01}
                onValueChange={(v) => setZoom(v[0])}
                aria-label="Zoom"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-full gap-2"
              onClick={() => setRotation((r) => (r + 90) % 360)}
            >
              <RotateCw className="h-4 w-4" /> Girar
            </Button>
          </div>

          <div className="grid w-full grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="button" className="rounded-full" onClick={confirm} disabled={!img || busy}>
              {busy ? "Enviando…" : "Usar foto"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
