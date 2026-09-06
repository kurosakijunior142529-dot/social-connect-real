import { useMemo, useRef } from "react";
import { fmtTime, layout, projectDuration } from "@/lib/studio/timeline";
import type { AudioClip, OverlayClip, StickerClip, StudioProject, TextClip } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

type Props = {
  project: StudioProject;
  time: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSeek: (t: number) => void;
};

const PX_PER_SEC = 46;

export function StudioTimeline({ project, time, selectedId, onSelect, onSeek }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const placed = useMemo(() => layout(project), [project]);
  const audio = project.clips.filter((c): c is AudioClip => c.kind === "audio");
  const overlays = project.clips.filter(
    (c): c is TextClip | StickerClip | OverlayClip => c.kind === "text" || c.kind === "sticker" || c.kind === "overlay",
  );
  const total = Math.max(projectDuration(project), ...audio.map((a) => a.to), 3);
  const width = total * PX_PER_SEC;

  const scrub = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    onSeek(Math.max(0, Math.min(total, x / PX_PER_SEC)));
  };

  return (
    <div
      ref={trackRef}
      className="relative overflow-x-auto overflow-y-hidden no-scrollbar border-t border-border/50 bg-background/70 px-3 py-2"
      onPointerDown={(e) => scrub(e.clientX)}
      onPointerMove={(e) => e.buttons === 1 && scrub(e.clientX)}
    >
      <div className="relative" style={{ width }}>
        {/* régua */}
        <div className="mb-1 flex h-3 items-end">
          {Array.from({ length: Math.ceil(total) + 1 }).map((_, i) => (
            <span key={i} className="relative shrink-0 text-[8px] text-muted-foreground" style={{ width: PX_PER_SEC }}>
              {i % 2 === 0 ? `${i}s` : ""}
            </span>
          ))}
        </div>

        {/* clipes de mídia */}
        <div className="relative h-12">
          {placed.map((p, i) => (
            <button
              key={p.clip.id}
              type="button"
              onClick={() => onSelect(p.clip.id)}
              className={cn(
                "absolute top-0 h-12 overflow-hidden rounded-lg border px-2 text-left text-[10px]",
                selectedId === p.clip.id ? "border-primary bg-primary/20" : "border-border/60 bg-muted/50",
              )}
              style={{ left: p.start * PX_PER_SEC, width: Math.max(24, (p.end - p.start) * PX_PER_SEC - 3) }}
            >
              <div className="mt-1 font-semibold">{i + 1}</div>
              <div className="text-muted-foreground">{fmtTime(p.end - p.start)}</div>
            </button>
          ))}
          {!placed.length && (
            <div className="flex h-12 items-center text-[11px] text-muted-foreground">Sem clipes ainda</div>
          )}
        </div>

        {/* textos / stickers / overlays */}
        {!!overlays.length && (
          <div className="relative mt-1 h-6">
            {overlays.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "absolute top-0 h-6 truncate rounded-md border px-2 text-[9px]",
                  selectedId === c.id ? "border-primary bg-primary/20" : "border-border/50 bg-muted/40",
                )}
                style={{ left: c.from * PX_PER_SEC, width: Math.max(20, (c.to - c.from) * PX_PER_SEC - 3) }}
              >
                {c.kind === "text" ? c.text : c.kind === "sticker" ? c.content : c.overlayId}
              </button>
            ))}
          </div>
        )}

        {/* áudio */}
        {audio.map((a) => (
          <div key={a.id} className="relative mt-1 h-6">
            <button
              type="button"
              onClick={() => onSelect(a.id)}
              className={cn(
                "absolute top-0 h-6 truncate rounded-md border px-2 text-[9px]",
                selectedId === a.id ? "border-primary bg-primary/20" : "border-primary/40 bg-primary/10",
              )}
              style={{ left: a.from * PX_PER_SEC, width: Math.max(20, (a.to - a.from) * PX_PER_SEC - 3) }}
            >
              ♪ {a.name}
            </button>
          </div>
        ))}

        {/* batidas */}
        {project.beats.map((b, i) => (
          <span key={i} className="pointer-events-none absolute top-3 h-12 w-px bg-primary/40" style={{ left: b * PX_PER_SEC }} />
        ))}

        {/* playhead */}
        <span
          className="pointer-events-none absolute top-2 bottom-0 w-0.5 bg-primary shadow-[0_0_8px_var(--primary)]"
          style={{ left: time * PX_PER_SEC }}
        />
      </div>
    </div>
  );
}
