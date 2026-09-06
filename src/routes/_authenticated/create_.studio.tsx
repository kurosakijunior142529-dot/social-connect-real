import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  Loader2,
  Pause,
  Play,
  Redo2,
  Save,
  Send,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StudioPreview, type PreviewHandle } from "@/components/studio/studio-preview";
import { StudioTimeline } from "@/components/studio/studio-timeline";
import { StudioPanel, type ToolId } from "@/components/studio/panels";
import { useStudioMedia } from "@/components/studio/use-studio-media";
import { Chip, Row } from "@/components/studio/ui";
import { emptyProject, type StudioProject } from "@/lib/studio/types";
import { fmtTime, projectDuration } from "@/lib/studio/timeline";
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

const TOOLS: { id: ToolId; label: string }[] = [
  { id: "media", label: "Clipes" },
  { id: "speed", label: "Velocidade" },
  { id: "filters", label: "Filtros" },
  { id: "adjust", label: "Ajustes" },
  { id: "effects", label: "Efeitos" },
  { id: "beauty", label: "Aparência + IA" },
  { id: "mask", label: "Máscara" },
  { id: "motion", label: "Movimento" },
  { id: "text", label: "Texto" },
  { id: "sticker", label: "Stickers" },
  { id: "overlay", label: "Overlays" },
  { id: "transition", label: "Transições" },
  { id: "music", label: "Música" },
  { id: "audio", label: "Áudio" },
  { id: "auto", label: "Auto / IA" },
  { id: "format", label: "Formato" },
  { id: "presets", label: "Presets" },
  { id: "projects", label: "Projetos" },
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
      <header className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <Button size="icon" variant="ghost" onClick={() => navigate({ to: "/create" })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={project.name}
          onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
          className="h-8 max-w-[9rem] border-none bg-transparent px-1 text-sm font-semibold"
        />
        <div className="ml-auto flex items-center gap-1">
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
          <Button size="sm" disabled={exporting} onClick={() => void runExport()}>
            {exporting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {exporting ? `${Math.round(progress * 100)}%` : "Exportar"}
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
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
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex items-center justify-center gap-3">
          <button
            type="button"
            className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-background/70 backdrop-blur"
            onClick={() => {
              if (!playing) previewRef.current?.play();
              setPlaying((v) => !v);
            }}
          >
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <span className="pointer-events-none rounded-full bg-background/70 px-3 py-1 text-[11px] tabular-nums backdrop-blur">
            {fmtTime(time)} / {fmtTime(duration)}
          </span>
        </div>
      </div>

      <StudioTimeline project={project} time={time} selectedId={selectedId} onSelect={setSelectedId} onSeek={seek} />

      <Row className="border-t border-border/50 px-3 py-2">
        {TOOLS.map((t) => (
          <Chip key={t.id} active={tool === t.id} onClick={() => setTool(t.id)}>
            {t.label}
          </Chip>
        ))}
      </Row>

      <div className="max-h-[42vh] overflow-y-auto border-t border-border/50 px-3 py-3">
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
