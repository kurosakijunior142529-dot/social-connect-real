import {
  applyPostEffect,
  drawAtmosphere,
  effectFilter,
  effectTransform,
  type CamTransform,
  type EffectRuntime,
} from "./effects";
import { FILTERS, filterById } from "./catalog";
import {
  clipDuration,
  layout,
  sourceTimeAt,
  valueAt,
  type Placed,
} from "./timeline";
import type {
  Adjust,
  AudioClip,
  BeautyState,
  Clip,
  Mask,
  MediaClip,
  OverlayClip,
  StickerClip,
  StudioProject,
  TextClip,
} from "./types";

export type SourceEl = HTMLVideoElement | HTMLImageElement;
export type SourceMap = Map<string, SourceEl>;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** converte os ajustes em uma string de filtro CSS (usada no canvas) */
export function adjustFilter(a: Adjust): string {
  const parts: string[] = [];
  const brightness = 1 + a.brightness / 200 + a.exposure / 150;
  if (Math.abs(brightness - 1) > 0.001) parts.push(`brightness(${brightness.toFixed(3)})`);
  const contrast = 1 + a.contrast / 150 + a.clarity / 300;
  if (Math.abs(contrast - 1) > 0.001) parts.push(`contrast(${contrast.toFixed(3)})`);
  const sat = 1 + a.saturation / 120;
  if (Math.abs(sat - 1) > 0.001) parts.push(`saturate(${clamp(sat, 0, 3).toFixed(3)})`);
  if (a.hue) parts.push(`hue-rotate(${a.hue * 1.8}deg)`);
  if (a.temperature) parts.push(`sepia(${clamp(Math.abs(a.temperature) / 220, 0, 0.6).toFixed(3)}) hue-rotate(${a.temperature > 0 ? -8 : 170}deg)`);
  if (a.fade) parts.push(`opacity(${(1 - a.fade / 400).toFixed(3)})`);
  return parts.join(" ") || "none";
}

function joinFilters(...parts: (string | undefined)[]) {
  const list = parts.filter((p): p is string => !!p && p !== "none");
  return list.length ? list.join(" ") : "none";
}

/** filtro do clipe com intensidade (mistura com o original) */
function clipFilter(clip: MediaClip): string {
  const f = filterById(clip.filterId);
  if (f.id === "none" || clip.filterAmount <= 0) return "none";
  return f.css;
}

