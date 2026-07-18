import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera as CameraIcon,
  Circle,
  RotateCcw,
  Sparkles,
  Square,
  SwitchCamera,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { VIDEO_FILTERS, filterById } from "@/lib/video-filters";

export const Route = createFileRoute("/_authenticated/create/video")({
  ssr: false,
  component: VideoStudio,
});

const MAX_RECORD_MS = 60_000;

type Stage = "camera" | "review" | "publishing";

function pickVideoMime(): string {
  const cands = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return cands.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}

function VideoStudio() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();

  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const stopTimeout = useRef<number | null>(null);

  const [stage, setStage] = useState<Stage>("camera");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [filterId, setFilterId] = useState("none");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const busy = stage === "publishing" || exporting;

  const filter = filterById(filterId);

  const isEmbeddedPreview = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setCameraError(null);
    stopCamera();
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador não suporta captura de câmera.");
      }
      if (typeof window !== "undefined" && !window.isSecureContext) {
        throw new Error("Câmera requer HTTPS. Abra o app publicado (não o preview http).");
      }
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          facingMode: { ideal: facing },
          frameRate: { ideal: 30 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = s;
      const el = previewRef.current;
      if (el) {
        el.srcObject = s;
        el.muted = true;
        await el.play().catch(() => {});
      }
      setCameraReady(true);
    } catch (err: any) {
      const name = err?.name ?? "";
      let msg = err?.message ?? "Não foi possível acessar a câmera.";
      if (name === "NotAllowedError" || name === "SecurityError") {
        msg = isEmbeddedPreview
          ? "Permissão de câmera bloqueada no preview. Abra o app publicado (botão Publicar) e conceda acesso à câmera."
          : "Você bloqueou o acesso à câmera. Toque no cadeado do navegador e libere Câmera + Microfone para este site.";
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        msg = "Nenhuma câmera encontrada. Verifique se há uma câmera conectada ou tente enviar do dispositivo.";
      } else if (name === "NotReadableError") {
        msg = "Outra aplicação está usando a câmera. Feche outros apps e tente novamente.";
      }
      setCameraError(msg);
      toast.error(msg);
    } finally {
      setStarting(false);
    }
  }, [facing, stopCamera, isEmbeddedPreview, starting]);

  // Restart when the user flips cameras (only if already active)
  useEffect(() => {
    if (stage === "camera" && cameraReady) void startCamera();
    return () => {
      if (stage !== "camera") stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (stopTimeout.current) window.clearTimeout(stopTimeout.current);
    };
  }, [blobUrl]);

  // recording timer
  useEffect(() => {
    if (!recording) return;
    const iv = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 100);
    return () => window.clearInterval(iv);
  }, [recording]);

  function toggleRecord() {
    if (!streamRef.current) return;
    if (recording) {
      recorderRef.current?.state !== "inactive" && recorderRef.current?.stop();
      return;
    }
    const mime = pickVideoMime();
    const rec = mime
      ? new MediaRecorder(streamRef.current, { mimeType: mime, videoBitsPerSecond: 4_500_000 })
      : new MediaRecorder(streamRef.current);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
    rec.onstop = () => {
      const b = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      const url = URL.createObjectURL(b);
      setBlob(b);
      setBlobUrl(url);
      setRecording(false);
      setStage("review");
      if (stopTimeout.current) window.clearTimeout(stopTimeout.current);
    };
    startedAt.current = Date.now();
    setElapsed(0);
    recorderRef.current = rec;
    rec.start(250);
    setRecording(true);
    stopTimeout.current = window.setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
    }, MAX_RECORD_MS);
  }

  async function pickFromLibrary(f: File) {
    if (!f.type.startsWith("video/")) return toast.error("Selecione um vídeo");
    if (f.size > 60 * 1024 * 1024) return toast.error("Vídeo maior que 60MB");
    const url = URL.createObjectURL(f);
    setBlob(f);
    setBlobUrl(url);
    setStage("review");
  }

  function resetAll() {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlob(null);
    setBlobUrl(null);
    setDuration(0);
    setTrim([0, 0]);
    setCaption("");
    setFilterId("none");
    setProgress(0);
    setStage("camera");
  }

  async function exportAndPublish() {
    if (!blob || !blobUrl) return;
    setExporting(true);
    setProgress(0);
    try {
      // If no filter and no trim, upload the recorded blob directly.
      const needsReencode =
        filterId !== "none" ||
        (duration > 0 && (trim[0] > 0.05 || trim[1] < duration - 0.05));

      let finalBlob: Blob;
      let ext: string;

      if (!needsReencode) {
        finalBlob = blob;
        ext = (blob.type.includes("mp4") ? "mp4" : "webm");
      } else {
        const out = await renderFiltered(blobUrl, filter.css, trim[0], trim[1] || duration, setProgress);
        finalBlob = out.blob;
        ext = out.ext;
      }

      setStage("publishing");
      const file = new File([finalBlob], `video-${Date.now()}.${ext}`, { type: finalBlob.type });
      const path = await uploadMedia("posts", user.id, file);
      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        media_url: path,
        media_type: "video",
        caption: caption.trim(),
      });
      if (error) throw error;
      toast.success("Vídeo publicado!");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao publicar");
      setStage("review");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black text-white">
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/70 to-transparent">
        <button
          onClick={() => (stage === "camera" ? navigate({ to: "/create" }) : resetAll())}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 backdrop-blur"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold tracking-wide opacity-90">
          {stage === "camera" ? "Estúdio" : stage === "review" ? "Revisar" : "Publicando…"}
        </div>
        <div className="w-10" />
      </div>

      {stage === "camera" ? (
        <CameraStage
          previewRef={previewRef}
          filterCss={filter.css}
          recording={recording}
          elapsed={elapsed}
          onToggleRecord={toggleRecord}
          onFlip={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          filterId={filterId}
          onFilter={setFilterId}
          onPick={pickFromLibrary}
          cameraReady={cameraReady}
          cameraError={cameraError}
          starting={starting}
          isEmbeddedPreview={isEmbeddedPreview}
          onStart={startCamera}
        />
      ) : (
        <ReviewStage
          src={blobUrl!}
          filter={filter}
          filterId={filterId}
          onFilter={setFilterId}
          trim={trim}
          setTrim={setTrim}
          duration={duration}
          setDuration={setDuration}
          caption={caption}
          setCaption={setCaption}
          onPublish={exportAndPublish}
          onRetake={resetAll}
          exporting={exporting}
          progress={progress}
          busy={busy}
        />
      )}
    </div>
  );
}

