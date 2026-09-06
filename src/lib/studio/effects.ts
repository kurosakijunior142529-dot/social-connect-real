/**
 * Efeitos do Vibely Studio.
 * Tudo roda em canvas 2D e é determinístico no tempo (o mesmo instante gera
 * sempre o mesmo frame), então a pré-visualização e a exportação combinam.
 *
 * Cada efeito é dividido em duas partes:
 *  - `transform`: mexe na câmera (shake, zoom, rotação) antes de desenhar;
 *  - `post`: desenha por cima / distorce o frame já desenhado.
 */

export type EffectRuntime = {
  effectId: string;
  intensity: number; // 0..1
  speed: number; // multiplicador
  opacity: number; // 0..1
  /** tempo local do efeito em segundos */
  t: number;
  /** progresso 0..1 dentro da janela do efeito */
  p: number;
};

export type CamTransform = { x: number; y: number; scale: number; rotate: number; blur: number };

const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export function effectTransform(e: EffectRuntime, base: CamTransform, w: number, h: number): CamTransform {
  const i = e.intensity;
  const t = e.t * e.speed;
  const out = { ...base };
  switch (e.effectId) {
    case "shake": {
      const a = i * 0.045 * w;
      out.x += (rand(Math.floor(t * 30)) - 0.5) * a;
      out.y += (rand(Math.floor(t * 30) + 99) - 0.5) * a;
      out.rotate += (rand(Math.floor(t * 30) + 7) - 0.5) * i * 4;
      break;
    }
    case "handheld": {
      out.x += Math.sin(t * 2.1) * i * 0.02 * w;
      out.y += Math.cos(t * 1.7) * i * 0.02 * h;
      out.rotate += Math.sin(t * 1.3) * i * 1.5;
      break;
    }
    case "zoom-pulse":
      out.scale *= 1 + Math.abs(Math.sin(t * 3.2)) * i * 0.25;
      break;
    case "push-in":
      out.scale *= 1 + e.p * i * 0.4;
      break;
    case "pull-out":
      out.scale *= 1 + (1 - e.p) * i * 0.4;
      break;
    case "cam-rotate":
      out.rotate += Math.sin(t * 2.4) * i * 25;
      break;
    case "cam-move":
      out.x += Math.sin(t * 1.1) * i * 0.12 * w;
      out.scale *= 1 + i * 0.12;
      break;
    case "motion-blur":
      out.blur += i * 6 * (0.5 + 0.5 * Math.abs(Math.sin(t * 4)));
      break;
    case "gaussian-blur":
      out.blur += i * 12;
      break;
    default:
      break;
  }
  return out;
}

/** filtro CSS extra aplicado pelo efeito (cor) */
export function effectFilter(e: EffectRuntime): string {
  const i = e.intensity;
  switch (e.effectId) {
    case "color-cinematic":
      return `contrast(${1 + i * 0.3}) saturate(${1 + i * 0.2}) hue-rotate(${-8 * i}deg)`;
    case "color-neon":
      return `saturate(${1 + i * 0.9}) brightness(${1 + i * 0.12}) hue-rotate(${40 * i}deg)`;
    case "color-cyber":
      return `hue-rotate(${180 * i}deg) saturate(${1 + i * 0.6}) contrast(${1 + i * 0.25})`;
    case "color-dark":
      return `brightness(${1 - i * 0.35}) contrast(${1 + i * 0.35})`;
    case "color-vibrant":
      return `saturate(${1 + i}) contrast(${1 + i * 0.2})`;
    case "color-mono":
      return `grayscale(${i}) contrast(${1 + i * 0.2})`;
    case "vhs":
      return `saturate(${1 + i * 0.5}) hue-rotate(${-12 * i}deg)`;
    default:
      return "";
  }
}

type Ctx = CanvasRenderingContext2D;

function tintCopy(scratch: HTMLCanvasElement, src: CanvasImageSource, w: number, h: number, color: string) {
  scratch.width = w;
  scratch.height = h;
  const c = scratch.getContext("2d");
  if (!c) return null;
  c.clearRect(0, 0, w, h);
  c.drawImage(src, 0, 0, w, h);
  c.globalCompositeOperation = "multiply";
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = "destination-in";
  c.drawImage(src, 0, 0, w, h);
  c.globalCompositeOperation = "source-over";
  return scratch;
}

/**
 * Pós-processamento: recebe o canvas já desenhado (`frame`) e escreve o
 * resultado no ctx de destino.
 */
