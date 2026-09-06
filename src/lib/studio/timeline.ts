import type {
  AnimProp,
  Clip,
  Keyframe,
  MediaClip,
  SpeedPoint,
  StudioProject,
} from "./types";
import { ANIM_PROPS, uid } from "./types";

export const isMedia = (c: Clip): c is MediaClip => c.kind === "media";

/** duração da fonte usada pelo clipe (antes da velocidade) */
export function sourceSpan(c: MediaClip) {
  return Math.max(0.05, c.trimEnd - c.trimStart);
}

/**
 * Velocidade média considerando o speed ramp. O ramp guarda pontos
 * (t normalizado 0..1 dentro do clipe, velocidade) e interpolamos linearmente
 * — a duração de saída é a integral de 1/v.
 */
export function rampSamples(c: MediaClip): SpeedPoint[] {
  if (!c.ramp.length) return [{ t: 0, v: c.speed }, { t: 1, v: c.speed }];
  const pts = [...c.ramp].sort((a, b) => a.t - b.t);
  if (pts[0]!.t > 0) pts.unshift({ t: 0, v: pts[0]!.v });
  if (pts[pts.length - 1]!.t < 1) pts.push({ t: 1, v: pts[pts.length - 1]!.v });
  return pts;
}

function speedAtNorm(pts: SpeedPoint[], t: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      // curva suave (smoothstep) entre pontos
      const s = k * k * (3 - 2 * k);
      return Math.max(0.1, a.v + (b.v - a.v) * s);
    }
  }
  return Math.max(0.1, pts[pts.length - 1]!.v);
}

const RAMP_STEPS = 120;

/** duração do clipe na timeline (saída) */
export function clipDuration(c: MediaClip): number {
  const span = sourceSpan(c);
  if (!c.ramp.length) return span / Math.max(0.1, c.speed);
  const pts = rampSamples(c);
  let out = 0;
  for (let i = 0; i < RAMP_STEPS; i++) {
    const t = (i + 0.5) / RAMP_STEPS;
    out += (span / RAMP_STEPS) / speedAtNorm(pts, t);
  }
  return out;
}

/** converte tempo de saída (0..clipDuration) em tempo da fonte */
export function sourceTimeAt(c: MediaClip, outT: number): number {
  const span = sourceSpan(c);
  if (!c.ramp.length) return c.trimStart + Math.min(span, outT * Math.max(0.1, c.speed));
  const pts = rampSamples(c);
  let out = 0;
  const step = span / RAMP_STEPS;
  for (let i = 0; i < RAMP_STEPS; i++) {
    const t = (i + 0.5) / RAMP_STEPS;
    const dOut = step / speedAtNorm(pts, t);
    if (out + dOut >= outT) {
      const frac = dOut === 0 ? 0 : (outT - out) / dOut;
      return c.trimStart + step * (i + frac);
    }
    out += dOut;
  }
  return c.trimEnd;
}

export type Placed = { clip: MediaClip; start: number; end: number; index: number };

/** posiciona os clipes de mídia em sequência */
export function layout(project: StudioProject): Placed[] {
  const out: Placed[] = [];
  let t = 0;
  let i = 0;
  for (const c of project.clips) {
    if (!isMedia(c)) continue;
    const d = clipDuration(c);
    out.push({ clip: c, start: t, end: t + d, index: i });
    t += d;
    i++;
  }
  return out;
}

export function projectDuration(project: StudioProject): number {
  const placed = layout(project);
  const media = placed.length ? placed[placed.length - 1]!.end : 0;
  let max = media;
  for (const c of project.clips) {
    if (c.kind === "media") continue;
    max = Math.max(max, (c as any).to ?? 0);
  }
  return Math.max(0.1, max);
}

export function placedAt(placed: Placed[], t: number): Placed | null {
  for (const p of placed) if (t >= p.start && t < p.end) return p;
  return placed.length ? placed[placed.length - 1]! : null;
}

// ---------- keyframes ----------

export function defaultOf(prop: AnimProp) {
  return ANIM_PROPS.find((p) => p.id === prop)?.def ?? 0;
}

export function valueAt(kfs: Keyframe[] | undefined, prop: AnimProp, t: number): number {
  if (!kfs || kfs.length === 0) return defaultOf(prop);
  const pts = [...kfs].sort((a, b) => a.t - b.t);
  if (t <= pts[0]!.t) return pts[0]!.v;
  const last = pts[pts.length - 1]!;
  if (t >= last.t) return last.v;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      const s = k * k * (3 - 2 * k);
      return a.v + (b.v - a.v) * s;
    }
  }
  return last.v;
}

export function upsertKeyframe(kfs: Keyframe[] | undefined, t: number, v: number): Keyframe[] {
  const list = [...(kfs ?? [])];
  const i = list.findIndex((k) => Math.abs(k.t - t) < 0.04);
  if (i >= 0) list[i] = { t, v };
  else list.push({ t, v });
  return list.sort((a, b) => a.t - b.t);
}

// ---------- operações de timeline ----------

export function cloneClip<T extends Clip>(c: T): T {
  return JSON.parse(JSON.stringify({ ...c, id: uid() })) as T;
}

export function splitMedia(project: StudioProject, clipId: string, localT: number): StudioProject {
  const idx = project.clips.findIndex((c) => c.id === clipId);
  if (idx < 0) return project;
  const c = project.clips[idx]!;
  if (!isMedia(c)) return project;
  const cut = sourceTimeAt(c, localT);
  if (cut <= c.trimStart + 0.1 || cut >= c.trimEnd - 0.1) return project;
  const a: MediaClip = { ...cloneClip(c), trimEnd: cut };
  const b: MediaClip = { ...cloneClip(c), trimStart: cut, transitionIn: null };
  const clips = [...project.clips];
  clips.splice(idx, 1, a, b);
  return { ...project, clips, updatedAt: Date.now() };
}

export function removeClip(project: StudioProject, clipId: string): StudioProject {
  return { ...project, clips: project.clips.filter((c) => c.id !== clipId), updatedAt: Date.now() };
}

export function duplicateClip(project: StudioProject, clipId: string): StudioProject {
  const idx = project.clips.findIndex((c) => c.id === clipId);
  if (idx < 0) return project;
  const copy = cloneClip(project.clips[idx]!);
  const clips = [...project.clips];
  clips.splice(idx + 1, 0, copy);
  return { ...project, clips, updatedAt: Date.now() };
}

export function moveClip(project: StudioProject, clipId: string, dir: -1 | 1): StudioProject {
  const media = project.clips.filter(isMedia);
  const i = media.findIndex((c) => c.id === clipId);
  if (i < 0) return project;
  const j = i + dir;
  if (j < 0 || j >= media.length) return project;
  const order = media.map((c) => c.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  const byId = new Map(media.map((c) => [c.id, c] as const));
  const reordered = order.map((id) => byId.get(id)!);
  let k = 0;
  const clips = project.clips.map((c) => (isMedia(c) ? reordered[k++]! : c));
  return { ...project, clips, updatedAt: Date.now() };
}

export function updateClip(project: StudioProject, clipId: string, patch: Partial<Clip>): StudioProject {
  return {
    ...project,
    clips: project.clips.map((c) => (c.id === clipId ? ({ ...c, ...patch } as Clip) : c)),
    updatedAt: Date.now(),
  };
}

export function fmtTime(s: number) {
  const total = Math.max(0, s);
  const m = Math.floor(total / 60);
  const sec = Math.floor(total % 60);
  const cs = Math.floor((total % 1) * 10);
  return `${m}:${String(sec).padStart(2, "0")}.${cs}`;
}
