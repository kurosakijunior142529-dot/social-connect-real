import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, ImagePlus, Loader2, Music2, RefreshCw, Send, Settings2, Sparkles, Star, Sticker, Type, X, Zap, ZapOff, PenLine, Scan, Timer, Trash2 } from "lucide-react";
import { MusicPicker } from "@/components/music/music-picker";
import { trackAudioUrl, type MusicSelection } from "@/lib/music/api";
import { VIBE_MOODS } from "@/components/stories/story-sticker";
import { CloseFriendsSheet } from "@/components/stories/close-friends-sheet";
import { useServerFn } from "@tanstack/react-start";
import { moderateMedia, moderateText } from "@/lib/moderation.functions";
import { checkFile, previewDataUrl, sha256Hex } from "@/lib/file-safety";
import { VIDEO_FILTERS } from "@/lib/video-filters";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { exportVideo, probeDuration } from "@/lib/video-export";
import { Button } from "@/components/ui/button";

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
type TextLayer = { id: string; text: string; x: number; y: number; style: "clean" | "neon" | "box"; color: string };
type Stroke = { points: { x: number; y: number }[]; color: string; width: number };
const INKS = ["#ffffff", "#22E06A", "#FFDA65", "#FF6B87", "#69D4FF"];

function pickMime() {
  for (const m of ["video/mp4;codecs=avc1", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, mirror = false, outW = W, outH = H) {
  const s = Math.max(outW / sw, outH / sh);
  const dw = sw * s;
  const dh = sh * s;
  ctx.save();
  if (mirror) {
    ctx.translate(outW, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, (outW - dw) / 2, (outH - dh) / 2, dw, dh);
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
      ctx.fillStyle = t.color;
    } else if (t.style === "neon") {
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 28;
      ctx.fillStyle = t.color;
    } else {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 16;
      ctx.fillStyle = t.color;
    }
    ctx.fillText(line, t.x * W, ly, W * 0.86);
  });
  ctx.restore();
}

function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.shadowColor = stroke.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x * W, stroke.points[0].y * H);
    for (const p of stroke.points.slice(1)) ctx.lineTo(p.x * W, p.y * H);
    ctx.stroke();
  }
  ctx.restore();
}

function drawOverlays(ctx: CanvasRenderingContext2D, texts: TextLayer[], strokes: Stroke[]) {
  drawStrokes(ctx, strokes);
  texts.forEach((t) => drawText(ctx, t));
}

async function renderPhoto(url: string, filter: string, texts: TextLayer[], strokes: Stroke[], fit: boolean): Promise<File> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Edição indisponível neste aparelho");
  if (fit) {
    ctx.save();
    ctx.filter = "blur(50px) brightness(0.55)";
    drawCover(ctx, img, img.naturalWidth, img.naturalHeight);
    ctx.restore();
  }
  ctx.filter = filter === "none" ? "none" : filter;
  if (fit) {
    const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
    ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
  } else drawCover(ctx, img, img.naturalWidth, img.naturalHeight);
  ctx.filter = "none";
  drawOverlays(ctx, texts, strokes);
  const blob = await new Promise<Blob>((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error("Falha ao gerar imagem"))), "image/jpeg", 0.9));
  return new File([blob], `vibe-${Date.now()}.jpg`, { type: "image/jpeg" });
}