export function applyPostEffect(
  ctx: Ctx,
  frame: HTMLCanvasElement,
  scratch: HTMLCanvasElement,
  e: EffectRuntime,
  w: number,
  h: number,
) {
  const i = e.intensity;
  const t = e.t * e.speed;
  const alpha = e.opacity;
  if (i <= 0 || alpha <= 0) return;

  switch (e.effectId) {
    case "rgb-split": {
      const off = i * 0.02 * w * (0.6 + 0.4 * Math.sin(t * 8));
      const r = tintCopy(scratch, frame, w, h, "#ff0040");
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = "screen";
      if (r) ctx.drawImage(r, -off, 0);
      const b = tintCopy(scratch, frame, w, h, "#00b0ff");
      if (b) ctx.drawImage(b, off, 0);
      ctx.restore();
      break;
    }
    case "digital-glitch":
    case "signal": {
      const slices = Math.round(4 + i * 14);
      ctx.save();
      ctx.globalAlpha = alpha;
      for (let s = 0; s < slices; s++) {
        const seed = Math.floor(t * 12) * 100 + s;
        if (rand(seed) > 0.55) continue;
        const y = rand(seed + 3) * h;
        const sh = (h / slices) * (0.4 + rand(seed + 5));
        const dx = (rand(seed + 7) - 0.5) * i * 0.16 * w;
        ctx.drawImage(frame, 0, y, w, sh, dx, y, w, sh);
        if (e.effectId === "signal" && rand(seed + 11) > 0.8) {
          ctx.fillStyle = `rgba(255,255,255,${0.15 * i})`;
          ctx.fillRect(0, y, w, sh);
        }
      }
      ctx.restore();
      break;
    }
    case "vhs": {
      ctx.save();
      ctx.globalAlpha = alpha * 0.6 * i;
      ctx.globalCompositeOperation = "screen";
      const r = tintCopy(scratch, frame, w, h, "#ff2d55");
      if (r) ctx.drawImage(r, -i * 6, 0);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = alpha * 0.25 * i;
      ctx.fillStyle = "#000";
      for (let y = (Math.floor(t * 60) % 4); y < h; y += 4) ctx.fillRect(0, y, w, 1);
      ctx.restore();
      break;
    }
    case "scanline": {
      ctx.save();
      ctx.globalAlpha = alpha * 0.5 * i;
      ctx.fillStyle = "#000";
      const gap = Math.max(2, Math.round(6 - i * 3));
      for (let y = 0; y < h; y += gap) ctx.fillRect(0, y, w, 1);
      ctx.restore();
      break;
    }
    case "pixel": {
      const px = Math.max(2, Math.round(i * 60));
      const sw = Math.max(2, Math.round(w / px));
      const sh = Math.max(2, Math.round(h / px));
      scratch.width = sw;
      scratch.height = sh;
      const sc = scratch.getContext("2d");
      if (sc) {
        sc.imageSmoothingEnabled = true;
        sc.drawImage(frame, 0, 0, sw, sh);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = alpha;
        ctx.drawImage(scratch, 0, 0, sw, sh, 0, 0, w, h);
        ctx.restore();
      }
      break;
    }
    case "distortion":
    case "wave":
    case "ripple":
    case "warp": {
      const rows = 60;
      const amp = i * (e.effectId === "warp" ? 0.09 : 0.05) * w;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.clearRect(0, 0, w, h);
      for (let r = 0; r < rows; r++) {
        const y = (r * h) / rows;
        const nh = h / rows + 1;
        const k = r / rows;
        let dx = 0;
        if (e.effectId === "ripple") dx = Math.sin(k * 22 + t * 6) * amp * (1 - Math.abs(k - 0.5) * 2);
        else if (e.effectId === "warp") dx = Math.sin(k * Math.PI) * amp * Math.sin(t * 2);
        else dx = Math.sin(k * 12 + t * 4) * amp;
        ctx.drawImage(frame, 0, y, w, nh, dx, y, w, nh);
      }
      ctx.restore();
      break;
    }
    case "swirl":
    case "fisheye": {
      const rings = 40;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      const maxR = Math.hypot(w, h) / 2;
      for (let r = rings; r >= 0; r--) {
        const rad = (r / rings) * maxR;
        const k = 1 - r / rings;
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, rad, 0, Math.PI * 2);
        ctx.clip();
        if (e.effectId === "swirl") ctx.rotate(k * i * 1.2 * Math.sin(t * 1.5 + 1));
        else ctx.scale(1 + k * i * 0.5, 1 + k * i * 0.5);
        ctx.drawImage(frame, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      ctx.restore();
      break;
    }
    case "radial-blur":
    case "directional-blur": {
      ctx.save();
      ctx.globalAlpha = alpha * 0.35;
      const steps = 5;
      for (let s = 1; s <= steps; s++) {
        if (e.effectId === "radial-blur") {
          const k = 1 + (s / steps) * i * 0.12;
          ctx.drawImage(frame, (w - w * k) / 2, (h - h * k) / 2, w * k, h * k);
        } else {
          const d = (s / steps) * i * 0.05 * w * Math.cos(t);
          ctx.drawImage(frame, d, 0, w, h);
        }
      }
      ctx.restore();
      break;
    }
    case "flash": {
      const k = Math.max(0, 1 - e.p * 2);
      ctx.save();
      ctx.globalAlpha = alpha * i * k;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }
    case "strobe": {
      const on = Math.floor(t * 10) % 2 === 0;
      if (on) {
        ctx.save();
        ctx.globalAlpha = alpha * i * 0.7;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }
      break;
    }
    case "glow":
    case "bloom": {
      ctx.save();
      ctx.globalAlpha = alpha * i * 0.55;
      ctx.globalCompositeOperation = "screen";
      (ctx as any).filter = `blur(${8 + i * 22}px) brightness(1.2)`;
      ctx.drawImage(frame, 0, 0, w, h);
      (ctx as any).filter = "none";
      ctx.restore();
      break;
    }
    case "lens-flare": {
      const cx = w * (0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.6)));
      const cy = h * 0.32;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = alpha * i;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
      g.addColorStop(0, "rgba(255,255,235,0.9)");
      g.addColorStop(0.25, "rgba(255,210,120,0.35)");
      g.addColorStop(1, "rgba(255,180,80,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let s = 1; s <= 4; s++) {
        const fx = w - cx * (1 + s * 0.12);
        const fy = h - cy * (1 + s * 0.12);
        const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, w * 0.08 * s * 0.6);
        fg.addColorStop(0, `rgba(140,255,200,${0.18 / s})`);
        fg.addColorStop(1, "rgba(140,255,200,0)");
        ctx.fillStyle = fg;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
      break;
    }
    case "light-leak": {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = alpha * i * 0.8;
      const p = 0.5 + 0.5 * Math.sin(t * 0.8);
      const g = ctx.createLinearGradient(w * p, 0, w, h);
      g.addColorStop(0, "rgba(255,120,60,0.75)");
      g.addColorStop(0.5, "rgba(255,60,140,0.35)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      break;
    }
    case "rain":
    case "snow":
    case "dust":
    case "particles":
    case "sparks":
    case "stars":
    case "smoke": {
      drawAtmosphere(ctx, e.effectId, i, alpha, t, w, h);
      break;
    }
    default:
      break;
  }
}