/* -------- camera -------- */

function CameraStage(props: {
  previewRef: React.RefObject<HTMLVideoElement | null>;
  filterCss: string;
  recording: boolean;
  elapsed: number;
  onToggleRecord: () => void;
  onFlip: () => void;
  filterId: string;
  onFilter: (id: string) => void;
  onPick: (f: File) => void;
}) {
  const pct = Math.min(1, props.elapsed / MAX_RECORD_MS);
  return (
    <>
      <div className="absolute inset-0">
        <video
          ref={props.previewRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          style={{ filter: props.filterCss, WebkitFilter: props.filterCss as any }}
        />
      </div>

      {props.recording ? (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full bg-red-500/90 px-3 py-1 text-xs font-semibold shadow-lg">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          {(props.elapsed / 1000).toFixed(1)}s
        </div>
      ) : null}

      <div className="absolute bottom-0 inset-x-0 z-10 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/85 via-black/50 to-transparent">
        <FilterStrip value={props.filterId} onChange={props.onFilter} />

        <div className="mt-4 flex items-center justify-between px-8">
          <label className="grid h-12 w-12 place-items-center rounded-full bg-white/10 backdrop-blur cursor-pointer">
            <Upload className="h-5 w-5" />
            <input
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => e.target.files?.[0] && props.onPick(e.target.files[0])}
            />
          </label>

          <button
            type="button"
            onClick={props.onToggleRecord}
            aria-label={props.recording ? "Parar" : "Gravar"}
            className="relative grid h-20 w-20 place-items-center"
          >
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="46" stroke="white" strokeOpacity="0.25" strokeWidth="4" fill="none" />
              <circle
                cx="50" cy="50" r="46" stroke="#ef4444" strokeWidth="4" fill="none"
                strokeDasharray={`${pct * 289} 289`} strokeLinecap="round"
              />
            </svg>
            <span
              className={cn(
                "grid place-items-center rounded-full bg-white text-red-500 shadow-xl transition-all",
                props.recording ? "h-8 w-8 rounded-lg bg-red-500 text-white" : "h-16 w-16",
              )}
            >
              {props.recording ? <Square className="h-4 w-4" /> : <Circle className="h-8 w-8 fill-red-500" />}
            </span>
          </button>

          <button
            type="button"
            onClick={props.onFlip}
            className="grid h-12 w-12 place-items-center rounded-full bg-white/10 backdrop-blur"
            aria-label="Virar câmera"
          >
            <SwitchCamera className="h-5 w-5" />
          </button>
        </div>
      </div>
    </>
  );
}