function drawCover(ctx: CanvasRenderingContext2D, src: SourceEl, w: number, h: number) {
  const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth || w;
  const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight || h;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function applyBeauty(
  ctx: CanvasRenderingContext2D,
  frame: HTMLCanvasElement,
  b: BeautyState,
  w: number,
  h: number,
) {
  if (b.smooth > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(b.smooth / 140, 0, 0.75);
    (ctx as any).filter = `blur(${(b.smooth / 100) * Math.max(2, w * 0.006)}px) brightness(1.02)`;
    ctx.drawImage(frame, 0, 0, w, h);
    (ctx as any).filter = "none";
    ctx.restore();
  }
  if (b.glow > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = clamp(b.glow / 200, 0, 0.6);
    (ctx as any).filter = `blur(${(b.glow / 100) * 18}px)`;
    ctx.drawImage(frame, 0, 0, w, h);
    (ctx as any).filter = "none";
    ctx.restore();
  }
  if (b.faceLight > 0 || b.eyes > 0) {
    const cx = w / 2;
    const cy = h * 0.38;
    const r = Math.max(w, h) * 0.42;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const a = clamp((b.faceLight + b.eyes * 0.5) / 260, 0, 0.5);
    g.addColorStop(0, `rgba(255,250,240,${a})`);
    g.addColorStop(1, "rgba(255,250,240,0)");
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (b.warmth !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = b.warmth > 0 ? "screen" : "multiply";
    ctx.globalAlpha = clamp(Math.abs(b.warmth) / 320, 0, 0.35);
    ctx.fillStyle = b.warmth > 0 ? "#ffb46b" : "#7fb6ff";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

/** deformação (afinar rosto/corpo): remapeia colunas na região central */
function applySlim(ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, amount: number, w: number, h: number) {
  if (amount <= 0) return;
  const k = amount / 100;
  const cols = 48;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  for (let c = 0; c < cols; c++) {
    const x = (c * w) / cols;
    const cw = w / cols + 1;
    const nx = (x + cw / 2) / w - 0.5; // -0.5..0.5
    const pinch = Math.cos(nx * Math.PI) * k * 0.08 * w;
    const dx = x + (nx > 0 ? -pinch : pinch) * 0.5;
    ctx.drawImage(frame, x, 0, cw, h, dx, 0, cw, h);
  }
  ctx.restore();
}

function applyGrainVignette(ctx: CanvasRenderingContext2D, a: Adjust, t: number, w: number, h: number) {
  if (a.vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${clamp(a.vignette / 110, 0, 0.9)})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (a.grain > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(a.grain / 320, 0, 0.35);
    const step = 3;
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const n = Math.sin((x * 12.9898 + y * 78.233 + Math.floor(t * 24)) * 0.017) * 43758.5453;
        const v = n - Math.floor(n);
        if (v > 0.6) {
          ctx.fillStyle = v > 0.8 ? "#fff" : "#000";
          ctx.fillRect(x, y, step, step);
        }
      }
    }
    ctx.restore();
  }
  if (a.highlights !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = a.highlights > 0 ? "screen" : "multiply";
    ctx.globalAlpha = clamp(Math.abs(a.highlights) / 300, 0, 0.4);
    ctx.fillStyle = a.highlights > 0 ? "#ffffff" : "#666666";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (a.shadows !== 0) {
    ctx.save();
    ctx.globalCompositeOperation = a.shadows > 0 ? "lighter" : "multiply";
    ctx.globalAlpha = clamp(Math.abs(a.shadows) / 420, 0, 0.3);
    ctx.fillStyle = a.shadows > 0 ? "#404040" : "#202020";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  const [sh, mid, hi] = a.curve;
  if (sh || mid || hi) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = clamp((Math.abs(sh) + Math.abs(mid) + Math.abs(hi)) / 300, 0, 0.5);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(${128 + hi}, ${128 + hi}, ${128 + hi}, 1)`);
    g.addColorStop(0.5, `rgba(${128 + mid}, ${128 + mid}, ${128 + mid}, 1)`);
    g.addColorStop(1, `rgba(${128 + sh}, ${128 + sh}, ${128 + sh}, 1)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

function applyMask(ctx: CanvasRenderingContext2D, frame: HTMLCanvasElement, mask: Mask, w: number, h: number) {
  if (mask.shape === "none") return;
  const mc = document.createElement("canvas");
  mc.width = w;
  mc.height = h;
  const m = mc.getContext("2d");
  if (!m) return;
  const cx = (mask.x / 100) * w;
  const cy = (mask.y / 100) * h;
  const size = (mask.size / 100) * Math.max(w, h) * 0.6;
  const feather = clamp(mask.feather / 100, 0, 0.95);
  m.fillStyle = "#fff";
  if (mask.shape === "circle") {
    const g = m.createRadialGradient(cx, cy, size * (1 - feather), cx, cy, size);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    m.fillStyle = g;
    m.fillRect(0, 0, w, h);
  } else if (mask.shape === "rect") {
    m.fillRect(cx - size, cy - size * 0.7, size * 2, size * 1.4);
  } else if (mask.shape === "gradient") {
    const g = m.createLinearGradient(0, cy - size, 0, cy + size);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    m.fillStyle = g;
    m.fillRect(0, 0, w, h);
  } else if (mask.shape === "free" && mask.points.length > 2) {
    m.beginPath();
    mask.points.forEach((p, i) => {
      const x = (p.x / 100) * w;
      const y = (p.y / 100) * h;
      if (i === 0) m.moveTo(x, y);
      else m.lineTo(x, y);
    });
    m.closePath();
    m.filter = `blur(${feather * 30}px)`;
    m.fill();
    m.filter = "none";
  } else {
    return;
  }
  if (mask.invert) {
    m.globalCompositeOperation = "xor";
    m.fillStyle = "#fff";
    m.fillRect(0, 0, w, h);
    m.globalCompositeOperation = "source-over";
  }
  // aplica a máscara: fora dela fica escurecido/desfocado
  ctx.save();
  (ctx as any).filter = "blur(10px) brightness(0.7)";
  ctx.drawImage(frame, 0, 0, w, h);
  (ctx as any).filter = "none";
  const inside = document.createElement("canvas");
  inside.width = w;
  inside.height = h;
  const ic = inside.getContext("2d");
  if (ic) {
    ic.drawImage(frame, 0, 0, w, h);
    ic.globalCompositeOperation = "destination-in";
    ic.drawImage(mc, 0, 0);
    ctx.drawImage(inside, 0, 0);
  }
  ctx.restore();
}

function easeOut(k: number) {
  return 1 - Math.pow(1 - clamp(k, 0, 1), 3);
}

function animFactor(anim: string, local: number, dur: number) {
  const inDur = Math.min(0.5, dur * 0.35);
  const k = clamp(local / Math.max(0.05, inDur), 0, 1);
  const outK = clamp((dur - local) / Math.max(0.05, inDur), 0, 1);
  const base = { opacity: 1, scale: 1, dx: 0, dy: 0, rot: 0, chars: 1 };
  switch (anim) {
    case "fade":
      return { ...base, opacity: Math.min(k, outK) };
    case "zoom":
      return { ...base, scale: 0.6 + easeOut(k) * 0.4, opacity: Math.min(1, k * 2) };
    case "slide":
      return { ...base, dx: (1 - easeOut(k)) * 40, opacity: Math.min(1, k * 2) };
    case "bounce": {
      const b = k < 1 ? 1 + Math.sin(k * Math.PI * 3) * (1 - k) * 0.25 : 1;
      return { ...base, scale: b };
    }
    case "typewriter":
      return { ...base, chars: k };
    case "glitch":
      return { ...base, dx: (Math.random() - 0.5) * (k < 1 ? 14 : 3) };
    case "pop":
      return { ...base, scale: 0.4 + easeOut(k) * 0.6 };
    case "shake":
      return { ...base, dx: Math.sin(local * 30) * 4, dy: Math.cos(local * 26) * 3 };
    default:
      return base;
  }
}

function drawText(ctx: CanvasRenderingContext2D, c: TextClip, t: number, w: number, h: number, fontCss: string) {
  const local = t - c.from;
  const dur = c.to - c.from;
  const a = animFactor(c.anim, local, dur);
  const size = (c.size / 100) * h;
  ctx.save();
  ctx.globalAlpha = (c.opacity / 100) * a.opacity;
  ctx.translate((c.x / 100) * w + a.dx, (c.y / 100) * h + a.dy);
  ctx.rotate(((c.rotation + a.rot) * Math.PI) / 180);
  ctx.scale(a.scale, a.scale);
  ctx.font = `700 ${size}px ${fontCss}`;
  ctx.textAlign = c.align;
  ctx.textBaseline = "middle";
  const shown = c.anim === "typewriter" ? c.text.slice(0, Math.ceil(c.text.length * a.chars)) : c.text;
  const lines = shown.split("\n");
  const lh = size * 1.15;
  lines.forEach((line, i) => {
    const y = (i - (lines.length - 1) / 2) * lh;
    if (c.bg) {
      const m = ctx.measureText(line);
      const pad = size * 0.22;
      const bw = m.width + pad * 2;
      const bx = c.align === "center" ? -bw / 2 : c.align === "right" ? -bw : 0;
      ctx.fillStyle = c.bg;
      ctx.globalAlpha = (c.opacity / 100) * a.opacity * 0.85;
      ctx.fillRect(bx, y - lh / 2, bw, lh);
      ctx.globalAlpha = (c.opacity / 100) * a.opacity;
    }
    if (c.shadow > 0) {
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = (c.shadow / 100) * size * 0.6;
      ctx.shadowOffsetY = (c.shadow / 100) * size * 0.12;
    }
    if (c.strokeWidth > 0) {
      ctx.lineWidth = (c.strokeWidth / 100) * size * 0.35;
      ctx.strokeStyle = c.stroke;
      ctx.lineJoin = "round";
      ctx.strokeText(line, 0, y);
    }
    ctx.fillStyle = c.color;
    ctx.fillText(line, 0, y);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
  ctx.restore();
}

function drawSticker(ctx: CanvasRenderingContext2D, c: StickerClip, t: number, w: number, h: number, img?: HTMLImageElement) {
  const local = t - c.from;
  const a = animFactor(c.anim, local, c.to - c.from);
  const size = (c.size / 100) * h;
  ctx.save();
  ctx.globalAlpha = (c.opacity / 100) * a.opacity;
  ctx.translate((c.x / 100) * w + a.dx, (c.y / 100) * h + a.dy);
  ctx.rotate((c.rotation * Math.PI) / 180);
  ctx.scale(a.scale, a.scale);
  if (img) {
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    ctx.font = `${size}px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(c.content, 0, 0);
  }
  ctx.restore();
}

function drawOverlay(ctx: CanvasRenderingContext2D, c: OverlayClip, t: number, w: number, h: number) {
  const alpha = c.opacity / 100;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = c.blend;
  const ox = ((c.x - 50) / 100) * w;
  const oy = ((c.y - 50) / 100) * h;
  ctx.translate(ox, oy);
  const s = c.scale / 100;
  ctx.scale(s, s);
  switch (c.overlayId) {
    case "leak-warm":
    case "leak-cold": {
      const warm = c.overlayId === "leak-warm";
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, warm ? "rgba(255,140,60,0.8)" : "rgba(90,180,255,0.75)");
      g.addColorStop(0.55, warm ? "rgba(255,70,140,0.35)" : "rgba(140,90,255,0.3)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "cinematic": {
      ctx.fillStyle = "rgba(0,0,0,0.95)";
      const bar = h * 0.11;
      ctx.fillRect(0, 0, w, bar);
      ctx.fillRect(0, h - bar, w, bar);
      break;
    }
    case "glow": {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, "rgba(140,255,180,0.35)");
      g.addColorStop(1, "rgba(140,255,180,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "vhs": {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let y = (Math.floor(t * 30) % 4); y < h; y += 4) ctx.fillRect(0, y, w, 1);
      break;
    }
    case "film":
    case "grain": {
      ctx.globalAlpha = alpha * 0.5;
      for (let y = 0; y < h; y += 3) {
        for (let x = 0; x < w; x += 3) {
          const n = Math.sin((x * 12.9898 + y * 78.233 + Math.floor(t * 20)) * 0.019) * 43758.5453;
          const v = n - Math.floor(n);
          if (v > 0.75) {
            ctx.fillStyle = v > 0.9 ? "#fff" : "#000";
            ctx.fillRect(x, y, 3, 3);
          }
        }
      }
      break;
    }
    default: {
      // partículas / poeira / chuva / neve
      drawAtmosphere(ctx, c.overlayId, 0.6, alpha, t, w, h);
      break;
    }
  }
  ctx.restore();
}


export type RenderContext = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  sources: SourceMap;
  /** canvas auxiliares reutilizados entre frames */
  frameCanvas: HTMLCanvasElement;
  scratch: HTMLCanvasElement;
  fonts: Map<string, string>;
  stickerImages?: Map<string, HTMLImageElement>;
};

function activeEffects(clip: MediaClip, local: number): EffectRuntime[] {
  const out: EffectRuntime[] = [];
  for (const e of clip.effects) {
    const from = e.from ?? 0;
    const to = e.to ?? Number.MAX_SAFE_INTEGER;
    if (local < from || local > to) continue;
    const dur = Math.max(0.05, (e.to ?? clipDuration(clip)) - from);
    out.push({
      effectId: e.effectId,
      intensity: e.intensity / 100,
      speed: Math.max(0.05, e.speed / 100),
      opacity: e.opacity / 100,
      t: local - from,
      p: clamp((local - from) / dur, 0, 1),
    });
  }
  return out;
}

function paintClip(rc: RenderContext, placed: Placed, t: number, target: CanvasRenderingContext2D) {
  const { w, h, sources } = rc;
  const clip = placed.clip;
  const local = t - placed.start;
  const src = sources.get(clip.aiMediaId || clip.mediaId);
  target.clearRect(0, 0, w, h);
  target.fillStyle = "#000";
  target.fillRect(0, 0, w, h);
  if (!src || clip.hidden) return;

  const effects = activeEffects(clip, local);
  let cam: CamTransform = {
    x: (valueAt(clip.keyframes?.x, "x", local) / 100) * w,
    y: (valueAt(clip.keyframes?.y, "y", local) / 100) * h,
    scale: valueAt(clip.keyframes?.scale, "scale", local) / 100,
    rotate: valueAt(clip.keyframes?.rotate, "rotate", local),
    blur: valueAt(clip.keyframes?.blur, "blur", local),
  };
  for (const e of effects) cam = effectTransform(e, cam, w, h);

  const opacity = valueAt(clip.keyframes?.opacity, "opacity", local) / 100;
  const extraFilter = effects.map(effectFilter).filter(Boolean).join(" ");
  const filter = joinFilters(
    clipFilter(clip),
    adjustFilter(clip.adjust),
    extraFilter,
    cam.blur > 0.1 ? `blur(${cam.blur.toFixed(2)}px)` : undefined,
    clip.adjust.sharpen > 0 ? `contrast(${1 + clip.adjust.sharpen / 260})` : undefined,
  );

  target.save();
  target.globalAlpha = clamp(opacity, 0, 1);
  target.translate(w / 2 + cam.x, h / 2 + cam.y);
  target.rotate((cam.rotate * Math.PI) / 180);
  target.scale(cam.scale, cam.scale);
  target.translate(-w / 2, -h / 2);
  (target as any).filter = filter;
  // intensidade do filtro: desenha o original por baixo e mistura
  if (clip.filterAmount < 100 && clip.filterId !== "none") {
    (target as any).filter = joinFilters(adjustFilter(clip.adjust), extraFilter);
    drawCover(target, src, w, h);
    target.globalAlpha = clamp(opacity * (clip.filterAmount / 100), 0, 1);
    (target as any).filter = filter;
  }
  drawCover(target, src, w, h);
  (target as any).filter = "none";
  target.restore();
}

/** desenha o frame completo do projeto no tempo `t` (segundos) */
export function renderFrame(rc: RenderContext, project: StudioProject, t: number) {
  const { ctx, w, h } = rc;
  const placedAll = layout(project);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const current = placedAll.find((p) => t >= p.start && t < p.end) ?? placedAll[placedAll.length - 1];
  if (current) {
    const frame = rc.frameCanvas;
    frame.width = w;
    frame.height = h;
    const fctx = frame.getContext("2d");
    if (fctx) {
      paintClip(rc, current, t, fctx);
      const clip = current.clip;
      const local = t - current.start;

      // beleza + máscara
      if (clip.beauty.slim > 0) {
        const tmp = document.createElement("canvas");
        tmp.width = w;
        tmp.height = h;
        const tc = tmp.getContext("2d");
        if (tc) {
          tc.drawImage(frame, 0, 0);
          applySlim(fctx, tmp, clip.beauty.slim, w, h);
        }
      }
      applyBeauty(fctx, frame, clip.beauty, w, h);
      if (clip.mask.shape !== "none") {
        const tmp = document.createElement("canvas");
        tmp.width = w;
        tmp.height = h;
        tmp.getContext("2d")?.drawImage(frame, 0, 0);
        fctx.clearRect(0, 0, w, h);
        applyMask(fctx, tmp, clip.mask, w, h);
      }

      ctx.drawImage(frame, 0, 0);

      // pós-efeitos
      for (const e of activeEffects(clip, local)) {
        applyPostEffect(ctx, frame, rc.scratch, e, w, h);
      }
      applyGrainVignette(ctx, clip.adjust, t, w, h);

      // transição com o clipe anterior
      const trans = clip.transitionIn;
      if (trans && trans.id !== "cut" && local < trans.dur && current.index > 0) {
        const prev = placedAll[current.index - 1];
        if (prev) {
          const k = clamp(local / Math.max(0.05, trans.dur), 0, 1);
          const prevFrame = rc.scratch;
          prevFrame.width = w;
          prevFrame.height = h;
          const pctx = prevFrame.getContext("2d");
          if (pctx) {
            paintClip(rc, prev, prev.end - 0.02, pctx);
            drawTransition(ctx, prevFrame, trans.id, 1 - k, w, h);
          }
        }
      }
    }
  }

  // overlays / stickers / textos
  for (const c of project.clips) {
    if (c.hidden) continue;
    if (c.kind === "overlay" && t >= c.from && t <= c.to) drawOverlay(ctx, c, t, w, h);
  }
  for (const c of project.clips) {
    if (c.hidden) continue;
    if (c.kind === "sticker" && t >= c.from && t <= c.to) {
      drawSticker(ctx, c, t, w, h, rc.stickerImages?.get(c.id));
    }
  }
  for (const c of project.clips) {
    if (c.hidden) continue;
    if (c.kind === "text" && t >= c.from && t <= c.to) {
      drawText(ctx, c, t, w, h, rc.fonts.get(c.font) ?? "system-ui, sans-serif");
    }
  }
}

function drawTransition(
  ctx: CanvasRenderingContext2D,
  prev: HTMLCanvasElement,
  id: string,
  k: number, // 1 = totalmente o clipe anterior
  w: number,
  h: number,
) {
  ctx.save();
  ctx.globalAlpha = k;
  switch (id) {
    case "fade":
      ctx.drawImage(prev, 0, 0, w, h);
      break;
    case "blur":
      (ctx as any).filter = `blur(${(1 - k) * 22}px)`;
      ctx.drawImage(prev, 0, 0, w, h);
      (ctx as any).filter = "none";
      break;
    case "flash":
      ctx.drawImage(prev, 0, 0, w, h);
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      break;
    case "zoom": {
      const s = 1 + (1 - k) * 0.6;
      ctx.translate(w / 2, h / 2);
      ctx.scale(s, s);
      ctx.drawImage(prev, -w / 2, -h / 2, w, h);
      break;
    }
    case "spin": {
      ctx.translate(w / 2, h / 2);
      ctx.rotate((1 - k) * Math.PI);
      const s = 0.4 + k * 0.6;
      ctx.scale(s, s);
      ctx.drawImage(prev, -w / 2, -h / 2, w, h);
      break;
    }
    case "glitch": {
      const slices = 12;
      for (let s = 0; s < slices; s++) {
        const y = (s * h) / slices;
        const dx = (Math.sin(s * 12.3 + k * 9) * (1 - k)) * w * 0.2;
        ctx.drawImage(prev, 0, y, w, h / slices, dx, y, w, h / slices);
      }
      break;
    }
    case "light":
      ctx.drawImage(prev, 0, 0, w, h);
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
      ctx.fillStyle = "#d6ffe4";
      ctx.fillRect(0, 0, w, h);
      break;
    case "slide":
      ctx.drawImage(prev, -(1 - k) * w, 0, w, h);
      break;
    case "distortion": {
      const rows = 40;
      for (let r = 0; r < rows; r++) {
        const y = (r * h) / rows;
        const dx = Math.sin((r / rows) * 10 + (1 - k) * 6) * (1 - k) * w * 0.25;
        ctx.drawImage(prev, 0, y, w, h / rows + 1, dx, y, w, h / rows + 1);
      }
      break;
    }
    case "cube3d": {
      const s = 0.3 + k * 0.7;
      ctx.translate(w / 2, h / 2);
      ctx.transform(1, (1 - k) * 0.35, 0, 1, 0, 0);
      ctx.scale(s, 1);
      ctx.drawImage(prev, -w / 2, -h / 2, w, h);
      break;
    }
    default:
      ctx.drawImage(prev, 0, 0, w, h);
  }
  ctx.restore();
}

/** ajuda a saber qual fonte do projeto é usada */
export function fontMap(list: { id: string; css: string }[]) {
  return new Map(list.map((f) => [f.id, f.css] as const));
}

export type ActiveAudio = { clip: AudioClip; localSourceTime: number; gain: number };

/** ganho da faixa de áudio em determinado tempo (com fades) */
export function audioGainAt(c: AudioClip, t: number): number {
  if (c.muted || t < c.from || t > c.to) return 0;
  let g = c.volume / 100;
  if (c.fadeIn > 0) g *= clamp((t - c.from) / c.fadeIn, 0, 1);
  if (c.fadeOut > 0) g *= clamp((c.to - t) / c.fadeOut, 0, 1);
  return clamp(g, 0, 1);
}

export { clipDuration, sourceTimeAt, layout, FILTERS };
export type { Clip, MediaClip, StudioProject };