export function drawAtmosphere(
  ctx: Ctx,
  kind: string,
  intensity: number,
  alpha: number,
  t: number,
  w: number,
  h: number,
) {
  const count = Math.round(20 + intensity * 220);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = kind === "smoke" ? "screen" : "source-over";
  for (let n = 0; n < count; n++) {
    const sx = rand(n * 1.7) * w;
    const seedY = rand(n * 3.1);
    switch (kind) {
      case "rain": {
        const y = ((seedY + t * 0.9) % 1) * h;
        const len = h * 0.05 * (0.6 + rand(n) * 0.8);
        ctx.strokeStyle = `rgba(220,240,255,${0.25 + rand(n + 2) * 0.35})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(sx, y);
        ctx.lineTo(sx + w * 0.01, y + len);
        ctx.stroke();
        break;
      }
      case "snow": {
        const y = ((seedY + t * 0.12) % 1) * h;
        const x = sx + Math.sin(t + n) * w * 0.02;
        ctx.fillStyle = `rgba(255,255,255,${0.4 + rand(n + 4) * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, 1 + rand(n + 6) * 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "dust":
      case "particles": {
        const y = ((seedY - t * 0.05 + 1) % 1) * h;
        const x = sx + Math.sin(t * 0.6 + n) * w * 0.015;
        ctx.fillStyle = kind === "dust" ? `rgba(255,240,210,${0.2 + rand(n) * 0.4})` : `rgba(140,255,180,${0.3 + rand(n) * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + rand(n + 9) * 2.2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "sparks": {
        const life = (t * 0.8 + rand(n * 5)) % 1;
        const y = h * (1 - life) * (0.4 + rand(n) * 0.8);
        ctx.fillStyle = `rgba(255,${140 + Math.round(rand(n) * 90)},60,${1 - life})`;
        ctx.beginPath();
        ctx.arc(sx + Math.sin(t * 4 + n) * 6, y, 1 + rand(n + 1) * 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "stars": {
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 2 + n));
        ctx.fillStyle = `rgba(255,255,255,${tw * 0.9})`;
        ctx.beginPath();
        ctx.arc(sx, seedY * h, 0.6 + rand(n + 2) * 1.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "smoke": {
        if (n % 6) break;
        const y = ((seedY - t * 0.04 + 1) % 1) * h;
        const r = w * (0.08 + rand(n) * 0.16);
        const g = ctx.createRadialGradient(sx, y, 0, sx, y, r);
        g.addColorStop(0, `rgba(200,210,220,${0.08 + rand(n) * 0.08})`);
        g.addColorStop(1, "rgba(200,210,220,0)");
        ctx.fillStyle = g;
        ctx.fillRect(sx - r, y - r, r * 2, r * 2);
        break;
      }
      default:
        break;
    }
  }
  ctx.restore();
}
