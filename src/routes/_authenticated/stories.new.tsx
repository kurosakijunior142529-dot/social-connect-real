import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, ImagePlus, Loader2, RefreshCw, Send, Sparkles, Sticker, Type, X, Zap, ZapOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { moderateMedia, moderateText } from "@/lib/moderation.functions";
import { checkFile, previewDataUrl, sha256Hex } from "@/lib/file-safety";
import { VIDEO_FILTERS } from "@/lib/video-filters";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/stories/new")({
  head: () => ({
    meta: [
      { title: "Nova Vibe · Vibely" },
      { name: "description", content: "Grave ou escolha uma foto ou vídeo e publique sua Vibe por 24 horas." },
      { property: "og:title", content: "Nova Vibe · Vibely" },
      { property: "og:description", content: "Crie sua Vibe em tela cheia com câmera, texto, figurinhas e filtros." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewStoryPage,
});

const MAX_SECONDS = 15;
const W = 1080;
const H = 1920;

type Media = { file: File; url: string; video: boolean };
type TextLayer = { text: string; y: number; style: "clean" | "neon" | "box" };

function pickMime() {
  for (const m of ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, mirror = false) {
  const s = Math.max(W / sw, H / sh);
  const dw = sw * s;
  const dh = sh * s;
  ctx.save();
  if (mirror) {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, t: TextLayer) {
  if (!t.text.trim()) return;
  ctx.save();
  ctx.font = "700 72px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const y = t.y * H;
  const lines = t.text.split("\n").slice(0, 4);
  lines.forEach((line, i) => {
    const ly = y + (i - (lines.length - 1) / 2) * 88;
    if (t.style === "box") {
      const w = ctx.measureText(line).width + 56;
      ctx.fillStyle = "rgba(10,12,14,0.78)";
      ctx.beginPath();
      ctx.roundRect(W / 2 - w / 2, ly - 50, w, 100, 28);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
    } else if (t.style === "neon") {
      ctx.shadowColor = "#22E06A";
      ctx.shadowBlur = 28;
      ctx.fillStyle = "#22E06A";
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 16;
      ctx.fillStyle = "#ffffff";
    }
    ctx.fillText(line, W / 2, ly);
  });
  ctx.restore();
}

async function renderPhoto(url: string, filter: string, text: TextLayer | null): Promise<File> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.filter = filter === "none" ? "none" : filter;
  drawCover(ctx, img, img.naturalWidth, img.naturalHeight);
  ctx.filter = "none";
  if (text) drawText(ctx, text);
  const blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Falha ao gerar imagem"))), "image/jpeg", 0.9));
  return new File([blob], `vibe-${Date.now()}.jpg`, { type: "image/jpeg" });
}

function NewStoryPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const moderate = useServerFn(moderateMedia);
  const moderateCaption = useServerFn(moderateText);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const holdTimer = useRef<number | null>(null);
  const startAt = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [camState, setCamState] = useState<"idle" | "ready" | "denied">("idle");
  const [torch, setTorch] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [media, setMedia] = useState<Media | null>(null);

  const [filterId, setFilterId] = useState("none");
  const [panel, setPanel] = useState<null | "filters" | "sticker" | "text">(null);
  const [text, setText] = useState<TextLayer | null>(null);
  const [draftText, setDraftText] = useState("");
  const [textStyle, setTextStyle] = useState<TextLayer["style"]>("clean");
  const [focus, setFocus] = useState(false);
  const [caption, setCaption] = useState("");
  const [stickerType, setStickerType] = useState<"none" | "poll" | "question">("none");
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState(["Sim", "Não"]);
  const [prompt, setPrompt] = useState("Manda uma Vibe");
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);

  const filterCss = VIDEO_FILTERS.find((f) => f.id === filterId)?.css ?? "none";

  useEffect(() => {
    void (supabase as any).from("profiles").select("avatar_url").eq("id", user.id).maybeSingle().then(({ data }: any) => setAvatar(data?.avatar_url ?? null));
  }, [user.id]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (media) {
      stopCamera();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
          audio: true,
        });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stopCamera();
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
        setCamState("ready");
      } catch {
        if (!cancelled) setCamState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facing, media, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => () => { if (media) URL.revokeObjectURL(media.url); }, [media]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0] as any;
    try {
      await track?.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch {
      toast.message("Flash indisponível nesta câmera");
    }
  };

  const takePhoto = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    drawCover(ctx, v, v.videoWidth, v.videoHeight, facing === "user");
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
    if (!blob) return;
    const file = new File([blob], `vibe-${Date.now()}.jpg`, { type: "image/jpeg" });
    setMedia({ file, url: URL.createObjectURL(file), video: false });
  };

  const startRec = () => {
    const s = streamRef.current;
    if (!s) return;
    const mime = pickMime();
    try {
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        const type = rec.mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size < 1000) return;
        const file = new File([blob], `vibe-${Date.now()}.${type.includes("mp4") ? "mp4" : "webm"}`, { type: type.split(";")[0] });
        setMedia({ file, url: URL.createObjectURL(file), video: true });
      };
      rec.start(250);
      recRef.current = rec;
      startAt.current = performance.now();
      setRecording(true);
    } catch {
      toast.error("Não foi possível gravar neste aparelho");
    }
  };

  const stopRec = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
    recRef.current = null;
    setRecording(false);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      const p = (performance.now() - startAt.current) / 1000 / MAX_SECONDS;
      setProgress(Math.min(1, p));
      if (p >= 1) stopRec();
    }, 50);
    return () => window.clearInterval(id);
  }, [recording, stopRec]);

  const onShutterDown = () => {
    if (camState !== "ready") return;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      startRec();
    }, 280);
  };
  const onShutterUp = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      void takePhoto();
    } else if (recording) stopRec();
  };

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast.error("Arquivo maior que 25MB");
    setMedia({ file: f, url: URL.createObjectURL(f), video: f.type.startsWith("video/") });
  };

  const discard = () => {
    setMedia(null);
    setText(null);
    setFilterId("none");
    setPanel(null);
    setStickerType("none");
    setCaption("");
  };

  const buildFile = async () => {
    if (!media) throw new Error("Sem mídia");
    if (media.video || (filterId === "none" && !text)) return media.file;
    return renderPhoto(media.url, filterCss, text);
  };

  const save = async () => {
    try {
      const f = await buildFile();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast.success("Salvo no aparelho");
    } catch {
      toast.error("Não foi possível salvar");
    }
  };

  async function submit() {
    if (!media) return;
    setBusy(true);
    try {
      const upload = await buildFile();
      const check = await checkFile(upload);
      if (!check.ok) throw new Error(check.error);
      const [dataUrl, sha256] = await Promise.all([previewDataUrl(upload), sha256Hex(upload)]);
      const verdict = await moderate({ data: { dataUrl, sha256, mime: check.mime, size: upload.size, surface: "public", contentType: "story" } });
      if (!verdict.allow) throw new Error(verdict.reason || "Conteúdo bloqueado pelas regras da comunidade");
      const txts = [caption.trim(), text?.text.trim() ?? ""].filter(Boolean).join(" | ");
      let sticker: any = null;
      if (stickerType === "poll") {
        const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
        if (!pollQ.trim() || opts.length < 2) throw new Error("Preencha a pergunta e duas opções da enquete");
        sticker = { type: "poll", question: pollQ.trim().slice(0, 80), options: opts.map((o) => o.slice(0, 30)) };
      } else if (stickerType === "question") {
        if (!prompt.trim()) throw new Error("Escreva a pergunta da caixinha");
        sticker = { type: "question", prompt: prompt.trim().slice(0, 80) };
      }
      const all = [txts, sticker ? (sticker.type === "poll" ? [sticker.question, ...sticker.options].join(" | ") : sticker.prompt) : ""].filter(Boolean).join(" | ");
      if (all) {
        const v = await moderateCaption({ data: { text: all, surface: "public", contentType: "story_caption" } });
        if (!v.allow) throw new Error(v.reason || "Texto bloqueado pelas regras da comunidade");
      }
      const path = await uploadMedia("stories", user.id, upload);
      const { error } = await (supabase as any).from("stories").insert({
        user_id: user.id,
        media_url: path,
        media_type: media.video ? "video" : "image",
        caption: caption.trim() || null,
        sticker,
      });
      if (error) throw error;
      toast.success("Vibe publicada!");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao publicar");
    } finally {
      setBusy(false);
    }
  }

  // arrastar texto na vertical
  const dragText = (e: React.PointerEvent) => {
    if (!text) return;
    e.stopPropagation();
    const el = e.currentTarget.parentElement!;
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const y = Math.min(0.88, Math.max(0.12, (ev.clientY - rect.top) / rect.height));
      setText((t) => (t ? { ...t, y } : t));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const glass = "grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/40 text-white backdrop-blur-md transition active:scale-90";
  const R = 38;
  const C = 2 * Math.PI * R;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-black text-white">
      <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />

      {/* Palco */}
      <div className="absolute inset-0" onClick={() => media && !panel && setFocus((f) => !f)}>
        {!media ? (
          <video ref={videoRef} muted playsInline autoPlay className={cn("h-full w-full object-cover", facing === "user" && "-scale-x-100")} />
        ) : media.video ? (
          <video src={media.url} autoPlay loop playsInline className="h-full w-full object-cover" style={{ filter: filterCss }} />
        ) : (
          <img src={media.url} alt="Sua Vibe" className="h-full w-full object-cover" style={{ filter: filterCss }} />
        )}
        {text && media && (
          <div
            onPointerDown={dragText}
            className={cn(
              "absolute left-1/2 max-w-[86%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none whitespace-pre-wrap text-center font-display text-3xl font-bold",
              text.style === "neon" && "text-primary [text-shadow:0_0_18px_var(--primary)]",
              text.style === "box" && "rounded-2xl bg-black/75 px-4 py-2",
              text.style === "clean" && "[text-shadow:0_2px_12px_rgba(0,0,0,.6)]",
            )}
            style={{ top: `${text.y * 100}%` }}
          >
            {text.text}
          </div>
        )}
        {stickerType !== "none" && media && !focus && (
          <div className="pointer-events-none absolute left-1/2 top-[62%] w-64 -translate-x-1/2 rounded-2xl border border-white/15 bg-black/55 p-3 text-center backdrop-blur-md">
            <p className="text-sm font-bold">{stickerType === "poll" ? pollQ || "Sua pergunta" : prompt}</p>
            {stickerType === "poll" ? (
              <div className="mt-2 grid gap-1.5">
                {pollOpts.filter(Boolean).map((o, i) => <div key={i} className="rounded-full bg-white/10 py-1.5 text-xs font-semibold">{o}</div>)}
              </div>
            ) : <div className="mt-2 rounded-full bg-white/10 py-1.5 text-xs text-white/60">Responda aqui…</div>}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/75 to-transparent" />
      </div>

      {camState === "denied" && !media && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          <div className="space-y-3">
            <p className="text-sm text-white/80">Sem acesso à câmera. Libere nas configurações do navegador ou escolha da galeria.</p>
            <button onClick={() => fileInputRef.current?.click()} className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">Abrir galeria</button>
          </div>
        </div>
      )}

      {/* Topo */}
      <div className={cn("relative z-10 flex items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity", focus && "pointer-events-none opacity-0")}>
        <button className={glass} aria-label={media ? "Descartar" : "Voltar"} onClick={() => (media ? discard() : navigate({ to: "/" }))}>
          {media ? <X className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
        </button>
        <div className="mx-auto rounded-full border border-white/15 bg-black/40 px-3.5 py-1.5 text-xs font-bold tracking-wide backdrop-blur-md">
          {recording ? (
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />{(progress * MAX_SECONDS).toFixed(1)}s</span>
          ) : media ? "Editar Vibe" : "Nova Vibe"}
        </div>
        {!media ? (
          <button className={glass} aria-label="Flash" onClick={toggleTorch}>{torch ? <Zap className="h-5 w-5 text-primary" /> : <ZapOff className="h-5 w-5" />}</button>
        ) : <div className="w-11" />}
      </div>

      {/* Dock lateral */}
      {media && !focus && (
        <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-3">
          {[
            { k: "text", icon: Type, label: "Texto", show: !media.video },
            { k: "sticker", icon: Sticker, label: "Figurinha", show: true },
            { k: "filters", icon: Sparkles, label: "Filtros", show: true },
          ].filter((b) => b.show).map((b) => (
            <button key={b.k} aria-label={b.label} className={cn(glass, panel === b.k && "border-primary text-primary")}
              onClick={() => {
                if (b.k === "text") { setDraftText(text?.text ?? ""); setTextStyle(text?.style ?? "clean"); }
                setPanel(panel === b.k ? null : (b.k as any));
              }}>
              <b.icon className="h-5 w-5" />
            </button>
          ))}
          <button aria-label="Salvar" className={glass} onClick={save}><Download className="h-5 w-5" /></button>
        </div>
      )}

      <div className="flex-1" />

      {/* Painéis */}
      {media && panel === "filters" && (
        <div className="relative z-10 flex gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
          {VIDEO_FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilterId(f.id)} className="flex shrink-0 flex-col items-center gap-1">
              <div className={cn("h-16 w-12 overflow-hidden rounded-xl border-2", filterId === f.id ? "border-primary" : "border-white/20")}>
                {media.video ? <div className="h-full w-full bg-white/20" style={{ filter: f.css }} /> : <img src={media.url} alt="" className="h-full w-full object-cover" style={{ filter: f.css }} />}
              </div>
              <span className={cn("text-[10px] font-semibold", filterId === f.id && "text-primary")}>{f.label}</span>
            </button>
          ))}
        </div>
      )}
      {media && panel === "sticker" && (
        <div className="relative z-10 mx-3 mb-3 space-y-2 rounded-3xl border border-white/15 bg-black/60 p-3 backdrop-blur-xl">
          <div className="grid grid-cols-3 gap-2">
            {([["none", "Nenhuma"], ["poll", "Enquete"], ["question", "Perguntas"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setStickerType(k)} className={cn("rounded-full py-2 text-xs font-bold", stickerType === k ? "bg-primary text-primary-foreground" : "bg-white/10")}>{l}</button>
            ))}
          </div>
          {stickerType === "poll" && (
            <div className="space-y-1.5">
              <input value={pollQ} onChange={(e) => setPollQ(e.target.value)} maxLength={80} placeholder="Pergunta da enquete" className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" />
              {pollOpts.map((o, i) => (
                <input key={i} value={o} maxLength={30} onChange={(e) => setPollOpts(pollOpts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Opção ${i + 1}`} className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" />
              ))}
              {pollOpts.length < 4 && <button onClick={() => setPollOpts([...pollOpts, ""])} className="text-xs font-semibold text-primary">+ opção</button>}
            </div>
          )}
          {stickerType === "question" && (
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={80} className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" />
          )}
          <button onClick={() => setPanel(null)} className="w-full rounded-full bg-white/10 py-2 text-xs font-bold">Pronto</button>
        </div>
      )}
      {media && panel === "text" && (
        <div className="absolute inset-0 z-20 flex flex-col bg-black/70 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button className={glass} onClick={() => setPanel(null)} aria-label="Cancelar"><X className="h-5 w-5" /></button>
            <div className="flex gap-2">
              {(["clean", "neon", "box"] as const).map((s) => (
                <button key={s} onClick={() => setTextStyle(s)} className={cn("rounded-full px-3 py-1.5 text-xs font-bold", textStyle === s ? "bg-primary text-primary-foreground" : "bg-white/10")}>
                  {s === "clean" ? "Clássico" : s === "neon" ? "Neon" : "Bloco"}
                </button>
              ))}
            </div>
            <button className={cn(glass, "border-primary text-primary")} aria-label="Confirmar texto" onClick={() => {
              setText(draftText.trim() ? { text: draftText.slice(0, 120), y: text?.y ?? 0.4, style: textStyle } : null);
              setPanel(null);
            }}><Check className="h-5 w-5" /></button>
          </div>
          <div className="grid flex-1 place-items-center px-6">
            <textarea autoFocus value={draftText} onChange={(e) => setDraftText(e.target.value)} maxLength={120} rows={3} placeholder="Digite algo…"
              className={cn("w-full resize-none bg-transparent text-center font-display text-3xl font-bold outline-none placeholder:text-white/40", textStyle === "neon" && "text-primary")} />
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div className={cn("relative z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-opacity", focus && "pointer-events-none opacity-0")}>
        {!media ? (
          <div className="flex items-center justify-between">
            <button onClick={() => fileInputRef.current?.click()} className={cn(glass, "h-12 w-12 rounded-2xl")} aria-label="Galeria"><ImagePlus className="h-5 w-5" /></button>
            <div className="flex flex-col items-center gap-2">
              <button
                aria-label="Toque para foto, segure para vídeo"
                onPointerDown={onShutterDown}
                onPointerUp={onShutterUp}
                onPointerLeave={() => recording && stopRec()}
                onContextMenu={(e) => e.preventDefault()}
                disabled={camState !== "ready"}
                className="relative grid h-[88px] w-[88px] touch-none select-none place-items-center disabled:opacity-40"
              >
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
                  <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="5" />
                  <circle cx="44" cy="44" r={R} fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
                </svg>
                <span className={cn("rounded-full bg-white transition-all", recording ? "h-9 w-9 rounded-xl bg-destructive" : "h-[66px] w-[66px]")} />
              </button>
              <span className="text-[11px] font-semibold text-white/70">Toque: foto · Segure: vídeo até {MAX_SECONDS}s</span>
            </div>
            <button onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} className={cn(glass, "h-12 w-12")} aria-label="Trocar câmera"><RefreshCw className="h-5 w-5" /></button>
          </div>
        ) : panel !== "text" && (
          <div className="space-y-3">
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Adicione uma legenda…"
              className="h-11 w-full rounded-full border border-white/15 bg-black/40 px-4 text-sm text-white outline-none backdrop-blur-md placeholder:text-white/55 focus:border-primary/60" />
            <div className="flex items-center gap-2">
              <button disabled={busy} onClick={submit} className="flex h-12 flex-1 items-center gap-2 rounded-full border border-white/15 bg-black/45 pl-1.5 pr-4 backdrop-blur-md disabled:opacity-60">
                <UserAvatar url={avatar} name={user.email ?? "Você"} size={36} />
                <span className="text-left leading-tight">
                  <span className="block text-sm font-bold">Sua Vibe</span>
                  <span className="block text-[10px] text-white/60">Fica no ar por 24h</span>
                </span>
              </button>
              <button disabled={busy} onClick={submit} aria-label="Publicar" className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_-4px_var(--primary)] transition active:scale-90 disabled:opacity-60">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
