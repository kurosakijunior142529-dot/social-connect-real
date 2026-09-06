import { useEffect, useMemo, useRef, useState } from "react";
import {
  BEAT_EFFECTS,
  EFFECTS,
  FILTERS,
  FILTER_CATEGORIES,
  FONTS,
  OVERLAYS,
  SPEED_PRESETS,
  STICKER_PACK,
  TEXT_ANIMS,
  TRANSITIONS,
  effectById,
} from "@/lib/studio/catalog";
import {
  ASPECTS,
  ASPECT_PRESETS,
  ANIM_PROPS,
  NEUTRAL_ADJUST,
  NEUTRAL_BEAUTY,
  NEUTRAL_MASK,
  STILL_DURATION,
  newMediaClip,
  uid,
  type AnimProp,
  type AudioClip,
  type MediaClip,
  type OverlayClip,
  type StickerClip,
  type StudioPreset,
  type StudioProject,
  type TextClip,
} from "@/lib/studio/types";
import {
  clipDuration,
  duplicateClip,
  fmtTime,
  isMedia,
  layout,
  moveClip,
  placedAt,
  projectDuration,
  removeClip,
  splitMedia,
  updateClip,
  upsertKeyframe,
} from "@/lib/studio/timeline";
import { decodeAudio, detectBeats, waveform } from "@/lib/studio/audio";
import {
  deleteProject,
  deletePreset,
  listPresets,
  listProjects,
  saveProject,
  savePreset,
} from "@/lib/studio/drafts";
import { MUSIC_VIBES, renderVibe } from "@/lib/music-catalog";
import { applyBeatEffect, autoEdit, applyAiPlan, type AutoEditStyle } from "@/lib/studio/auto-edit";
import { studioAiEditPlan, studioAiImage, type AiToolId } from "@/lib/studio/ai.functions";
import { suggestCaptions } from "@/lib/ai.functions";
import type { MediaMeta } from "./use-studio-media";
import { Chip, Empty, PanelTitle, Row, SliderRow } from "./ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Copy,
  Loader2,
  Mic,
  Music,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";

export type ToolId =
  | "media"
  | "speed"
  | "filters"
  | "adjust"
  | "effects"
  | "beauty"
  | "mask"
  | "motion"
  | "text"
  | "sticker"
  | "overlay"
  | "transition"
  | "music"
  | "audio"
  | "auto"
  | "format"
  | "presets"
  | "projects";

export type PanelProps = {
  tool: ToolId;
  project: StudioProject;
  update: (fn: (p: StudioProject) => StudioProject) => void;
  replace: (p: StudioProject) => void;
  selectedId: string | null;
  select: (id: string | null) => void;
  time: number;
  seek: (t: number) => void;
  importFile: (blob: Blob, kind: "video" | "image" | "audio", name: string) => Promise<MediaMeta>;
  audioBlobs: Map<string, Blob>;
  aiAvailable: boolean;
  frameDataUrl: () => string | null;
  openProject: (p: StudioProject) => void;
};

const sel = <T,>(project: StudioProject, id: string | null, kind: string): T | null =>
  (project.clips.find((c) => c.id === id && c.kind === kind) as T | undefined) ?? null;

function selectedMedia(project: StudioProject, id: string | null, time: number): MediaClip | null {
  const direct = project.clips.find((c) => c.id === id && c.kind === "media") as MediaClip | undefined;
  if (direct) return direct;
  return placedAt(layout(project), time)?.clip ?? null;
}

export function StudioPanel(props: PanelProps) {
  switch (props.tool) {
    case "media":
      return <MediaPanel {...props} />;
    case "speed":
      return <SpeedPanel {...props} />;
    case "filters":
      return <FiltersPanel {...props} />;
    case "adjust":
      return <AdjustPanel {...props} />;
    case "effects":
      return <EffectsPanel {...props} />;
    case "beauty":
      return <BeautyPanel {...props} />;
    case "mask":
      return <MaskPanel {...props} />;
    case "motion":
      return <MotionPanel {...props} />;
    case "text":
      return <TextPanel {...props} />;
    case "sticker":
      return <StickerPanel {...props} />;
    case "overlay":
      return <OverlayPanel {...props} />;
    case "transition":
      return <TransitionPanel {...props} />;
    case "music":
      return <MusicPanel {...props} />;
    case "audio":
      return <AudioPanel {...props} />;
    case "auto":
      return <AutoPanel {...props} />;
    case "format":
      return <FormatPanel {...props} />;
    case "presets":
      return <PresetsPanel {...props} />;
    case "projects":
      return <ProjectsPanel {...props} />;
    default:
      return null;
  }
}

/* ------------------------------ mídia / clipes ----------------------------- */