/* -------- review + trim -------- */

function ReviewStage(props: {
  src: string;
  filter: { css: string; label: string };
  filterId: string;
  onFilter: (id: string) => void;
  trim: [number, number];
  setTrim: (v: [number, number]) => void;
  duration: number;
  setDuration: (v: number) => void;
  caption: string;
  setCaption: (v: string) => void;
  onPublish: () => void;
  onRetake: () => void;
  exporting: boolean;
  progress: number;
  busy: boolean;
}) {
  const vref = useRef<HTMLVideoElement>(null);

  function onLoaded(e: React.SyntheticEvent<HTMLVideoElement>) {
    const d = e.currentTarget.duration || 0;
    if (Number.isFinite(d) && d > 0) {
      props.setDuration(d);
      props.setTrim([0, d]);
    }
  }

  useEffect(() => {
    const v = vref.current;
    if (!v || !props.duration) return;
    const handler = () => {
      if (v.currentTime < props.trim[0]) v.currentTime = props.trim[0];
      if (v.currentTime > props.trim[1]) { v.currentTime = props.trim[0]; v.play().catch(() => {}); }
    };
    v.addEventListener("timeupdate", handler);
    return () => v.removeEventListener("timeupdate", handler);
  }, [props.trim, props.duration]);

  return (
    <div className="absolute inset-0 flex flex-col pt-16 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="relative flex-1 min-h-0 bg-black">
        <video
          ref={vref}
          src={props.src}
          onLoadedMetadata={onLoaded}
          className="h-full w-full object-contain"
          style={{ filter: props.filter.css, WebkitFilter: props.filter.css as any }}
          controls={!props.exporting}
          playsInline
          loop
        />
        {props.exporting ? (
          <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm">
            <div className="text-center">
              <div className="mx-auto h-14 w-14 rounded-full border-4 border-white/20 border-t-white animate-spin" />
              <div className="mt-4 text-sm opacity-80">Aplicando filtro… {Math.round(props.progress * 100)}%</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="p-4 space-y-3 bg-black">
        <FilterStrip value={props.filterId} onChange={props.onFilter} />

        {props.duration > 0 ? (
          <TrimSlider
            duration={props.duration}
            value={props.trim}
            onChange={(v) => {
              props.setTrim(v);
              const v0 = v[0];
              const vd = vref.current;
              if (vd && Math.abs(vd.currentTime - v0) > 0.15) vd.currentTime = v0;
            }}
          />
        ) : null}

        <Textarea
          value={props.caption}
          onChange={(e) => props.setCaption(e.target.value)}
          placeholder="Escreva uma legenda…"
          maxLength={500}
          rows={2}
          className="rounded-2xl resize-none bg-white/5 border-white/10 text-white placeholder:text-white/40"
        />

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={props.onRetake}
            disabled={props.busy}
            className="flex-1 h-12 rounded-full bg-white/5 border-white/15 text-white hover:bg-white/10"
          >
            <RotateCcw className="h-4 w-4 mr-2" /> Refazer
          </Button>
          <Button
            onClick={props.onPublish}
            disabled={props.busy}
            className="flex-[2] h-12 rounded-full bg-gradient-brand font-semibold"
          >
            {props.exporting ? "Renderizando…" : props.busy ? "Publicando…" : "Publicar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterStrip({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar px-3">
      {VIDEO_FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={cn(
            "shrink-0 flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl border transition",
            value === f.id
              ? "bg-white text-black border-white"
              : "bg-white/5 text-white/90 border-white/10 hover:bg-white/10",
          )}
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-[11px] font-medium leading-none">{f.label}</span>
        </button>
      ))}
    </div>
  );
}

function TrimSlider({
  duration,
  value,
  onChange,
}: {
  duration: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);

  function pos(v: number) {
    return `${(v / duration) * 100}%`;
  }

  function onMove(e: PointerEvent) {
    const track = trackRef.current;
    if (!track || !dragging.current) return;
    const rect = track.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration;
    const next: [number, number] = [...value];
    if (dragging.current === "start") next[0] = Math.min(t, value[1] - 0.3);
    else next[1] = Math.max(t, value[0] + 0.3);
    onChange(next);
  }
  function onUp() {
    dragging.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  function grab(which: "start" | "end") {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = which;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  return (
    <div className="select-none">
      <div className="flex justify-between text-[11px] text-white/60 mb-1 tabular-nums px-1">
        <span>{value[0].toFixed(1)}s</span>
        <span>{(value[1] - value[0]).toFixed(1)}s selecionados</span>
        <span>{value[1].toFixed(1)}s</span>
      </div>
      <div ref={trackRef} className="relative h-10 rounded-xl bg-white/8 border border-white/10">
        <div
          className="absolute inset-y-0 bg-primary/25 border-y-2 border-primary rounded-xl"
          style={{ left: pos(value[0]), right: `calc(100% - ${pos(value[1])})` }}
        />
        <button
          type="button"
          onPointerDown={grab("start")}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-3 rounded-md bg-primary shadow"
          style={{ left: pos(value[0]) }}
          aria-label="Início"
        />
        <button
          type="button"
          onPointerDown={grab("end")}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-10 w-3 rounded-md bg-primary shadow"
          style={{ left: pos(value[1]) }}
          aria-label="Fim"
        />
      </div>
    </div>
  );
}

/* -------- filter+trim render via canvas.captureStream -------- */

async function renderFiltered(
  srcUrl: string,
  filterCss: string,
  from: number,
  to: number,
  onProgress: (p: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const src = document.createElement("video");
  src.src = srcUrl;
  src.crossOrigin = "anonymous";
  src.muted = false;
  src.playsInline = true;
  await new Promise<void>((res, rej) => {
    src.onloadedmetadata = () => res();
    src.onerror = () => rej(new Error("Falha ao carregar vídeo"));
  });

  const w = Math.min(1080, src.videoWidth || 720);
  const h = Math.round((src.videoHeight / src.videoWidth) * w) || 1280;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");

  const canvasStream = canvas.captureStream(30);
  // Try to pipe original audio into the output.
  try {
    const ms = (src as any).captureStream?.() as MediaStream | undefined;
    ms?.getAudioTracks().forEach((t) => canvasStream.addTrack(t));
  } catch { /* audio optional */ }

  const mime = pickVideoMime();
  const rec = mime
    ? new MediaRecorder(canvasStream, { mimeType: mime, videoBitsPerSecond: 4_500_000 })
    : new MediaRecorder(canvasStream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

  src.currentTime = Math.max(0, from);
  await new Promise<void>((res) => { src.onseeked = () => res(); });

  const total = Math.max(0.1, to - from);
  let raf: number;
  const draw = () => {
    ctx.save();
    (ctx as any).filter = filterCss || "none";
    ctx.drawImage(src, 0, 0, w, h);
    ctx.restore();
    onProgress(Math.min(1, (src.currentTime - from) / total));
    raf = requestAnimationFrame(draw);
  };

  const done = new Promise<Blob>((res) => {
    rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
  });

  rec.start(200);
  raf = requestAnimationFrame(draw);
  await src.play();

  await new Promise<void>((res) => {
    const check = () => {
      if (src.currentTime >= to || src.ended) return res();
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });

  src.pause();
  cancelAnimationFrame(raf!);
  rec.stop();
  const finalBlob = await done;
  const ext = (finalBlob.type.includes("mp4") ? "mp4" : "webm");
  return { blob: finalBlob, ext };
}
