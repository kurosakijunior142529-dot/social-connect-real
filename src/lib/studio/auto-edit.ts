import { BEAT_EFFECTS, FILTERS, TRANSITIONS } from "./catalog";
import { clipDuration, layout, splitMedia } from "./timeline";
import type { AiEditPlan } from "./ai.functions";
import type { EffectInstance, MediaClip, StudioProject } from "./types";
import { uid } from "./types";

const isMedia = (c: any): c is MediaClip => c.kind === "media";

/** aplica um efeito de batida em todos os marcadores dentro dos clipes */
export function applyBeatEffect(project: StudioProject, beatEffectId: string): StudioProject {
  const def = BEAT_EFFECTS.find((b) => b.id === beatEffectId);
  if (!def || !project.beats.length) return project;
  let next = project;

  if (def.kind === "cut") {
    for (const beat of project.beats) {
      const placed = layout(next).find((p) => beat > p.start + 0.35 && beat < p.end - 0.35);
      if (placed) next = splitMedia(next, placed.clip.id, beat - placed.start);
    }
    return next;
  }

  if (def.kind === "transition") {
    const placed = layout(next);
    const ids = new Set(
      placed
        .filter((p) => p.index > 0 && project.beats.some((b) => Math.abs(b - p.start) < 0.25))
        .map((p) => p.clip.id),
    );
    return {
      ...next,
      clips: next.clips.map((c) =>
        isMedia(c) && ids.has(c.id)
          ? { ...c, transitionIn: { id: def.transitionId ?? "flash", dur: def.dur || 0.3 } }
          : c,
      ),
      updatedAt: Date.now(),
    };
  }

  const placed = layout(next);
  const byClip = new Map<string, EffectInstance[]>();
  for (const beat of project.beats) {
    const p = placed.find((x) => beat >= x.start && beat < x.end);
    if (!p) continue;
    const local = beat - p.start;
    const list = byClip.get(p.clip.id) ?? [];
    if (def.kind === "zoom") {
      list.push({
        id: uid(),
        effectId: "zoom-pulse",
        intensity: 70,
        speed: 260,
        opacity: 100,
        from: Number(local.toFixed(2)),
        to: Number((local + def.dur).toFixed(2)),
      });
    } else {
      list.push({
        id: uid(),
        effectId: def.effectId!,
        intensity: 75,
        speed: 140,
        opacity: 100,
        from: Number(local.toFixed(2)),
        to: Number((local + def.dur).toFixed(2)),
      });
    }
    byClip.set(p.clip.id, list);
  }

  return {
    ...next,
    clips: next.clips.map((c) =>
      isMedia(c) && byClip.has(c.id) ? { ...c, effects: [...c.effects, ...byClip.get(c.id)!] } : c,
    ),
    updatedAt: Date.now(),
  };
}

export type AutoEditStyle = "dinamico" | "cinematografico" | "agressivo" | "suave";

const STYLE_MAP: Record<AutoEditStyle, { filter: string; transition: string; beat: string; speed: number }> = {
  dinamico: { filter: "vib-pop", transition: "zoom", beat: "beat-zoom", speed: 1.15 },
  cinematografico: { filter: "cine-teal", transition: "fade", beat: "beat-flash", speed: 1 },
  agressivo: { filter: "neon-lime", transition: "glitch", beat: "beat-shake", speed: 1.35 },
  suave: { filter: "portrait-soft", transition: "fade", beat: "beat-flash", speed: 0.95 },
};

/** Auto Edit: monta cortes, zoom, transições e efeitos em cima das batidas. */
export function autoEdit(project: StudioProject, style: AutoEditStyle): StudioProject {
  const conf = STYLE_MAP[style];
  let next: StudioProject = {
    ...project,
    clips: project.clips.map((c) =>
      isMedia(c)
        ? {
            ...c,
            filterId: conf.filter,
            filterAmount: 85,
            speed: conf.speed,
            transitionIn: { id: conf.transition, dur: 0.35 },
            effects: c.effects.filter((e) => e.from === null),
          }
        : c,
    ),
    updatedAt: Date.now(),
  };
  const media = next.clips.filter(isMedia);
  if (media[0]) {
    next = {
      ...next,
      clips: next.clips.map((c) => (c.id === media[0]!.id ? { ...(c as MediaClip), transitionIn: null } : c)),
    };
  }
  // movimento suave em cada clipe (keyframes de escala)
  next = {
    ...next,
    clips: next.clips.map((c) => {
      if (!isMedia(c)) return c;
      const d = clipDuration(c);
      return {
        ...c,
        keyframes: {
          ...c.keyframes,
          scale: [
            { t: 0, v: 100 },
            { t: d, v: style === "cinematografico" ? 112 : 122 },
          ],
        },
      };
    }),
  };
  if (project.beats.length) next = applyBeatEffect(next, conf.beat);
  return next;
}

/** transforma o plano da IA numa timeline concreta */
export function applyAiPlan(project: StudioProject, plan: AiEditPlan): StudioProject {
  const validFilter = (id?: string) => (FILTERS.some((f) => f.id === id) ? id! : plan.filterId);
  const validTransition = (id?: string) => (TRANSITIONS.some((t) => t.id === id) ? id! : "fade");
  let index = -1;
  let next: StudioProject = {
    ...project,
    clips: project.clips.map((c) => {
      if (!isMedia(c)) return c;
      index++;
      const step = plan.steps?.find((s) => s.clip === index);
      const effects: EffectInstance[] = (step?.effects ?? [])
        .slice(0, 3)
        .map((e) => ({
          id: uid(),
          effectId: e.effectId,
          intensity: Math.min(100, Math.max(10, e.intensity || 60)),
          speed: 100,
          opacity: 100,
          from: null,
          to: null,
        }));
      return {
        ...c,
        filterId: validFilter(step?.filterId ?? plan.filterId),
        filterAmount: 90,
        speed: Math.min(4, Math.max(0.25, step?.speed ?? 1)),
        transitionIn: index === 0 ? null : { id: validTransition(step?.transitionId), dur: 0.32 },
        effects,
      };
    }),
    updatedAt: Date.now(),
  };
  if (plan.cutOnBeats && project.beats.length) next = applyBeatEffect(next, "beat-cut");
  if (plan.beatEffect && BEAT_EFFECTS.some((b) => b.id === plan.beatEffect)) {
    next = applyBeatEffect(next, plan.beatEffect);
  }
  return next;
}
