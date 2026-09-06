import { useEffect, useImperativeHandle, useRef, forwardRef, useCallback } from "react";
import { renderFrame, type RenderContext, type SourceEl } from "@/lib/studio/render";
import { layout, sourceTimeAt } from "@/lib/studio/timeline";
import { dimensionsFor } from "@/lib/studio/export";
import { FONTS } from "@/lib/studio/catalog";
import type { StudioProject } from "@/lib/studio/types";
import { audioContext } from "@/lib/studio/audio";

export type PreviewHandle = {
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
  canvas: () => HTMLCanvasElement | null;
};

type Props = {
  project: StudioProject;
  sources: Map<string, SourceEl>;
  audioBlobs: Map<string, Blob>;
  time: number;
  playing: boolean;
  duration: number;
  onTime: (t: number) => void;
  onEnded: () => void;
};

const FONT_MAP = new Map(FONTS.map((f) => [f.id, f.css] as const));

export const StudioPreview = forwardRef<PreviewHandle, Props>(function StudioPreview(
  { project, sources, audioBlobs, time, playing, duration, onTime, onEnded },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rcRef = useRef<RenderContext | null>(null);
  const timeRef = useRef(time);
  const playingRef = useRef(playing);
  const projectRef = useRef(project);
  const audioNodes = useRef<Map<string, { src: AudioBufferSourceNode; gain: GainNode }>>(new Map());
  const startedAt = useRef(0);

  projectRef.current = project;
  playingRef.current = playing;

  useEffect(() => {
    if (!playing) timeRef.current = time;
  }, [time, playing]);

  const { w, h } = dimensionsFor(project.aspect, 720);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    rcRef.current = {
      ctx,
      w,
      h,
      sources,
      frameCanvas: document.createElement("canvas"),
      scratch: document.createElement("canvas"),
      fonts: FONT_MAP,
    };
  }, [w, h, sources]);

  const stopAudio = useCallback(() => {
    for (const { src } of audioNodes.current.values()) {
      try {
        src.stop();
      } catch {
        /* já parado */
      }
    }
    audioNodes.current.clear();
  }, []);

  // agenda as faixas de áudio quando a reprodução começa
  useEffect(() => {
    if (!playing) {
      stopAudio();
      return;
    }
    let cancelled = false;
    const ctx = audioContext();
    void ctx.resume().catch(() => {});
    const base = ctx.currentTime + 0.06;
    startedAt.current = performance.now() - timeRef.current * 1000;
    void (async () => {
      for (const clip of projectRef.current.clips) {
        if (clip.kind !== "audio" || clip.muted) continue;
        const blob = audioBlobs.get(clip.mediaId);
        if (!blob) continue;
        try {
          const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
          if (cancelled) return;
          const src = ctx.createBufferSource();
          src.buffer = buffer;
          const gain = ctx.createGain();
          gain.gain.value = clip.volume / 100;
          src.connect(gain).connect(ctx.destination);
          const now = timeRef.current;
          const startIn = clip.from - now;
          const offset = Math.max(0, clip.offset + Math.max(0, now - clip.from));
          if (clip.to <= now) continue;
          src.start(base + Math.max(0, startIn), offset);
          src.stop(base + Math.max(0.05, clip.to - now));
          audioNodes.current.set(clip.id, { src, gain });
        } catch {
          /* faixa inválida */
        }
      }
    })();
    return () => {
      cancelled = true;
      stopAudio();
    };
  }, [playing, audioBlobs, stopAudio]);

  // loop de render
  useEffect(() => {
    let raf = 0;
    let lastReport = 0;
    const step = () => {
      const rc = rcRef.current;
      if (rc) {
        const proj = projectRef.current;
        let t = timeRef.current;
        if (playingRef.current) {
          t = (performance.now() - startedAt.current) / 1000;
          if (t >= duration) {
            timeRef.current = duration;
            onEnded();
            renderFrame(rc, proj, duration);
            raf = requestAnimationFrame(step);
            return;
          }
          timeRef.current = t;
          if (t - lastReport > 0.06) {
            lastReport = t;
            onTime(t);
          }
        }

        const placed = layout(proj);
        const cur = placed.find((p) => t >= p.start && t < p.end);
        for (const p of placed) {
          const el = sources.get(p.clip.aiMediaId || p.clip.mediaId);
          if (!(el instanceof HTMLVideoElement)) continue;
          if (cur && p.clip.id === cur.clip.id) {
            const want = sourceTimeAt(p.clip, t - p.start);
            if (playingRef.current) {
              const rate = Math.max(0.25, Math.min(4, p.clip.speed));
              if (el.playbackRate !== rate) el.playbackRate = rate;
              if (Math.abs(el.currentTime - want) > 0.25) el.currentTime = want;
              if (el.paused) void el.play().catch(() => {});
              el.muted = true; // no preview o áudio original vem do próprio elemento apenas se não estiver mudo
              el.volume = 0;
              if (!p.clip.muted) {
                el.muted = false;
                el.volume = (p.clip.volume / 100) * (proj.originalVolume / 100);
              }
            } else {
              if (!el.paused) el.pause();
              if (Math.abs(el.currentTime - want) > 0.05) el.currentTime = want;
            }
          } else if (!el.paused) {
            el.pause();
          }
        }

        renderFrame(rc, proj, t);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [duration, onEnded, onTime, sources]);

  useImperativeHandle(ref, () => ({
    seek: (t: number) => {
      timeRef.current = t;
      startedAt.current = performance.now() - t * 1000;
    },
    play: () => {
      startedAt.current = performance.now() - timeRef.current * 1000;
    },
    pause: () => {},
    canvas: () => canvasRef.current,
  }));

  return (
    <canvas
      ref={canvasRef}
      className="block rounded-2xl bg-black shadow-2xl"
      style={{
        aspectRatio: `${w} / ${h}`,
        width: "auto",
        height: "auto",
        maxWidth: "100%",
        maxHeight: "100%",
      }}
    />
  );
});
