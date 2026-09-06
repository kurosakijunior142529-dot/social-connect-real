import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  Clapperboard,
  Download,
  Film,
  Gauge,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Music,
  Pause,
  Play,
  Redo2,
  Save,
  Send,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Smile,
  Sun,
  Type,
  Undo2,
  Volume2,
  Wand2,
  Crop,
  Bookmark,
  FolderOpen,
  Move3d,
  Contrast,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StudioPreview, type PreviewHandle } from "@/components/studio/studio-preview";
import { StudioTimeline } from "@/components/studio/studio-timeline";
import { StudioCamera } from "@/components/studio/studio-camera";
import { StudioPanel, type ToolId } from "@/components/studio/panels";
import { useStudioMedia } from "@/components/studio/use-studio-media";
import { Chip, Row } from "@/components/studio/ui";
import { emptyProject, newMediaClip, type StudioProject } from "@/lib/studio/types";
import { fmtTime, moveClip, projectDuration, updateClip } from "@/lib/studio/timeline";
import { cn } from "@/lib/utils";
import { exportProject, supportedHeights, type ExportQuality } from "@/lib/studio/export";
import { fontMap } from "@/lib/studio/render";
import { FONTS } from "@/lib/studio/catalog";
import { saveProject } from "@/lib/studio/drafts";
import { studioAiStatus } from "@/lib/studio/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { moderateMedia, moderateText } from "@/lib/moderation.functions";
import { previewDataUrl, sha256Hex } from "@/lib/file-safety";

