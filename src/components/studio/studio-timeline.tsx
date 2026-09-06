import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { fmtTime, layout, projectDuration, sourceSpan } from "@/lib/studio/timeline";
import type { SourceEl } from "@/lib/studio/render";
import type { AudioClip, MediaClip, OverlayClip, StickerClip, StudioProject, TextClip } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

type Props = {
  project: StudioProject;
  sources: Map<string, SourceEl>;
  time: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeek: (t: number) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
  onTrim: (id: string, patch: { trimStart?: number; trimEnd?: number }) => void;
};

const MIN_PX = 18;
const MAX_PX = 220;

function Thumb({ src, className }: { src: SourceEl | undefined; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !src) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
      const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
      if (!sw || !sh) return;
      const scale = Math.max(canvas.width / sw, canvas.height / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      try {
        ctx.drawImage(src, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      } catch {
        /* frame ainda não disponível */
      }
    };
    draw();
    const id = window.setTimeout(draw, 400);
    return () => window.clearTimeout(id);
  }, [src]);
  return <canvas ref={ref} width={64} height={64} className={cn("h-full w-auto object-cover", className)} />;
}

export function StudioTimeline({ project, sources, time, selectedId, onSelect, onSeek, onReorder, onTrim }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [px, setPx] = useState(52);
  const dragRef = useRef<{ id: string; mode: "move" | "l" | "r"; x: number; acc: number } | null>(null);

  const placed = useMemo(() => layout(project), [project]);
  const audio = project.clips.filter((c): c is AudioClip => c.kind === "audio");
  const overlays = project.clips.filter(
    (c): c is TextClip | StickerClip | OverlayClip => c.kind === "text" || c.kind === "sticker" || c.kind === "overlay",
  );
  const total = Math.max(projectDuration(project), ...audio.map((a) => a.to), 3) + 1;
  const width = total * px;

  const scrub = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft;
      onSeek(Math.max(0, Math.min(total, x / px)));
    },
    [onSeek, px, total],
  );

  // pinça / ctrl+scroll para zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      setPx((z) => Math.min(MAX_PX, Math.max(MIN_PX, z * Math.exp(-dy * 0.0015))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const startDrag = (e: React.PointerEvent, clip: MediaClip, mode: "move" | "l" | "r") => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: clip.id, mode, x: e.clientX, acc: 0 };
    onSelect(clip.id);
  };

  const onDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.buttons === 0) return;
    const dx = e.clientX - d.x;
    if (!dx) return;
    d.x = e.clientX;
    const clip = project.clips.find((c) => c.id === d.id) as MediaClip | undefined;
    if (!clip || clip.kind !== "media") return;

    if (d.mode === "move") {
      d.acc += dx;
      const step = Math.max(40, px);
      while (Math.abs(d.acc) >= step) {
        onReorder(clip.id, d.acc > 0 ? 1 : -1);
        d.acc -= Math.sign(d.acc) * step;
      }
      return;
    }
    const deltaSrc = (dx / px) * Math.max(0.1, clip.speed);
    if (d.mode === "l") {
      const next = Math.max(0, Math.min(clip.trimEnd - 0.2, clip.trimStart + deltaSrc));
      onTrim(clip.id, { trimStart: next });
    } else {
      const next = Math.max(clip.trimStart + 0.2, clip.trimEnd + deltaSrc);
      onTrim(clip.id, { trimEnd: next });
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div className="relative border-t border-border/50 bg-background/80">
      <div className="pointer-events-none absolute right-2 top-1 z-10 flex gap-1">
        <button
          type="button"
          className="pointer-events-auto grid h-6 w-6 place-items-center rounded-full bg-muted/70 backdrop-blur"
          onClick={() => setPx((z) => Math.max(MIN_PX, z / 1.4))}
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="pointer-events-auto grid h-6 w-6 place-items-center rounded-full bg-muted/70 backdrop-blur"
          onClick={() => setPx((z) => Math.min(MAX_PX, z * 1.4))}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-hidden no-scrollbar px-3 py-2"
        style={{ touchAction: "pan-x" }}
        onPointerDown={(e) => !dragRef.current && scrub(e.clientX)}
        onPointerMove={(e) => {
          if (dragRef.current) onDrag(e);
          else if (e.buttons === 1) scrub(e.clientX);
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="relative" style={{ width }}>
          {/* régua */}
          <div className="mb-1 flex h-3 items-end">
            {Array.from({ length: Math.ceil(total) + 1 }).map((_, i) => (
              <span
                key={i}
                className="relative shrink-0 border-l border-border/40 pl-1 text-[8px] text-muted-foreground"
                style={{ width: px }}
              >
                {px > 34 || i % 5 === 0 ? `${i}s` : ""}
              </span>
            ))}
          </div>

          {/* faixa de vídeo */}
          <div className="relative h-14">
            {placed.map((p, i) => {
              const src = sources.get(p.clip.aiMediaId || p.clip.mediaId);
              const active = selectedId === p.clip.id;
              return (
                <div
                  key={p.clip.id}
                  className={cn(
                    "absolute top-0 flex h-14 items-stretch overflow-hidden rounded-xl border transition-shadow",
                    active
                      ? "border-primary shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
                      : "border-border/60",
                  )}
                  style={{ left: p.start * px, width: Math.max(28, (p.end - p.start) * px - 4) }}
                  onPointerDown={(e) => startDrag(e, p.clip, "move")}
                >
                  <div className="pointer-events-none flex h-full w-full items-center gap-0 overflow-hidden bg-muted/50">
                    {Array.from({ length: Math.max(1, Math.round(((p.end - p.start) * px) / 56)) }).map((_, k) => (
                      <Thumb key={k} src={src} />
                    ))}
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-0.5 pt-2 text-[9px] font-medium text-white">
                    <span>{i + 1}</span>
                    <span className="tabular-nums">{fmtTime(p.end - p.start)}</span>
                  </div>
                  {active && (
                    <>
                      <span
                        className="absolute left-0 top-0 h-full w-3 cursor-ew-resize rounded-l-xl bg-primary/80"
                        onPointerDown={(e) => startDrag(e, p.clip, "l")}
                      />
                      <span
                        className="absolute right-0 top-0 h-full w-3 cursor-ew-resize rounded-r-xl bg-primary/80"
                        onPointerDown={(e) => startDrag(e, p.clip, "r")}
                      />
                    </>
                  )}
                  {p.clip.trimStart > 0.05 || p.clip.trimEnd < sourceSpan(p.clip) + p.clip.trimStart - 0.05 ? null : null}
                </div>
              );
            })}
            {!placed.length && (
              <div className="flex h-14 items-center rounded-xl border border-dashed border-border/60 px-3 text-[11px] text-muted-foreground">
                Adicione uma foto ou vídeo
              </div>
            )}
          </div>

          {/* textos / stickers / overlays */}
          {!!overlays.length && (
            <div className="relative mt-1.5 h-6">
              {overlays.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "absolute top-0 h-6 truncate rounded-md border px-2 text-[9px]",
                    c.kind === "text"
                      ? "border-sky-400/50 bg-sky-400/15 text-sky-100"
                      : c.kind === "sticker"
                        ? "border-fuchsia-400/50 bg-fuchsia-400/15 text-fuchsia-100"
                        : "border-amber-400/50 bg-amber-400/15 text-amber-100",
                    selectedId === c.id && "ring-2 ring-primary",
                  )}
                  style={{ left: c.from * px, width: Math.max(24, (c.to - c.from) * px - 4) }}
                >
                  {c.kind === "text" ? c.text : c.kind === "sticker" ? c.content : c.overlayId}
                </button>
              ))}
            </div>
          )}

          {/* áudio */}
          {audio.map((a) => (
            <div key={a.id} className="relative mt-1.5 h-6">
              <button
                type="button"
                onClick={() => onSelect(a.id)}
                className={cn(
                  "absolute top-0 h-6 truncate rounded-md border border-primary/40 bg-primary/15 px-2 text-[9px] text-foreground",
                  selectedId === a.id && "ring-2 ring-primary",
                )}
                style={{ left: a.from * px, width: Math.max(24, (a.to - a.from) * px - 4) }}
              >
                ♪ {a.name}
              </button>
            </div>
          ))}

          {/* batidas */}
          {project.beats.map((b, i) => (
            <span
              key={i}
              className="pointer-events-none absolute top-4 h-14 w-px bg-primary/30"
              style={{ left: b * px }}
            />
          ))}

          {/* playhead */}
          <span
            className="pointer-events-none absolute top-2 bottom-0 z-10 w-0.5 bg-primary shadow-[0_0_10px_var(--primary)]"
            style={{ left: time * px }}
          >
            <span className="absolute -left-[5px] -top-1 h-3 w-3 rounded-full bg-primary" />
          </span>
        </div>
      </div>
    </div>
  );
}