function MediaPanel({ project, update, selectedId, select, time, importFile }: PanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const placed = layout(project);
  const current = selectedMedia(project, selectedId, time);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const kind = file.type.startsWith("video") ? "video" : "image";
        const meta = await importFile(file, kind, file.name);
        update((p) => ({
          ...p,
          clips: [...p.clips, newMediaClip(meta.id, kind, meta.duration || STILL_DURATION)],
        }));
      }
    } catch {
      toast.error("Não foi possível abrir esse arquivo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
            Adicionar
          </Button>
        }
      >
        Clipes
      </PanelTitle>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => void add(e.target.files)}
      />

      {!placed.length && <Empty>Adicione fotos ou vídeos para começar.</Empty>}

      <Row>
        {placed.map((p, i) => (
          <button
            key={p.clip.id}
            type="button"
            onClick={() => select(p.clip.id)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left text-[11px] ${
              current?.id === p.clip.id ? "border-primary bg-primary/10" : "border-border/60 bg-muted/30"
            }`}
          >
            <div className="font-semibold">Clipe {i + 1}</div>
            <div className="text-muted-foreground">
              {p.clip.mediaKind === "video" ? "Vídeo" : "Foto"} · {fmtTime(clipDuration(p.clip))}
            </div>
          </button>
        ))}
      </Row>

      {current && (
        <div className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => update((p) => splitMedia(p, current.id, time - (placedAt(layout(p), time)?.start ?? 0)))}>
              <Scissors className="mr-1 h-3.5 w-3.5" /> Dividir
            </Button>
            <Button size="sm" variant="secondary" onClick={() => update((p) => duplicateClip(p, current.id))}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Duplicar
            </Button>
            <Button size="sm" variant="secondary" onClick={() => update((p) => moveClip(p, current.id, -1))}>
              ←
            </Button>
            <Button size="sm" variant="secondary" onClick={() => update((p) => moveClip(p, current.id, 1))}>
              →
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                update((p) => removeClip(p, current.id));
                select(null);
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
            </Button>
          </div>

          {current.mediaKind === "video" ? (
            <>
              <SliderRow
                label="Início do corte"
                min={0}
                max={Math.max(0.2, current.trimEnd - 0.2)}
                step={0.05}
                value={current.trimStart}
                suffix="s"
                onChange={(v) => update((p) => updateClip(p, current.id, { trimStart: v } as Partial<MediaClip>))}
              />
              <SliderRow
                label="Fim do corte"
                min={current.trimStart + 0.2}
                max={Math.max(current.trimEnd, current.trimStart + 0.4)}
                step={0.05}
                value={current.trimEnd}
                suffix="s"
                onChange={(v) => update((p) => updateClip(p, current.id, { trimEnd: v } as Partial<MediaClip>))}
              />
            </>
          ) : (
            <SliderRow
              label="Duração"
              min={0.5}
              max={20}
              step={0.1}
              value={current.trimEnd}
              suffix="s"
              onChange={(v) => update((p) => updateClip(p, current.id, { trimEnd: v } as Partial<MediaClip>))}
            />
          )}

          <SliderRow
            label="Volume do clipe"
            min={0}
            max={200}
            value={current.volume}
            suffix="%"
            onChange={(v) => update((p) => updateClip(p, current.id, { volume: v, muted: v === 0 } as Partial<MediaClip>))}
          />
        </div>
      )}
    </div>
  );
}

/* --------------------------------- speed ---------------------------------- */

function SpeedPanel({ project, update, selectedId, time }: PanelProps) {
  const clip = selectedMedia(project, selectedId, time);
  if (!clip) return <Empty>Selecione um clipe.</Empty>;
  const placedStart = layout(project).find((p) => p.clip.id === clip.id)?.start ?? 0;
  const local = Math.max(0, time - placedStart);

  return (
    <div className="space-y-3">
      <PanelTitle>Velocidade</PanelTitle>
      <Row>
        {SPEED_PRESETS.map((s) => (
          <Chip key={s} active={clip.speed === s && !clip.ramp.length} onClick={() => update((p) => updateClip(p, clip.id, { speed: s, ramp: [] } as Partial<MediaClip>))}>
            {s}x
          </Chip>
        ))}
      </Row>
      <SliderRow
        label="Velocidade exata"
        min={0.25}
        max={4}
        step={0.05}
        value={clip.speed}
        suffix="x"
        onChange={(v) => update((p) => updateClip(p, clip.id, { speed: v } as Partial<MediaClip>))}
      />

      <PanelTitle
        action={
          <Button size="sm" variant="secondary" onClick={() => update((p) => updateClip(p, clip.id, { ramp: [] } as Partial<MediaClip>))}>
            Limpar
          </Button>
        }
      >
        Speed ramp
      </PanelTitle>
      <Row>
        {[
          { id: "in", label: "Acelerar", pts: [{ t: 0, v: 0.5 }, { t: 1, v: 2.5 }] },
          { id: "out", label: "Desacelerar", pts: [{ t: 0, v: 2.5 }, { t: 1, v: 0.5 }] },
          { id: "bullet", label: "Bullet time", pts: [{ t: 0, v: 2 }, { t: 0.5, v: 0.3 }, { t: 1, v: 2 }] },
          { id: "jump", label: "Jump cut", pts: [{ t: 0, v: 1 }, { t: 0.45, v: 3.5 }, { t: 0.6, v: 1 }] },
          { id: "flow", label: "Flow", pts: [{ t: 0, v: 1 }, { t: 0.3, v: 0.6 }, { t: 0.7, v: 1.8 }, { t: 1, v: 1 }] },
        ].map((preset) => (
          <Chip key={preset.id} onClick={() => update((p) => updateClip(p, clip.id, { ramp: preset.pts } as Partial<MediaClip>))}>
            {preset.label}
          </Chip>
        ))}
      </Row>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          update((p) => {
            const dur = Math.max(0.2, clipDuration(clip));
            const t = Math.min(0.99, local / dur);
            const ramp = [...clip.ramp.filter((r) => Math.abs(r.t - t) > 0.02), { t, v: clip.speed }].sort((a, b) => a.t - b.t);
            return updateClip(p, clip.id, { ramp } as Partial<MediaClip>);
          })
        }
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Ponto de velocidade aqui
      </Button>
      {!!clip.ramp.length && (
        <div className="flex flex-wrap gap-2">
          {clip.ramp.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => update((p) => updateClip(p, clip.id, { ramp: clip.ramp.filter((_, j) => j !== i) } as Partial<MediaClip>))}
              className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px]"
            >
              {(r.t * 100).toFixed(0)}% · {r.v.toFixed(2)}x ✕
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- filtros --------------------------------- */

function FiltersPanel({ project, update, selectedId, time }: PanelProps) {
  const clip = selectedMedia(project, selectedId, time);
  const [cat, setCat] = useState<string>(FILTER_CATEGORIES[0]);
  if (!clip) return <Empty>Selecione um clipe.</Empty>;
  const list = FILTERS.filter((f) => f.category === cat || f.id === "none");

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              update((p) => ({
                ...p,
                clips: p.clips.map((c) => (isMedia(c) ? { ...c, filterId: clip.filterId, filterAmount: clip.filterAmount } : c)),
              }))
            }
          >
            Aplicar em todos
          </Button>
        }
      >
        Filtros
      </PanelTitle>
      <Row>
        {FILTER_CATEGORIES.map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {c}
          </Chip>
        ))}
      </Row>
      <div className="grid grid-cols-4 gap-2">
        {list.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => update((p) => updateClip(p, clip.id, { filterId: f.id } as Partial<MediaClip>))}
            className={`rounded-lg border px-2 py-3 text-[10px] leading-tight ${
              clip.filterId === f.id ? "border-primary bg-primary/10 text-foreground" : "border-border/50 bg-muted/30 text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <SliderRow
        label="Intensidade"
        min={0}
        max={100}
        value={clip.filterAmount}
        suffix="%"
        onChange={(v) => update((p) => updateClip(p, clip.id, { filterAmount: v } as Partial<MediaClip>))}
      />
    </div>
  );
}

/* -------------------------------- ajustes --------------------------------- */

const ADJUSTS: { key: keyof typeof NEUTRAL_ADJUST; label: string }[] = [
  { key: "brightness", label: "Brilho" },
  { key: "contrast", label: "Contraste" },
  { key: "exposure", label: "Exposição" },
  { key: "saturation", label: "Saturação" },
  { key: "temperature", label: "Temperatura" },
  { key: "hue", label: "Matiz" },
  { key: "highlights", label: "Realces" },
  { key: "shadows", label: "Sombras" },
  { key: "sharpen", label: "Nitidez" },
  { key: "clarity", label: "Clareza" },
  { key: "fade", label: "Fade" },
  { key: "vignette", label: "Vinheta" },
  { key: "grain", label: "Granulação" },
];

function AdjustPanel({ project, update, selectedId, time }: PanelProps) {
  const clip = selectedMedia(project, selectedId, time);
  if (!clip) return <Empty>Selecione um clipe.</Empty>;
  const set = (patch: Partial<MediaClip["adjust"]>) =>
    update((p) => updateClip(p, clip.id, { adjust: { ...clip.adjust, ...patch } } as Partial<MediaClip>));

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button size="sm" variant="secondary" onClick={() => update((p) => updateClip(p, clip.id, { adjust: { ...NEUTRAL_ADJUST, curve: [0, 0, 0] } } as Partial<MediaClip>))}>
            Redefinir
          </Button>
        }
      >
        Ajustes
      </PanelTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {ADJUSTS.map((a) => (
          <SliderRow
            key={a.key}
            label={a.label}
            value={clip.adjust[a.key] as number}
            min={a.key === "sharpen" || a.key === "grain" || a.key === "vignette" || a.key === "fade" || a.key === "clarity" ? 0 : -100}
            onChange={(v) => set({ [a.key]: v } as any)}
            onReset={() => set({ [a.key]: 0 } as any)}
          />
        ))}
      </div>
      <PanelTitle>Curva de cor</PanelTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["Sombras", "Médios", "Luzes"] as const).map((label, i) => (
          <SliderRow
            key={label}
            label={label}
            value={clip.adjust.curve[i] ?? 0}
            onChange={(v) => {
              const curve = [...clip.adjust.curve] as [number, number, number];
              curve[i] = v;
              set({ curve });
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- efeitos --------------------------------- */

function EffectsPanel({ project, update, selectedId, time }: PanelProps) {
  const clip = selectedMedia(project, selectedId, time);
  const [cat, setCat] = useState("Glitch");
  const [rangeOnly, setRangeOnly] = useState(false);
  if (!clip) return <Empty>Selecione um clipe.</Empty>;
  const start = layout(project).find((p) => p.clip.id === clip.id)?.start ?? 0;
  const local = Math.max(0, time - start);

  const add = (effectId: string) =>
    update((p) =>
      updateClip(p, clip.id, {
        effects: [
          ...clip.effects,
          {
            id: uid(),
            effectId,
            intensity: 60,
            speed: 100,
            opacity: 100,
            from: rangeOnly ? Number(local.toFixed(2)) : null,
            to: rangeOnly ? Number((local + 0.8).toFixed(2)) : null,
          },
        ],
      } as Partial<MediaClip>),
    );

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Chip active={rangeOnly} onClick={() => setRangeOnly((v) => !v)}>
            {rangeOnly ? "Só neste trecho" : "Clipe inteiro"}
          </Chip>
        }
      >
        Efeitos
      </PanelTitle>
      <Row>
        {Array.from(new Set(EFFECTS.map((e) => e.category))).map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {c}
          </Chip>
        ))}
      </Row>
      <div className="grid grid-cols-3 gap-2">
        {EFFECTS.filter((e) => e.category === cat).map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => add(e.id)}
            className="rounded-lg border border-border/50 bg-muted/30 px-2 py-3 text-[11px]"
          >
            {e.label}
          </button>
        ))}
      </div>

      {!!clip.effects.length && (
        <div className="space-y-3">
          <PanelTitle>Aplicados</PanelTitle>
          {clip.effects.map((inst) => {
            const def = effectById(inst.effectId);
            const patch = (up: Partial<typeof inst>) =>
              update((p) =>
                updateClip(p, clip.id, {
                  effects: clip.effects.map((x) => (x.id === inst.id ? { ...x, ...up } : x)),
                } as Partial<MediaClip>),
              );
            return (
              <div key={inst.id} className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span>
                    {def?.label ?? inst.effectId}
                    {inst.from !== null && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {inst.from.toFixed(1)}s–{(inst.to ?? 0).toFixed(1)}s
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      update((p) => updateClip(p, clip.id, { effects: clip.effects.filter((x) => x.id !== inst.id) } as Partial<MediaClip>))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                <SliderRow label="Intensidade" min={0} max={100} value={inst.intensity} onChange={(v) => patch({ intensity: v })} />
                {def?.params.includes("speed") && (
                  <SliderRow label="Velocidade" min={10} max={200} value={inst.speed} onChange={(v) => patch({ speed: v })} />
                )}
                {def?.params.includes("opacity") && (
                  <SliderRow label="Opacidade" min={0} max={100} value={inst.opacity} onChange={(v) => patch({ opacity: v })} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------- beleza + IA de imagem ------------------------- */

const AI_TOOLS: { id: AiToolId; label: string; needsText?: string }[] = [
  { id: "remove-bg", label: "Remover fundo" },
  { id: "replace-bg", label: "Trocar fundo", needsText: "Descreva o novo fundo" },
  { id: "remove-object", label: "Remover objeto", needsText: "O que remover?" },
  { id: "enhance", label: "Melhorar qualidade" },
  { id: "blur-bg", label: "Desfocar fundo" },
  { id: "cinematic", label: "Look cinema" },
  { id: "anime", label: "Anime" },
  { id: "artistic", label: "Pintura" },
  { id: "colorize", label: "Colorir" },
  { id: "retouch", label: "Retoque de pele" },
  { id: "relight", label: "Reiluminar" },
];

function BeautyPanel({ project, update, selectedId, time, aiAvailable, frameDataUrl, importFile }: PanelProps) {
  const clip = selectedMedia(project, selectedId, time);
  const [busy, setBusy] = useState<string | null>(null);
  const [extra, setExtra] = useState("");
  const [tool, setTool] = useState<AiToolId | null>(null);
  if (!clip) return <Empty>Selecione um clipe.</Empty>;

  const set = (patch: Partial<MediaClip["beauty"]>) =>
    update((p) => updateClip(p, clip.id, { beauty: { ...clip.beauty, ...patch } } as Partial<MediaClip>));

  const run = async (id: AiToolId) => {
    const def = AI_TOOLS.find((t) => t.id === id)!;
    if (def.needsText && !extra.trim()) {
      setTool(id);
      toast.info(def.needsText);
      return;
    }
    if (clip.mediaKind !== "image") {
      toast.error("As ferramentas de IA funcionam em fotos. Para vídeo, use os filtros e efeitos.");
      return;
    }
    const image = frameDataUrl();
    if (!image) return;
    setBusy(id);
    try {
      const res = await studioAiImage({ data: { tool: id, image, extra: extra.trim() || undefined } });
      const blob = await (await fetch(res.image)).blob();
      const meta = await importFile(blob, "image", "ia.png");
      update((p) => updateClip(p, clip.id, { aiMediaId: meta.id } as Partial<MediaClip>));
      toast.success("Pronto!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "A IA falhou");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button size="sm" variant="secondary" onClick={() => update((p) => updateClip(p, clip.id, { beauty: { ...NEUTRAL_BEAUTY } } as Partial<MediaClip>))}>
            Redefinir
          </Button>
        }
      >
        Aparência
      </PanelTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <SliderRow label="Pele suave" min={0} max={100} value={clip.beauty.smooth} onChange={(v) => set({ smooth: v })} />
        <SliderRow label="Luz no rosto" min={0} max={100} value={clip.beauty.faceLight} onChange={(v) => set({ faceLight: v })} />
        <SliderRow label="Glow" min={0} max={100} value={clip.beauty.glow} onChange={(v) => set({ glow: v })} />
        <SliderRow label="Tom quente" value={clip.beauty.warmth} onChange={(v) => set({ warmth: v })} />
        <SliderRow label="Afinar" min={0} max={100} value={clip.beauty.slim} onChange={(v) => set({ slim: v })} />
        <SliderRow label="Olhos" min={0} max={100} value={clip.beauty.eyes} onChange={(v) => set({ eyes: v })} />
      </div>

      <PanelTitle>Ferramentas de IA</PanelTitle>
      {!aiAvailable ? (
        <Empty>As ferramentas de IA não estão disponíveis neste ambiente.</Empty>
      ) : (
        <>
          {clip.mediaKind !== "image" && (
            <p className="text-[11px] text-muted-foreground">Disponível para fotos. Em vídeos, use filtros, ajustes e efeitos.</p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {AI_TOOLS.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant="secondary"
                disabled={!!busy || clip.mediaKind !== "image"}
                onClick={() => void run(t.id)}
              >
                {busy === t.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                {t.label}
              </Button>
            ))}
          </div>
          {tool && AI_TOOLS.find((t) => t.id === tool)?.needsText && (
            <Input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder={AI_TOOLS.find((t) => t.id === tool)?.needsText}
            />
          )}
          {clip.aiMediaId && (
            <Button size="sm" variant="ghost" onClick={() => update((p) => updateClip(p, clip.id, { aiMediaId: null } as Partial<MediaClip>))}>
              Voltar ao original
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------- máscaras -------------------------------- */

function MaskPanel({ project, update, selectedId, time }: PanelProps) {
  const clip = selectedMedia(project, selectedId, time);
  if (!clip) return <Empty>Selecione um clipe.</Empty>;
  const set = (patch: Partial<MediaClip["mask"]>) =>
    update((p) => updateClip(p, clip.id, { mask: { ...clip.mask, ...patch } } as Partial<MediaClip>));

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button size="sm" variant="secondary" onClick={() => update((p) => updateClip(p, clip.id, { mask: { ...NEUTRAL_MASK, points: [] } } as Partial<MediaClip>))}>
            Redefinir
          </Button>
        }
      >
        Máscara
      </PanelTitle>
      <Row>
        {(["none", "circle", "rect", "gradient"] as const).map((s) => (
          <Chip key={s} active={clip.mask.shape === s} onClick={() => set({ shape: s })}>
            {s === "none" ? "Nenhuma" : s === "circle" ? "Círculo" : s === "rect" ? "Retângulo" : "Gradiente"}
          </Chip>
        ))}
        <Chip active={clip.mask.invert} onClick={() => set({ invert: !clip.mask.invert })}>
          Inverter
        </Chip>
      </Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <SliderRow label="Posição X" min={0} max={100} value={clip.mask.x} onChange={(v) => set({ x: v })} />
        <SliderRow label="Posição Y" min={0} max={100} value={clip.mask.y} onChange={(v) => set({ y: v })} />
        <SliderRow label="Tamanho" min={5} max={100} value={clip.mask.size} onChange={(v) => set({ size: v })} />
        <SliderRow label="Suavidade" min={0} max={100} value={clip.mask.feather} onChange={(v) => set({ feather: v })} />
      </div>
    </div>
  );
}

/* ------------------------------- movimento -------------------------------- */

function MotionPanel({ project, update, selectedId, time }: PanelProps) {
  const clip = selectedMedia(project, selectedId, time);
  const [prop, setProp] = useState<AnimProp>("scale");
  if (!clip) return <Empty>Selecione um clipe.</Empty>;
  const start = layout(project).find((p) => p.clip.id === clip.id)?.start ?? 0;
  const local = Math.max(0, Number((time - start).toFixed(2)));
  const def = ANIM_PROPS.find((a) => a.id === prop)!;
  const kfs = clip.keyframes?.[prop] ?? [];
  const currentValue = kfs.find((k) => Math.abs(k.t - local) < 0.05)?.v ?? def.def;

  return (
    <div className="space-y-3">
      <PanelTitle>Movimento e keyframes</PanelTitle>
      <Row>
        {ANIM_PROPS.map((a) => (
          <Chip key={a.id} active={prop === a.id} onClick={() => setProp(a.id)}>
            {a.label}
          </Chip>
        ))}
      </Row>
      <SliderRow
        label={`${def.label} em ${local.toFixed(2)}s`}
        min={def.min}
        max={def.max}
        value={currentValue}
        suffix={def.unit}
        onChange={(v) =>
          update((p) =>
            updateClip(p, clip.id, {
              keyframes: { ...clip.keyframes, [prop]: upsertKeyframe(kfs, local, v) },
            } as Partial<MediaClip>),
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        {kfs.map((k, i) => (
          <button
            key={i}
            type="button"
            onClick={() =>
              update((p) =>
                updateClip(p, clip.id, {
                  keyframes: { ...clip.keyframes, [prop]: kfs.filter((_, j) => j !== i) },
                } as Partial<MediaClip>),
              )
            }
            className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px]"
          >
            {k.t.toFixed(2)}s · {Math.round(k.v)} ✕
          </button>
        ))}
        {!kfs.length && <Empty>Mova o cursor e ajuste o valor para criar keyframes.</Empty>}
      </div>
      <Row>
        {[
          { label: "Zoom in", pts: [{ t: 0, v: 100 }, { t: clipDuration(clip), v: 130 }] },
          { label: "Zoom out", pts: [{ t: 0, v: 130 }, { t: clipDuration(clip), v: 100 }] },
        ].map((p2) => (
          <Chip
            key={p2.label}
            onClick={() => update((p) => updateClip(p, clip.id, { keyframes: { ...clip.keyframes, scale: p2.pts } } as Partial<MediaClip>))}
          >
            {p2.label}
          </Chip>
        ))}
      </Row>
    </div>
  );
}

/* ---------------------------------- texto --------------------------------- */

function TextPanel({ project, update, selectedId, select, time }: PanelProps) {
  const clip = sel<TextClip>(project, selectedId, "text");
  const texts = project.clips.filter((c): c is TextClip => c.kind === "text");
  const total = Math.max(projectDuration(project), 1);

  const add = () => {
    const id = uid();
    const t: TextClip = {
      id,
      kind: "text",
      text: "Seu texto",
      from: Number(time.toFixed(2)),
      to: Number(Math.min(total, time + 3).toFixed(2)),
      font: "grotesk",
      size: 7,
      color: "#ffffff",
      stroke: "#000000",
      strokeWidth: 0,
      shadow: 30,
      bg: null,
      align: "center",
      rotation: 0,
      opacity: 100,
      letterSpacing: 0,
      anim: "fade",
      x: 50,
      y: 50,
    };
    update((p) => ({ ...p, clips: [...p.clips, t] }));
    select(id);
  };

  const patch = (up: Partial<TextClip>) => clip && update((p) => updateClip(p, clip.id, up));

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button size="sm" variant="secondary" onClick={add}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Texto
          </Button>
        }
      >
        Textos
      </PanelTitle>
      <Row>
        {texts.map((t) => (
          <Chip key={t.id} active={clip?.id === t.id} onClick={() => select(t.id)}>
            {t.text.slice(0, 14) || "Texto"}
          </Chip>
        ))}
      </Row>
      {!clip ? (
        <Empty>Adicione ou selecione um texto.</Empty>
      ) : (
        <div className="space-y-3">
          <Textarea value={clip.text} onChange={(e) => patch({ text: e.target.value })} rows={2} />
          <Row>
            {FONTS.map((f) => (
              <Chip key={f.id} active={clip.font === f.id} onClick={() => patch({ font: f.id })}>
                <span style={{ fontFamily: f.css }}>{f.label}</span>
              </Chip>
            ))}
          </Row>
          <Row>
            {TEXT_ANIMS.map((a) => (
              <Chip key={a.id} active={clip.anim === a.id} onClick={() => patch({ anim: a.id as TextClip["anim"] })}>
                {a.label}
              </Chip>
            ))}
          </Row>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Cor
              <input type="color" value={clip.color} onChange={(e) => patch({ color: e.target.value })} className="h-7 w-9 rounded bg-transparent" />
            </label>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Contorno
              <input type="color" value={clip.stroke} onChange={(e) => patch({ stroke: e.target.value })} className="h-7 w-9 rounded bg-transparent" />
            </label>
            <Chip active={!!clip.bg} onClick={() => patch({ bg: clip.bg ? null : "#00000099" })}>
              Fundo
            </Chip>
            <Chip onClick={() => patch({ align: clip.align === "center" ? "left" : clip.align === "left" ? "right" : "center" })}>
              {clip.align === "center" ? "Centro" : clip.align === "left" ? "Esquerda" : "Direita"}
            </Chip>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SliderRow label="Tamanho" min={2} max={22} value={clip.size} onChange={(v) => patch({ size: v })} />
            <SliderRow label="Contorno" min={0} max={20} value={clip.strokeWidth} onChange={(v) => patch({ strokeWidth: v })} />
            <SliderRow label="Sombra" min={0} max={100} value={clip.shadow} onChange={(v) => patch({ shadow: v })} />
            <SliderRow label="Espaçamento" min={-10} max={40} value={clip.letterSpacing} onChange={(v) => patch({ letterSpacing: v })} />
            <SliderRow label="Rotação" min={-180} max={180} value={clip.rotation} onChange={(v) => patch({ rotation: v })} />
            <SliderRow label="Opacidade" min={0} max={100} value={clip.opacity} onChange={(v) => patch({ opacity: v })} />
            <SliderRow label="Posição X" min={0} max={100} value={clip.x} onChange={(v) => patch({ x: v })} />
            <SliderRow label="Posição Y" min={0} max={100} value={clip.y} onChange={(v) => patch({ y: v })} />
            <SliderRow label="Entra em" min={0} max={total} step={0.05} suffix="s" value={clip.from} onChange={(v) => patch({ from: v, to: Math.max(v + 0.3, clip.to) })} />
            <SliderRow label="Sai em" min={0.3} max={total} step={0.05} suffix="s" value={clip.to} onChange={(v) => patch({ to: Math.max(clip.from + 0.3, v) })} />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              update((p) => removeClip(p, clip.id));
              select(null);
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir texto
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- stickers -------------------------------- */

function StickerPanel({ project, update, selectedId, select, time, importFile }: PanelProps) {
  const clip = sel<StickerClip>(project, selectedId, "sticker");
  const total = Math.max(projectDuration(project), 1);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (content: string) => {
    const id = uid();
    const s: StickerClip = {
      id,
      kind: "sticker",
      content,
      from: Number(time.toFixed(2)),
      to: Number(Math.min(total, time + 3).toFixed(2)),
      x: 50,
      y: 45,
      size: 16,
      rotation: 0,
      opacity: 100,
      anim: "pop",
    };
    update((p) => ({ ...p, clips: [...p.clips, s] }));
    select(id);
  };

  const patch = (up: Partial<StickerClip>) => clip && update((p) => updateClip(p, clip.id, up));

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            Enviar imagem
          </Button>
        }
      >
        Stickers
      </PanelTitle>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => add(String(reader.result));
          reader.readAsDataURL(f);
          void importFile;
        }}
      />
      <div className="grid grid-cols-8 gap-2 text-xl">
        {STICKER_PACK.map((s) => (
          <button key={s} type="button" onClick={() => add(s)} className="rounded-lg bg-muted/30 py-1">
            {s}
          </button>
        ))}
      </div>
      {clip && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SliderRow label="Tamanho" min={4} max={60} value={clip.size} onChange={(v) => patch({ size: v })} />
          <SliderRow label="Rotação" min={-180} max={180} value={clip.rotation} onChange={(v) => patch({ rotation: v })} />
          <SliderRow label="Posição X" min={0} max={100} value={clip.x} onChange={(v) => patch({ x: v })} />
          <SliderRow label="Posição Y" min={0} max={100} value={clip.y} onChange={(v) => patch({ y: v })} />
          <SliderRow label="Opacidade" min={0} max={100} value={clip.opacity} onChange={(v) => patch({ opacity: v })} />
          <SliderRow label="Entra em" min={0} max={total} step={0.05} suffix="s" value={clip.from} onChange={(v) => patch({ from: v, to: Math.max(v + 0.3, clip.to) })} />
          <SliderRow label="Sai em" min={0.3} max={total} step={0.05} suffix="s" value={clip.to} onChange={(v) => patch({ to: Math.max(clip.from + 0.3, v) })} />
          <div className="sm:col-span-2">
            <Row>
              {TEXT_ANIMS.map((a) => (
                <Chip key={a.id} active={clip.anim === a.id} onClick={() => patch({ anim: a.id as StickerClip["anim"] })}>
                  {a.label}
                </Chip>
              ))}
            </Row>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              update((p) => removeClip(p, clip.id));
              select(null);
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir sticker
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- overlays -------------------------------- */

function OverlayPanel({ project, update, selectedId, select, time }: PanelProps) {
  const clip = sel<OverlayClip>(project, selectedId, "overlay");
  const total = Math.max(projectDuration(project), 1);

  const add = (id: string, blend: GlobalCompositeOperation) => {
    const cid = uid();
    const o: OverlayClip = {
      id: cid,
      kind: "overlay",
      overlayId: id,
      from: 0,
      to: total,
      opacity: 60,
      blend,
      scale: 100,
      x: 50,
      y: 50,
    };
    update((p) => ({ ...p, clips: [...p.clips, o] }));
    select(cid);
  };
  const patch = (up: Partial<OverlayClip>) => clip && update((p) => updateClip(p, clip.id, up));

  return (
    <div className="space-y-3">
      <PanelTitle>Overlays</PanelTitle>
      <div className="grid grid-cols-3 gap-2">
        {OVERLAYS.map((o) => (
          <button key={o.id} type="button" onClick={() => add(o.id, o.blend)} className="rounded-lg border border-border/50 bg-muted/30 py-3 text-[11px]">
            {o.label}
          </button>
        ))}
      </div>
      {clip && (
        <div className="grid gap-3 sm:grid-cols-2">
          <SliderRow label="Opacidade" min={0} max={100} value={clip.opacity} onChange={(v) => patch({ opacity: v })} />
          <SliderRow label="Escala" min={50} max={200} value={clip.scale} onChange={(v) => patch({ scale: v })} />
          <SliderRow label="Entra em" min={0} max={total} step={0.05} suffix="s" value={clip.from} onChange={(v) => patch({ from: v })} />
          <SliderRow label="Sai em" min={0.3} max={total} step={0.05} suffix="s" value={clip.to} onChange={(v) => patch({ to: v })} />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              update((p) => removeClip(p, clip.id));
              select(null);
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover overlay
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- transições ------------------------------- */

function TransitionPanel({ project, update, selectedId, time }: PanelProps) {
  const clip = selectedMedia(project, selectedId, time);
  if (!clip) return <Empty>Selecione um clipe.</Empty>;
  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              update((p) => ({
                ...p,
                clips: p.clips.map((c, i) => (isMedia(c) && i > 0 ? { ...c, transitionIn: clip.transitionIn } : c)),
              }))
            }
          >
            Em todas
          </Button>
        }
      >
        Transição de entrada
      </PanelTitle>
      <div className="grid grid-cols-4 gap-2">
        {TRANSITIONS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              update((p) =>
                updateClip(p, clip.id, {
                  transitionIn: t.id === "cut" ? null : { id: t.id, dur: clip.transitionIn?.dur ?? 0.4 },
                } as Partial<MediaClip>),
              )
            }
            className={`rounded-lg border px-2 py-3 text-[11px] ${
              (clip.transitionIn?.id ?? "cut") === t.id ? "border-primary bg-primary/10" : "border-border/50 bg-muted/30"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {clip.transitionIn && (
        <SliderRow
          label="Duração"
          min={0.1}
          max={1.5}
          step={0.05}
          suffix="s"
          value={clip.transitionIn.dur}
          onChange={(v) => update((p) => updateClip(p, clip.id, { transitionIn: { id: clip.transitionIn!.id, dur: v } } as Partial<MediaClip>))}
        />
      )}
    </div>
  );
}

/* --------------------------------- música --------------------------------- */

function MusicPanel({ project, update, importFile, audioBlobs }: PanelProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const total = Math.max(projectDuration(project), 4);

  const addAudio = async (blob: Blob, name: string, role: AudioClip["role"]) => {
    const meta = await importFile(blob, "audio", name);
    const clip: AudioClip = {
      id: uid(),
      kind: "audio",
      role,
      mediaId: meta.id,
      name,
      from: 0,
      to: Math.min(total, meta.duration || total),
      offset: 0,
      volume: role === "music" ? 70 : 100,
      fadeIn: 0.3,
      fadeOut: 0.6,
      muted: false,
    };
    update((p) => ({ ...p, clips: [...p.clips, clip] }));
    return meta.id;
  };

  const analyse = async (mediaId: string) => {
    const blob = audioBlobs.get(mediaId);
    if (!blob) return;
    try {
      const buffer = await decodeAudio(blob);
      const { beats, bpm } = detectBeats(buffer);
      update((p) => ({ ...p, beats, bpm }));
      toast.success(bpm ? `${beats.length} batidas · ${bpm} BPM` : `${beats.length} batidas detectadas`);
    } catch {
      toast.error("Não deu para analisar as batidas");
    }
  };

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <Music className="mr-1 h-3.5 w-3.5" /> Meu áudio
          </Button>
        }
      >
        Música
      </PanelTitle>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy("file");
          const id = await addAudio(f, f.name, "music");
          await analyse(id);
          setBusy(null);
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        {MUSIC_VIBES.map((v) => (
          <Button
            key={v.id}
            size="sm"
            variant="secondary"
            disabled={!!busy}
            onClick={async () => {
              setBusy(v.id);
              try {
                const url = await renderVibe(v, Math.min(60, Math.max(16, total)));
                const blob = await (await fetch(url)).blob();
                const id = await addAudio(blob, v.name, "music");
                await analyse(id);
              } catch {
                toast.error("Não deu para criar a trilha");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === v.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <span className="mr-1">{v.emoji}</span>}
            {v.name}
          </Button>
        ))}
      </div>

      <VoiceRecorder onDone={(blob) => void addAudio(blob, "Narração", "voice")} />

      <SliderRow
        label="Volume do áudio original"
        min={0}
        max={100}
        suffix="%"
        value={project.originalVolume}
        onChange={(v) => update((p) => ({ ...p, originalVolume: v }))}
      />

      <PanelTitle>Sincronizar com a batida</PanelTitle>
      {!project.beats.length ? (
        <Empty>Adicione uma música para detectar as batidas.</Empty>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {project.beats.length} batidas{project.bpm ? ` · ${project.bpm} BPM` : ""}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {BEAT_EFFECTS.map((b) => (
              <Button key={b.id} size="sm" variant="secondary" onClick={() => update((p) => applyBeatEffect(p, b.id))}>
                {b.label}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function VoiceRecorder({ onDone }: { onDone: (blob: Blob) => void }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onDone(new Blob(chunks.current, { type: mr.mimeType || "audio/webm" }));
      };
      mr.start();
      setRec(mr);
    } catch {
      toast.error("Não foi possível usar o microfone");
    }
  };

  return (
    <Button
      size="sm"
      variant={rec ? "destructive" : "secondary"}
      onClick={() => {
        if (rec) {
          rec.stop();
          setRec(null);
        } else void start();
      }}
    >
      <Mic className="mr-1 h-3.5 w-3.5" /> {rec ? "Parar narração" : "Gravar narração"}
    </Button>
  );
}

/* ---------------------------------- áudio --------------------------------- */

function AudioPanel({ project, update, audioBlobs }: PanelProps) {
  const clips = project.clips.filter((c): c is AudioClip => c.kind === "audio");
  const total = Math.max(projectDuration(project), 1);
  if (!clips.length) return <Empty>Nenhuma faixa de áudio ainda.</Empty>;

  return (
    <div className="space-y-4">
      <PanelTitle>Faixas de áudio</PanelTitle>
      {clips.map((c) => (
        <div key={c.id} className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
          <div className="flex items-center justify-between text-xs font-medium">
            <span>
              {c.name} <span className="text-[10px] text-muted-foreground">({c.role === "music" ? "música" : c.role === "voice" ? "narração" : "efeito"})</span>
            </span>
            <button type="button" onClick={() => update((p) => removeClip(p, c.id))}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <Waveform blob={audioBlobs.get(c.mediaId)} beats={c.role === "music" ? project.beats : []} duration={total} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SliderRow label="Volume" min={0} max={150} suffix="%" value={c.volume} onChange={(v) => update((p) => updateClip(p, c.id, { volume: v, muted: v === 0 }))} />
            <SliderRow label="Começa em" min={0} max={total} step={0.05} suffix="s" value={c.from} onChange={(v) => update((p) => updateClip(p, c.id, { from: v, to: Math.max(v + 0.5, c.to) }))} />
            <SliderRow label="Termina em" min={0.5} max={total} step={0.05} suffix="s" value={c.to} onChange={(v) => update((p) => updateClip(p, c.id, { to: Math.max(c.from + 0.5, v) }))} />
            <SliderRow label="Recorte da fonte" min={0} max={120} step={0.05} suffix="s" value={c.offset} onChange={(v) => update((p) => updateClip(p, c.id, { offset: v }))} />
            <SliderRow label="Fade in" min={0} max={5} step={0.1} suffix="s" value={c.fadeIn} onChange={(v) => update((p) => updateClip(p, c.id, { fadeIn: v }))} />
            <SliderRow label="Fade out" min={0} max={5} step={0.1} suffix="s" value={c.fadeOut} onChange={(v) => update((p) => updateClip(p, c.id, { fadeOut: v }))} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Waveform({ blob, beats, duration }: { blob?: Blob; beats: number[]; duration: number }) {
  const [peaks, setPeaks] = useState<number[]>([]);
  useEffect(() => {
    let alive = true;
    if (!blob) return;
    void decodeAudio(blob)
      .then((buf) => alive && setPeaks(waveform(buf, 160)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [blob]);
  if (!peaks.length) return <div className="h-10 rounded bg-muted/30" />;
  return (
    <div className="relative flex h-10 items-end gap-[1px] overflow-hidden rounded bg-muted/30 px-1">
      {peaks.map((p, i) => (
        <div key={i} className="flex-1 rounded-sm bg-primary/70" style={{ height: `${Math.max(6, p * 100)}%` }} />
      ))}
      {beats.map((b, i) => (
        <span key={i} className="absolute top-0 h-full w-px bg-primary" style={{ left: `${(b / Math.max(duration, 0.1)) * 100}%` }} />
      ))}
    </div>
  );
}

/* ------------------------------ auto / AI edit ----------------------------- */

const STYLES: { id: AutoEditStyle; label: string; desc: string }[] = [
  { id: "dinamico", label: "Dinâmico", desc: "cortes rápidos e zoom na batida" },
  { id: "cinematografico", label: "Cinema", desc: "ritmo lento, cor de filme" },
  { id: "agressivo", label: "Agressivo", desc: "glitch, shake e velocidade" },
  { id: "suave", label: "Suave", desc: "transições leves, tom natural" },
];

function AutoPanel({ project, replace, aiAvailable }: PanelProps) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [scriptWords, setScriptWords] = useState("");
  const [scriptIdeas, setScriptIdeas] = useState<string[]>([]);
  const [scriptBusy, setScriptBusy] = useState(false);

  return (
    <div className="space-y-3">
      <PanelTitle>Auto Edit</PanelTitle>
      <div className="grid grid-cols-2 gap-2">
        {STYLES.map((s) => (
          <Button key={s.id} size="sm" variant="secondary" className="h-auto flex-col items-start py-2" onClick={() => replace(autoEdit(project, s.id))}>
            <span className="text-xs font-semibold">{s.label}</span>
            <span className="text-[10px] text-muted-foreground">{s.desc}</span>
          </Button>
        ))}
      </div>

      <PanelTitle>AI Edit</PanelTitle>
      {!aiAvailable ? (
        <Empty>A IA não está disponível neste ambiente.</Empty>
      ) : (
        <>
          <Textarea
            rows={2}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex: quero um edit de viagem animado, com cortes na batida"
          />
          <Button
            size="sm"
            disabled={busy || prompt.trim().length < 3}
            onClick={async () => {
              setBusy(true);
              try {
                const plan = await studioAiEditPlan({
                  data: {
                    prompt: prompt.trim(),
                    clipCount: project.clips.filter(isMedia).length || 1,
                    duration: Math.max(0.5, projectDuration(project)),
                    bpm: project.bpm,
                    hasMusic: project.clips.some((c) => c.kind === "audio"),
                    filters: FILTERS.map((f) => f.id),
                    effects: EFFECTS.map((e) => e.id),
                    transitions: TRANSITIONS.map((t) => t.id),
                    beatEffects: BEAT_EFFECTS.map((b) => b.id),
                  },
                });
                replace(applyAiPlan(project, plan));
                toast.success(plan.notes || "Edição criada pela IA");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "A IA não conseguiu montar a edição");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
            Montar edição
          </Button>

          <PanelTitle>Roteiro por 3 palavras</PanelTitle>
          <Textarea
            rows={1}
            value={scriptWords}
            onChange={(e) => setScriptWords(e.target.value)}
            placeholder="Ex: praia, amigos, pôr do sol"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={scriptBusy || scriptWords.trim().length < 3}
            onClick={async () => {
              setScriptBusy(true);
              try {
                const r = await suggestCaptions({
                  data: { hint: `roteiro de vídeo curto em 3 cenas sobre: ${scriptWords.trim()}` },
                });
                setScriptIdeas(r.captions);
              } catch {
                toast.error("A IA não conseguiu montar o roteiro agora");
              } finally {
                setScriptBusy(false);
              }
            }}
          >
            {scriptBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}
            Gerar ideias
          </Button>
          {scriptIdeas.length ? (
            <div className="space-y-1.5">
              {scriptIdeas.map((idea, i) => (
                <div key={i} className="rounded-xl bg-[color:var(--surface-2)] px-3 py-2 text-xs text-foreground/85">
                  <span className="mr-1.5 font-semibold text-primary">Cena {i + 1}</span>
                  {idea}
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/* -------------------------------- formato --------------------------------- */

function FormatPanel({ project, update }: PanelProps) {
  return (
    <div className="space-y-3">
      <PanelTitle>Formato</PanelTitle>
      <Row>
        {ASPECTS.map((a) => (
          <Chip key={a.id} active={project.aspect === a.id} onClick={() => update((p) => ({ ...p, aspect: a.id }))}>
            {a.label}
          </Chip>
        ))}
      </Row>
      <PanelTitle>Presets de plataforma</PanelTitle>
      <Row>
        {ASPECT_PRESETS.map((p2) => (
          <Chip key={p2.id} active={project.aspect === p2.aspect} onClick={() => update((p) => ({ ...p, aspect: p2.aspect }))}>
            {p2.label}
          </Chip>
        ))}
      </Row>
    </div>
  );
}

/* --------------------------------- presets -------------------------------- */

function PresetsPanel({ project, update, selectedId, time }: PanelProps) {
  const clip = selectedMedia(project, selectedId, time);
  const [presets, setPresets] = useState<StudioPreset[]>([]);
  const [name, setName] = useState("");
  useEffect(() => setPresets(listPresets()), []);

  return (
    <div className="space-y-3">
      <PanelTitle>Meus presets</PanelTitle>
      {!clip ? (
        <Empty>Selecione um clipe.</Empty>
      ) : (
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do preset" />
          <Button
            size="sm"
            onClick={() => {
              const preset: StudioPreset = {
                id: uid(),
                name: name.trim() || `Preset ${presets.length + 1}`,
                filterId: clip.filterId,
                filterAmount: clip.filterAmount,
                adjust: clip.adjust,
                beauty: clip.beauty,
                effects: clip.effects,
                transitionId: clip.transitionIn?.id ?? null,
                speed: clip.speed,
              };
              savePreset(preset);
              setPresets(listPresets());
              setName("");
              toast.success("Preset salvo");
            }}
          >
            Salvar
          </Button>
        </div>
      )}
      {!presets.length ? (
        <Empty>Salve o visual de um clipe para reutilizar depois.</Empty>
      ) : (
        <div className="space-y-2">
          {presets.map((p2) => (
            <div key={p2.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs">
              <span>{p2.name}</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!clip}
                  onClick={() =>
                    clip &&
                    update((p) =>
                      updateClip(p, clip.id, {
                        filterId: p2.filterId,
                        filterAmount: p2.filterAmount,
                        adjust: p2.adjust,
                        beauty: p2.beauty,
                        effects: p2.effects.map((e) => ({ ...e, id: uid() })),
                        speed: p2.speed,
                        transitionIn: p2.transitionId ? { id: p2.transitionId, dur: 0.4 } : null,
                      } as Partial<MediaClip>),
                    )
                  }
                >
                  Aplicar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    deletePreset(p2.id);
                    setPresets(listPresets());
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------- projetos -------------------------------- */

function ProjectsPanel({ project, openProject }: PanelProps) {
  const [items, setItems] = useState<StudioProject[]>([]);
  useEffect(() => setItems(listProjects()), []);
  const refresh = () => setItems(listProjects());

  return (
    <div className="space-y-3">
      <PanelTitle
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              saveProject(project);
              refresh();
              toast.success("Rascunho salvo");
            }}
          >
            Salvar agora
          </Button>
        }
      >
        Projetos
      </PanelTitle>
      {!items.length ? (
        <Empty>Seus rascunhos aparecem aqui.</Empty>
      ) : (
        items.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs">
            <button type="button" className="text-left" onClick={() => openProject(p)}>
              <div className="font-medium">{p.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {new Date(p.updatedAt).toLocaleDateString("pt-BR")} · {p.clips.filter((c) => c.kind === "media").length} clipes
              </div>
            </button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await deleteProject(p.id);
                refresh();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