export const Route = createFileRoute("/_authenticated/create_/studio")({
  component: StudioPage,
  head: () => ({
    meta: [
      { title: "Vibely Studio — editor de fotos e vídeos" },
      {
        name: "description",
        content: "Crie edits completos no Vibely Studio: timeline, filtros, efeitos, música na batida, texto animado e IA.",
      },
      { property: "og:title", content: "Vibely Studio — editor de fotos e vídeos" },
      {
        property: "og:description",
        content: "Timeline multicamada, efeitos reais, beat sync e IA para criar seus edits no Vibely.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const TOOLS: { id: ToolId; label: string; icon: typeof Film }[] = [
  { id: "media", label: "Clipes", icon: Film },
  { id: "speed", label: "Velocidade", icon: Gauge },
  { id: "filters", label: "Filtros", icon: ImageIcon },
  { id: "adjust", label: "Ajustes", icon: SlidersHorizontal },
  { id: "effects", label: "Efeitos", icon: Sparkles },
  { id: "beauty", label: "Aparência", icon: Sun },
  { id: "mask", label: "Máscara", icon: Crop },
  { id: "motion", label: "Movimento", icon: Move3d },
  { id: "text", label: "Texto", icon: Type },
  { id: "sticker", label: "Stickers", icon: Smile },
  { id: "overlay", label: "Overlays", icon: Contrast },
  { id: "transition", label: "Transições", icon: Shapes },
  { id: "music", label: "Música", icon: Music },
  { id: "audio", label: "Áudio", icon: Volume2 },
  { id: "auto", label: "Auto / IA", icon: Wand2 },
  { id: "format", label: "Formato", icon: Clapperboard },
  { id: "presets", label: "Presets", icon: Bookmark },
  { id: "projects", label: "Projetos", icon: FolderOpen },
];

function StudioPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const previewRef = useRef<PreviewHandle>(null);

  const [project, setProject] = useState<StudioProject>(() => emptyProject("Meu edit"));
  const [past, setPast] = useState<StudioProject[]>([]);
  const [future, setFuture] = useState<StudioProject[]>([]);
  const [tool, setTool] = useState<ToolId>("media");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Blob | null>(null);
  const [caption, setCaption] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [quality, setQuality] = useState<ExportQuality>({ height: 1080, fps: 30 });
  const [expanded, setExpanded] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const aiStatus = useServerFn(studioAiStatus);
  const moderate = useServerFn(moderateMedia);
  const moderateCaption = useServerFn(moderateText);
  const { sources, audioBlobs, importFile } = useStudioMedia(project);
  const duration = Math.max(projectDuration(project), 0.1);
  const heights = useMemo(() => supportedHeights(), []);

  useEffect(() => {
    void aiStatus({} as never).then((s) => setAiAvailable(s.available)).catch(() => setAiAvailable(false));
  }, [aiStatus]);

  const update = useCallback((fn: (p: StudioProject) => StudioProject) => {
    setProject((prev) => {
      setPast((h) => [...h.slice(-24), prev]);
      setFuture([]);
      return { ...fn(prev), updatedAt: Date.now() };
    });
  }, []);

  const replace = useCallback((next: StudioProject) => update(() => next), [update]);

  const undo = () => {
    setPast((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1]!;
      setFuture((f) => [project, ...f].slice(0, 25));
      setProject(prev);
      return h.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((h) => [...h, project]);
      setProject(f[0]!);
      return f.slice(1);
    });
  };

  const seek = useCallback((t: number) => {
    setTime(t);
    previewRef.current?.seek(t);
  }, []);

  const frameDataUrl = useCallback(() => {
    const canvas = previewRef.current?.canvas();
    return canvas ? canvas.toDataURL("image/png") : null;
  }, []);

  const runExport = async () => {
    if (!project.clips.some((c) => c.kind === "media")) {
      toast.error("Adicione pelo menos uma foto ou vídeo");
      return;
    }
    setPlaying(false);
    setExporting(true);
    setProgress(0);
    try {
      const blob = await exportProject({
        project,
        quality,
        sources,
        audioBlobs,
        fonts: fontMap(FONTS),
        watermark: { username: (user as any)?.user_metadata?.username ?? null },
        onProgress: setProgress,
      });
      setResult(blob);
      toast.success("Vídeo pronto!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  };

  const publish = async (kind: "post" | "video") => {
    if (!result) return;
    setPublishing(true);
    try {
      const file = new File([result], `vibely-${Date.now()}.mp4`, { type: result.type || "video/mp4" });
      const [dataUrl, sha256] = await Promise.all([previewDataUrl(file), sha256Hex(file)]);
      const verdict = await moderate({
        data: { dataUrl, sha256, mime: file.type, size: file.size, surface: "public", contentType: "post" },
      });
      if (!verdict.allow) throw new Error(verdict.reason || "Conteúdo bloqueado pelas regras da comunidade");
      if (caption.trim()) {
        const t = await moderateCaption({ data: { text: caption.trim(), surface: "public", contentType: "post_caption" } });
        if (!t.allow) throw new Error(t.reason || "Legenda bloqueada pelas regras da comunidade");
      }
      const path = await uploadMedia("posts", user.id, file);
      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        media_url: path,
        media_type: "video",
        post_kind: kind === "video" ? "video" : "post",
        caption: caption.trim(),
      });
      if (error) throw error;
      toast.success("Publicado!");
      navigate({ to: kind === "video" ? "/reels" : "/" });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao publicar");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-1 border-b border-border/50 bg-background/80 px-2 py-2 backdrop-blur-xl">
        <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/create" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={project.name}
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
          className="h-8 min-w-0 flex-1 border-none bg-transparent px-1 text-sm font-semibold"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <Button size="icon" variant="ghost" disabled={!past.length} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={!future.length} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              saveProject(project);
              toast.success("Rascunho salvo");
            }}
          >
            <Save className="h-4 w-4" />
          </Button>
          <Button size="sm" className="rounded-full px-4 font-semibold" disabled={exporting} onClick={() => void runExport()}>
            {exporting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {exporting ? `${Math.round(progress * 100)}%` : "Exportar"}
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden bg-gradient-to-b from-neutral-950 to-black p-2",
          expanded ? "flex-1" : "h-[38dvh] shrink-0 sm:h-[46dvh]",
        )}
      >
        <StudioPreview
          ref={previewRef}
          project={project}
          sources={sources}
          audioBlobs={audioBlobs}
          time={time}
          playing={playing}
          duration={duration}
          onTime={setTime}
          onEnded={() => {
            setPlaying(false);
            seek(0);
          }}
        />

        <button
          type="button"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur"
          onClick={() => setShowCamera(true)}
        >
          <Camera className="h-4 w-4" />
        </button>

        <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex items-center justify-center gap-3">
          <button
            type="button"
            className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition active:scale-95"
            onClick={() => {
              if (!playing) previewRef.current?.play();
              setPlaying((v) => !v);
            }}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] font-medium tabular-nums text-white backdrop-blur">
            {fmtTime(time)} / {fmtTime(duration)}
          </span>
        </div>
      </div>

      {!expanded && (
        <>
          <StudioTimeline
            project={project}
            sources={sources}
            time={time}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSeek={seek}
            onReorder={(id, dir) => update((p) => moveClip(p, id, dir))}
            onTrim={(id, patch) => update((p) => updateClip(p, id, patch as never))}
          />

          <Row className="border-t border-border/50 bg-background/80 px-2 py-2 backdrop-blur">
            {TOOLS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  className={cn(
                    "flex w-[68px] shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition",
                    tool === t.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </Row>

          <div className="max-h-[40dvh] min-h-[6rem] overflow-y-auto rounded-t-3xl border-t border-border/60 bg-card/60 px-3 pb-3 pt-2 backdrop-blur">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />
            <StudioPanel
              tool={tool}
              project={project}
              update={update}
              replace={replace}
              selectedId={selectedId}
              select={setSelectedId}
              time={time}
              seek={seek}
              importFile={importFile}
              audioBlobs={audioBlobs}
              aiAvailable={aiAvailable}
              frameDataUrl={frameDataUrl}
              openProject={(p) => {
                setProject(p);
                setSelectedId(null);
                seek(0);
              }}
            />
          </div>
        </>
      )}

      {showCamera && (
        <StudioCamera
          aspect={project.aspect}
          onClose={() => setShowCamera(false)}
          onCapture={async (takes) => {
            for (const take of takes) {
              const meta = await importFile(take.blob, "video", `camera-${Date.now()}.mp4`);
              update((p) => ({
                ...p,
                clips: [...p.clips, newMediaClip(meta.id, "video", meta.duration || take.duration || 3)],
              }));
            }
            toast.success("Gravação adicionada");
          }}
        />
      )}

      {(exporting || result) && (
        <div className="border-t border-border/50 bg-background px-3 py-3">
          {exporting ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Exportando… {Math.round(progress * 100)}%</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          ) : (
            result && (
              <div className="space-y-2">
                <Row>
                  {heights.map((h) => (
                    <Chip key={h} active={quality.height === h} onClick={() => setQuality((q) => ({ ...q, height: h }))}>
                      {h}p
                    </Chip>
                  ))}
                  {([24, 30, 60] as const).map((f) => (
                    <Chip key={f} active={quality.fps === f} onClick={() => setQuality((q) => ({ ...q, fps: f }))}>
                      {f}fps
                    </Chip>
                  ))}
                </Row>
                <Textarea rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Escreva uma legenda…" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={publishing} onClick={() => void publish("video")}>
                    <Send className="mr-1 h-3.5 w-3.5" /> Publicar no Reels
                  </Button>
                  <Button size="sm" variant="secondary" disabled={publishing} onClick={() => void publish("post")}>
                    Publicar no feed
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const url = URL.createObjectURL(result);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${project.name || "vibely"}.mp4`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 4000);
                    }}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" /> Baixar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
                    Continuar editando
                  </Button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