function buzz(ms: number | number[]) {
  try { navigator.vibrate?.(ms); } catch { /* sem vibração */ }
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
  const [panel, setPanel] = useState<null | "filters" | "sticker" | "text" | "music" | "draw">(null);
  const [texts, setTexts] = useState<TextLayer[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [textStyle, setTextStyle] = useState<TextLayer["style"]>("clean");
  const [ink, setInk] = useState(INKS[1]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [fit, setFit] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<number | null>(null);
  const [focus, setFocus] = useState(false);
  const [caption, setCaption] = useState("");
  const [stickerType, setStickerType] = useState<"none" | "poll" | "question" | "mood">("none");
  const [stickerPos, setStickerPos] = useState({ x: 0.5, y: 0.78 });

  const [moodIdx, setMoodIdx] = useState(0);
  const [music, setMusic] = useState<MusicSelection | null>(null);
  const [vipOpen, setVipOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState(["Sim", "Não"]);
  const [prompt, setPrompt] = useState("Manda uma Vibe");
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);

  const filterCss = VIDEO_FILTERS.find((f) => f.id === filterId)?.css ?? "none";
  const editedText = texts.find((t) => t.id === editingTextId);

  useEffect(() => () => { if (countdownRef.current) window.clearTimeout(countdownRef.current); }, []);

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
      // Pede o sensor já na proporção da tela: evita o recorte agressivo que
      // dava sensação de zoom gigante e perda de nitidez.
      const screenRatio = typeof window !== "undefined" && window.innerWidth > 0 ? window.innerHeight / window.innerWidth : 16 / 9;
      const ideal: MediaTrackConstraints = {
        facingMode: { ideal: facing },
        aspectRatio: { ideal: 1 / screenRatio },
        width: { ideal: 1440 },
        height: { ideal: Math.round(1440 * screenRatio) },
        frameRate: { ideal: 30 },
        resizeMode: "none",
      } as MediaTrackConstraints;
      const open = async () => {
        try {
          return await navigator.mediaDevices.getUserMedia({ video: ideal, audio: true });
        } catch {
          return await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: true });
        }
      };
      try {
        const s = await open();
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

  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (!music || !media) return;
    let cancelled = false;
    void trackAudioUrl(music.track).then((src) => {
      if (cancelled || !src) return;
      const a = new Audio(src);
      a.volume = music.volume ?? 0.8;
      a.loop = true;
      a.currentTime = music.startMs / 1000;
      audioRef.current = a;
      void a.play().catch(() => {});
    });
    return () => { cancelled = true; audioRef.current?.pause(); };
  }, [music, media]);

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
    // Usa a resolução real do sensor (sem ampliar) para a foto sair nítida.
    const outW = Math.min(W, Math.min(v.videoWidth, v.videoHeight));
    const outH = Math.round((outW * H) / W);
    const c = document.createElement("canvas");
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    drawCover(ctx, v, v.videoWidth, v.videoHeight, facing === "user", outW, outH);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.95));
    if (!blob) return;
    buzz(15);
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
      buzz(25);
      setRecording(true);
    } catch {
      toast.error("Não foi possível gravar neste aparelho");
    }
  };

  const stopRec = useCallback(() => {
    if (recRef.current?.state === "recording") { recRef.current.stop(); buzz([10, 40, 10]); }
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
    if (timerEnabled) {
      setCountdown(3);
      const tick = (n: number) => {
        countdownRef.current = window.setTimeout(() => {
          if (n === 1) { setCountdown(0); countdownRef.current = null; startRec(); }
          else { setCountdown(n - 1); tick(n - 1); }
        }, 1000);
      };
      tick(3);
      return;
    }
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      startRec();
    }, 280);
  };
  const onShutterUp = () => {
    if (timerEnabled) { if (recording) stopRec(); return; }
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
    setTexts([]);
    setStrokes([]);
    setFit(false);
    setFilterId("none");
    setPanel(null);
    setStickerType("none");
    setCaption("");
    setMusic(null);
  };

  const buildFile = async () => {
    if (!media) throw new Error("Sem mídia");
    if (media.video) {
      if (filterId === "none" && !texts.length && !strokes.length && !fit) return media.file;
      const duration = await probeDuration(media.url);
      if (!duration || duration > 60) throw new Error("Este vídeo não pode ser editado aqui. Escolha um vídeo de até 60 segundos.");
      const out = await exportVideo(media.url, {
        aspect: "vertical", filterCss, fitInside: fit,
        drawOverlay: (ctx) => drawOverlays(ctx, texts, strokes),
      });
      return new File([out.blob], `vibe-${Date.now()}.${out.ext}`, { type: out.blob.type });
    }
    return renderPhoto(media.url, filterCss, texts, strokes, fit);
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

  async function submit(audience: "all" | "vip" = "all") {
    if (!media) return;
    setBusy(true);
    try {
      const upload = await buildFile();
      const check = await checkFile(upload);
      if (!check.ok) throw new Error(check.error);
      const [dataUrl, sha256] = await Promise.all([previewDataUrl(upload), sha256Hex(upload)]);
      const verdict = await moderate({ data: { dataUrl, sha256, mime: check.mime, size: upload.size, surface: "public", contentType: "story" } });
      if (!verdict.allow) throw new Error(verdict.reason || "Conteúdo bloqueado pelas regras da comunidade");
      const txts = [caption.trim(), ...texts.map((t) => t.text.trim())].filter(Boolean).join(" | ");
      let sticker: any = null;
      if (stickerType === "poll") {
        const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
        if (!pollQ.trim() || opts.length < 2) throw new Error("Preencha a pergunta e duas opções da enquete");
        sticker = { type: "poll", question: pollQ.trim().slice(0, 80), options: opts.map((o) => o.slice(0, 30)) };
      } else if (stickerType === "question") {
        if (!prompt.trim()) throw new Error("Escreva a pergunta da caixinha");
        sticker = { type: "question", prompt: prompt.trim().slice(0, 80) };
      } else if (stickerType === "mood") {
        sticker = { type: "mood", ...VIBE_MOODS[moodIdx] };
      }
      if (sticker) sticker = { ...sticker, x: Number(stickerPos.x.toFixed(3)), y: Number(stickerPos.y.toFixed(3)) };

      const all = [txts, sticker && sticker.type !== "mood" ? (sticker.type === "poll" ? [sticker.question, ...sticker.options].join(" | ") : sticker.prompt) : ""].filter(Boolean).join(" | ");
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
        audience,
        music_track_id: music?.track.id ?? null,
        music_start_ms: music ? Math.round(music.startMs) : 0,
      });
      if (error) throw error;
      buzz([15, 60, 30]);
      toast.success(audience === "vip" ? "Vibe publicada para a Sintonia VIP!" : "Vibe publicada!");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao publicar");
    } finally {
      setBusy(false);
    }
  }

  const dragLayer = (e: React.PointerEvent, apply: (x: number, y: number) => void) => {
    e.stopPropagation();
    const el = e.currentTarget.parentElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const x = Math.min(0.88, Math.max(0.12, (ev.clientX - rect.left) / rect.width));
      const y = Math.min(0.9, Math.max(0.1, (ev.clientY - rect.top) / rect.height));
      apply(x, y);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      buzz(6);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const dragText = (e: React.PointerEvent, id: string) =>
    dragLayer(e, (x, y) => setTexts((prev) => prev.map((t) => (t.id === id ? { ...t, x, y } : t))));


  const pointFromEvent = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
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
        ) : (
          <>
            {fit && <div className="absolute inset-0 scale-125 bg-cover bg-center blur-3xl brightness-50" style={{ backgroundImage: `url(${media.url})` }} />}
            {media.video ? (
              <video src={media.url} autoPlay loop playsInline className={cn("relative h-full w-full", fit ? "object-contain" : "object-cover")} style={{ filter: filterCss }} />
            ) : (
              <img src={media.url} alt="Sua Vibe" className={cn("relative h-full w-full", fit ? "object-contain" : "object-cover")} style={{ filter: filterCss }} />
            )}
          </>
        )}
        {media && strokes.length > 0 && (
          <svg viewBox="0 0 1080 1920" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {strokes.map((s, i) => <polyline key={i} points={s.points.map((p) => `${p.x * W},${p.y * H}`).join(" ")} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>
        )}
        {texts.map((text) => media && (
          <div
            key={text.id}
            onPointerDown={(e) => dragText(e, text.id)}
            onDoubleClick={(e) => { e.stopPropagation(); setEditingTextId(text.id); setDraftText(text.text); setTextStyle(text.style); setInk(text.color); setPanel("text"); }}
            className={cn(
              "absolute left-1/2 max-w-[86%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none whitespace-pre-wrap text-center font-display text-3xl font-bold",
              text.style === "neon" && "text-primary [text-shadow:0_0_18px_var(--primary)]",
              text.style === "box" && "rounded-2xl bg-black/75 px-4 py-2",
              text.style === "clean" && "[text-shadow:0_2px_12px_rgba(0,0,0,.6)]",
            )}
            style={{ top: `${text.y * 100}%`, left: `${text.x * 100}%`, color: text.color }}
          >
            {text.text}
          </div>
        ))}
        {stickerType !== "none" && media && !focus && (
          <div
            onPointerDown={(e) => dragLayer(e, (x, y) => setStickerPos({ x, y }))}
            onDoubleClick={(e) => { e.stopPropagation(); setPanel("sticker"); }}
            style={{ left: `${stickerPos.x * 100}%`, top: `${stickerPos.y * 100}%` }}
            className="absolute w-60 max-w-[78%] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-2xl border border-white/15 bg-black/55 p-3 text-center backdrop-blur-md"
          >

            {stickerType === "mood" ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Vibe do dia</p>
                <p className="mt-1 text-2xl font-bold">{VIBE_MOODS[moodIdx].emoji} {VIBE_MOODS[moodIdx].label}</p>
              </>
            ) : <p className="text-sm font-bold">{stickerType === "poll" ? pollQ || "Sua pergunta" : prompt}</p>}
            {stickerType === "mood" ? null : stickerType === "poll" ? (
              <div className="mt-2 grid gap-1.5">
                {pollOpts.filter(Boolean).map((o, i) => <div key={i} className="rounded-full bg-white/10 py-1.5 text-xs font-semibold">{o}</div>)}
              </div>
            ) : <div className="mt-2 rounded-full bg-white/10 py-1.5 text-xs text-white/60">Responda aqui…</div>}
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/75 to-transparent" />
      </div>

      {media && panel === "draw" && (
        <svg viewBox="0 0 1080 1920" preserveAspectRatio="none" className="absolute inset-0 z-20 h-full w-full touch-none" aria-label="Desenhar sobre a Vibe"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setActiveStroke({ points: [pointFromEvent(e)], color: ink, width: 12 }); }}
          onPointerMove={(e) => { if (e.buttons) setActiveStroke((s) => s ? { ...s, points: [...s.points, pointFromEvent(e)] } : null); }}
          onPointerUp={(e) => { if (activeStroke) setStrokes((prev) => [...prev, { ...activeStroke, points: [...activeStroke.points, pointFromEvent(e)] }]); setActiveStroke(null); }}>
          {activeStroke && <polyline points={activeStroke.points.map((p) => `${p.x * W},${p.y * H}`).join(" ")} fill="none" stroke={activeStroke.color} strokeWidth={activeStroke.width} strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      )}
      {countdown > 0 && <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-background/30 font-display text-8xl font-bold text-primary">{countdown}</div>}

      {camState === "denied" && !media && (
        <div className="absolute inset-0 grid place-items-center p-8 text-center">
          <div className="space-y-3">
            <p className="text-sm text-white/80">Sem acesso à câmera. Libere nas configurações do navegador ou escolha da galeria.</p>
          <Button onClick={() => fileInputRef.current?.click()}>Abrir galeria</Button>
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
          ) : media && music ? (
            <button onClick={() => setPanel("music")} className="flex max-w-[52vw] items-center gap-2">
              <span className="flex h-3 items-end gap-[2px]">{[0, 1, 2].map((i) => <span key={i} className="w-[3px] animate-pulse rounded-full bg-primary" style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 150}ms` }} />)}</span>
              <span className="truncate">{music.track.title} · {music.track.artist}</span>
              <X className="h-3.5 w-3.5 shrink-0 text-white/70" onClick={(e) => { e.stopPropagation(); setMusic(null); }} />
            </button>
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
            { k: "text", icon: Type, label: "Texto", show: true },
            { k: "draw", icon: PenLine, label: "Desenhar", show: true },
            { k: "sticker", icon: Sticker, label: "Figurinha", show: true },
            { k: "filters", icon: Sparkles, label: "Filtros", show: true },
            { k: "music", icon: Music2, label: "Música", show: true },
          ].filter((b) => b.show).map((b) => (
            <button key={b.k} aria-label={b.label} className={cn(glass, panel === b.k && "border-primary text-primary")}
              onClick={() => {
                if (b.k === "text") { setEditingTextId(null); setDraftText(""); setTextStyle("clean"); setInk(INKS[1]); }
                setPanel(panel === b.k ? null : (b.k as any));
              }}>
              <b.icon className="h-5 w-5" />
            </button>
          ))}
          <Button type="button" variant="ghost" size="icon" title={fit ? "Preencher tela" : "Mostrar imagem inteira"} aria-label={fit ? "Preencher tela" : "Mostrar imagem inteira"} onClick={() => setFit((v) => !v)} className={glass}><Scan className="h-5 w-5" /></Button>
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
      {media && panel === "draw" && (
        <div className="relative z-30 mb-3 flex items-center justify-between gap-2 rounded-lg bg-background/80 px-3 py-2 backdrop-blur-xl">
          <div className="flex gap-2">
            {INKS.map((color) => <Button key={color} type="button" variant="ghost" size="icon" aria-label={`Cor ${color}`} aria-pressed={ink === color} onClick={() => setInk(color)} className={cn("h-8 w-8 rounded-full p-1", ink === color && "ring-2 ring-primary")}><span className="h-full w-full rounded-full" style={{ backgroundColor: color }} /></Button>)}
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Desfazer traço" disabled={!strokes.length} onClick={() => setStrokes((prev) => prev.slice(0, -1))}><Trash2 className="h-4 w-4" /></Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setPanel(null)}>Pronto</Button>
        </div>
      )}
      {media && panel === "sticker" && (
        <div className="relative z-10 mx-3 mb-3 space-y-2 rounded-3xl border border-white/15 bg-black/60 p-3 backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-1.5">
            {([["none", "Nenhuma"], ["poll", "Enquete"], ["question", "Perguntas"], ["mood", "Vibe do dia"]] as const).map(([k, l]) => (
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
          {stickerType === "mood" && (
            <div className="flex justify-between gap-1">
              {VIBE_MOODS.map((m, i) => (
                <button key={m.label} onClick={() => setMoodIdx(i)} className={cn("flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2", moodIdx === i ? "bg-primary/20 ring-1 ring-primary" : "bg-white/10")}>
                  <span className="text-xl">{m.emoji}</span><span className="text-[10px] font-semibold">{m.label}</span>
                </button>
              ))}
            </div>
          )}
          {stickerType === "question" && (
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={80} className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none" />
          )}
          <button onClick={() => setPanel(null)} className="w-full rounded-full bg-white/10 py-2 text-xs font-bold">Pronto</button>
        </div>
      )}
      {media && panel === "music" && (
        <div className="relative z-10 mx-3 mb-3 space-y-2 rounded-3xl border border-white/15 bg-black/60 p-3 backdrop-blur-xl">
          <MusicPicker value={music} onChange={setMusic} videoMode={media.video} />
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
              const value = draftText.trim().slice(0, 120);
              if (editingTextId) setTexts((prev) => prev.flatMap((t) => t.id !== editingTextId ? [t] : value ? [{ ...t, text: value, style: textStyle, color: ink }] : []));
              else if (value) setTexts((prev) => [...prev, { id: crypto.randomUUID(), text: value, x: 0.5, y: 0.35 + (prev.length % 3) * 0.12, style: textStyle, color: ink }]);
              setPanel(null);
            }}><Check className="h-5 w-5" /></button>
          </div>
          <div className="flex justify-center gap-2 pt-4">
            {INKS.map((color) => <Button key={color} type="button" variant="ghost" size="icon" aria-label={`Cor ${color}`} aria-pressed={ink === color} onClick={() => setInk(color)} className={cn("h-9 w-9 rounded-full p-1", ink === color && "ring-2 ring-primary")}><span className="h-full w-full rounded-full" style={{ backgroundColor: color }} /></Button>)}
          </div>
          <div className="grid flex-1 place-items-center px-6">
            <textarea autoFocus value={draftText} onChange={(e) => setDraftText(e.target.value)} maxLength={120} rows={3} placeholder="Digite algo…"
              className="w-full resize-none bg-transparent text-center font-display text-3xl font-bold outline-none placeholder:text-muted-foreground" style={{ color: ink }} />
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div className={cn("relative z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-opacity", focus && "pointer-events-none opacity-0")}>
        {!media ? (
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} className={cn(glass, "h-12 w-12")} aria-label="Galeria"><ImagePlus className="h-5 w-5" /></Button>
            <div className="flex flex-col items-center gap-2">
              <Button type="button" variant="ghost" size="sm" aria-pressed={timerEnabled} onClick={() => setTimerEnabled((v) => !v)} className={cn("h-8 rounded-full border border-border/30 bg-background/50 text-xs text-foreground", timerEnabled && "border-primary text-primary")}><Timer className="h-4 w-4" /> {timerEnabled ? "Timer 3s" : "Sem timer"}</Button>
              <button
                aria-label={timerEnabled ? "Gravar vídeo após 3 segundos; toque para parar" : "Toque para foto, segure para vídeo"}
                onPointerDown={onShutterDown}
                onPointerUp={onShutterUp}
                onPointerLeave={() => !timerEnabled && recording && stopRec()}
                onContextMenu={(e) => e.preventDefault()}
                disabled={camState !== "ready" || countdown > 0}
                className="relative grid h-[88px] w-[88px] touch-none select-none place-items-center disabled:opacity-40"
              >
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 88 88">
                  <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="5" />
                  <circle cx="44" cy="44" r={R} fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
                </svg>
                <span className={cn("rounded-full bg-white transition-all", recording ? "h-9 w-9 rounded-xl bg-destructive" : "h-[66px] w-[66px]")} />
              </button>
              <span className="text-[11px] font-semibold text-foreground/70">{timerEnabled ? `Toque: vídeo em 3s · até ${MAX_SECONDS}s` : `Toque: foto · Segure: vídeo até ${MAX_SECONDS}s`}</span>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} className={cn(glass, "h-12 w-12")} aria-label="Trocar câmera"><RefreshCw className="h-5 w-5" /></Button>
          </div>
        ) : panel !== "text" && (
          <div className="space-y-3">
            <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Adicione uma legenda…"
              className="h-11 w-full rounded-full border border-white/15 bg-black/40 px-4 text-sm text-white outline-none backdrop-blur-md placeholder:text-white/55 focus:border-primary/60" />
            <div className="flex items-center gap-2">
              <button disabled={busy} onClick={() => submit("all")} className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/15 bg-black/45 pl-1.5 pr-4 backdrop-blur-md disabled:opacity-60">
                <UserAvatar avatarPath={avatar} displayName={user.email ?? "Você"} className="h-9 w-9" />
                <span className="text-left leading-tight">
                  <span className="block text-sm font-bold">Sua Vibe</span>
                  <span className="block text-[10px] text-white/60">24h para todos</span>
                </span>
              </button>
              <div className="flex h-12 items-center rounded-full border border-primary/40 bg-black/45 backdrop-blur-md">
                <button disabled={busy} onClick={() => submit("vip")} className="flex h-full items-center gap-1.5 pl-3 pr-2 disabled:opacity-60">
                  <Star className="h-4 w-4 fill-primary text-primary" />
                  <span className="text-left leading-tight"><span className="block text-xs font-bold">Sintonia VIP</span><span className="block text-[10px] text-white/60">Só amigos próximos</span></span>
                </button>
                <button onClick={() => setVipOpen(true)} aria-label="Editar Sintonia VIP" className="grid h-full w-8 place-items-center border-l border-white/10 text-white/70"><Settings2 className="h-4 w-4" /></button>
              </div>
              <button disabled={busy} onClick={() => submit("all")} aria-label="Publicar" className="grid h-12 w-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_24px_-4px_var(--primary)] transition active:scale-90 disabled:opacity-60">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </div>
        )}
      </div>
      <CloseFriendsSheet open={vipOpen} onOpenChange={setVipOpen} userId={user.id} />
    </div>
  );
}
