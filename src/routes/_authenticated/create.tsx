import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  Eye,
  FileText,
  ImagePlus,
  Images,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  Video,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { MusicPicker } from "@/components/music/music-picker";
import type { MusicSelection } from "@/lib/music/api";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { suggestCaptions } from "@/lib/ai.functions";
import { VideoTrimmer, defaultTrim, type TrimState } from "@/components/media/video-trimmer";
import {
  ImageEditor,
  FEED_ASPECTS,
  defaultImageEdit,
  exportEditedImage,
  imageEditIsNeutral,
  type ImageEditState,
} from "@/components/media/image-editor";
import { exportVideo, needsReencode, shouldCompress } from "@/lib/video-export";
import { moderateMedia, moderateText } from "@/lib/moderation.functions";
import { checkFile, previewDataUrl, sha256Hex } from "@/lib/file-safety";
import { PollComposer, emptyPollDraft } from "@/components/polls/poll-composer";
import { createPoll, validateDraft, type PollDraft } from "@/lib/polls";
import { cn } from "@/lib/utils";
import mascot from "@/assets/vibely-ai-mascot.png.asset.json";

type Mode = "media" | "text" | "poll";
const MAX_MEDIA = 10;
type PublishState = "idle" | "publishing" | "success" | "error";

const modes = [
  { id: "media", label: "Foto/Vídeo", shortLabel: "Mídia", icon: Images },
  { id: "text", label: "Texto", shortLabel: "Texto", icon: FileText },
  { id: "poll", label: "Enquete", shortLabel: "Enquete", icon: BarChart3 },
] satisfies { id: Mode; label: string; shortLabel: string; icon: typeof Images }[];

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Novo post | Vibely" },
      { name: "description", content: "Crie e publique fotos, vídeos, textos e enquetes no Vibely." },
      { property: "og:title", content: "Novo post | Vibely" },
      { property: "og:description", content: "Crie e publique fotos, vídeos, textos e enquetes no Vibely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreatePage,
});

function CreatePage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [music, setMusic] = useState<MusicSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishState, setPublishState] = useState<PublishState>("idle");
  const [trim, setTrim] = useState<TrimState>(defaultTrim);
  const [imgEdit, setImgEdit] = useState<ImageEditState>(defaultImageEdit);
  const [progress, setProgress] = useState(0);
  const [captionIdeas, setCaptionIdeas] = useState<string[]>([]);
  const [thinkingCaptions, setThinkingCaptions] = useState(false);
  const [mode, setMode] = useState<Mode>("media");
  const [poll, setPoll] = useState<PollDraft>({ ...emptyPollDraft, options: ["", ""] });
  const [extras, setExtras] = useState<{ file: File; url: string }[]>([]);
  const [step, setStep] = useState<"compose" | "details">("compose");
  const [showPreview, setShowPreview] = useState(false);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const runSuggest = useServerFn(suggestCaptions);
  const moderate = useServerFn(moderateMedia);
  const moderateCaption = useServerFn(moderateText);

  const isVideo = !!file?.type.startsWith("video/");
  const pollIsValid = !validateDraft(poll);
  const canPublish = mode === "media" ? !!file : mode === "text" ? !!caption.trim() : pollIsValid;

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  async function suggestCaptionIdeas() {
    if (thinkingCaptions) return;
    setThinkingCaptions(true);
    try {
      const r = await runSuggest({ data: { hint: caption.trim() || undefined } });
      setCaptionIdeas(r.captions);
    } catch {
      toast.error("Não consegui pensar em legendas agora");
    } finally {
      setThinkingCaptions(false);
    }
  }

  function pick(f: File | null) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) {
      setPublishState("error");
      return toast.error("Arquivo maior que 25 MB");
    }
    const isImage = f.type.startsWith("image/");
    const isVid = f.type.startsWith("video/");
    if (!isImage && !isVid) {
      setPublishState("error");
      return toast.error("Envie uma imagem ou vídeo");
    }
    if (preview) URL.revokeObjectURL(preview);
    const nextPreview = URL.createObjectURL(f);
    setFile(f);
    setTrim(defaultTrim);
    setImgEdit({ ...defaultImageEdit, aspect: isVid ? "original" : "0.8" });
    setProgress(0);
    setPublishState("idle");
    setPreview(nextPreview);
  }

  function addExtras(list: FileList | null) {
    if (!list) return;
    const room = MAX_MEDIA - 1 - extras.length;
    const accepted: { file: File; url: string }[] = [];
    for (const f of Array.from(list).slice(0, Math.max(0, room))) {
      if (f.size > 25 * 1024 * 1024) { toast.error(`${f.name}: maior que 25 MB`); continue; }
      if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) continue;
      accepted.push({ file: f, url: URL.createObjectURL(f) });
    }
    if (list.length > room) toast.message(`Máximo de ${MAX_MEDIA} mídias por post`);
    setExtras((prev) => [...prev, ...accepted]);
    if (extraInputRef.current) extraInputRef.current.value = "";
  }

  function removeExtra(i: number) {
    setExtras((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function removeMedia() {
    if (preview) URL.revokeObjectURL(preview);
    extras.forEach((e) => URL.revokeObjectURL(e.url));
    setExtras([]);
    setFile(null);
    setPreview(null);
    setTrim(defaultTrim);
    setImgEdit(defaultImageEdit);
    setProgress(0);
    setPublishState("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function selectMode(next: Mode) {
    setMode(next);
    setPublishState("idle");
    setCaptionIdeas([]);
  }

  async function submitTextOrPoll() {
    const text = caption.trim();
    if (mode === "text" && text.length < 1) return toast.error("Escreva algo para publicar");
    if (mode === "poll") {
      const err = validateDraft(poll);
      if (err) return toast.error(err);
    }
    setBusy(true);
    setPublishState("publishing");
    try {
      if (text) {
        const verdict = await moderateCaption({
          data: { text, surface: "public", contentType: "post_caption" },
        });
        if (!verdict.allow) throw new Error(verdict.reason || "Texto bloqueado pelas regras da comunidade");
      }
      if (mode === "poll") {
        const pollText = [poll.question, ...poll.options].join(" \n ").trim();
        const verdict = await moderateCaption({
          data: { text: pollText, surface: "public", contentType: "post_caption" },
        });
        if (!verdict.allow) throw new Error(verdict.reason || "Enquete bloqueada pelas regras da comunidade");
      }

      const finalCaption = mode === "poll" ? "" : text;
      const pollId = mode === "poll" ? await createPoll(poll, user.id) : null;
      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        media_url: null,
        media_type: "text" as any,
        post_kind: "post",
        caption: finalCaption,
        poll_id: pollId,
      } as any);
      if (error) throw error;
      setPublishState("success");
      toast.success(mode === "poll" ? "Enquete publicada!" : "Publicado!");
      navigate({ to: "/" });
    } catch (err: any) {
      console.error("[create] publish text/poll failed", err);
      setPublishState("error");
      toast.error(err?.message ?? "Falha ao publicar", { action: { label: "Tentar novamente", onClick: () => void submitTextOrPoll() } });
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (mode !== "media") return submitTextOrPoll();
    if (!file) return toast.error("Escolha uma foto ou vídeo");
    if (caption.length > 500) return toast.error("Legenda longa demais");
    setBusy(true);
    setPublishState("publishing");
    try {
      let toUpload: File = file;

      if (isVideo && preview) {
        const opts = {
          from: trim.from,
          to: trim.to || trim.duration,
          muted: trim.muted,
          aspect: trim.aspect,
          dewatermark: trim.dewatermark,
          music: trim.music,
          onProgress: setProgress,
        };
        if (needsReencode(opts, trim.duration) || shouldCompress(file, trim.duration)) {
          try {
            const out = await exportVideo(preview, opts);
            toUpload = new File([out.blob], `video-${Date.now()}.${out.ext}`, { type: out.blob.type });
          } catch (err) {
            console.warn("[create] video export failed, uploading original", err);
            toast.message("Não foi possível aplicar o corte — enviando o vídeo original");
          }
        }
      }

      if (!isVideo && preview && !imageEditIsNeutral(imgEdit)) {
        try {
          toUpload = await exportEditedImage(preview, imgEdit);
        } catch (err) {
          console.warn("[create] image export failed, uploading original", err);
          toast.message("Não foi possível aplicar a edição — enviando a foto original");
        }
      }

      const check = await checkFile(toUpload);
      if (!check.ok) throw new Error(check.error);
      const [dataUrl, sha256] = await Promise.all([previewDataUrl(toUpload), sha256Hex(toUpload)]);
      const verdict = await moderate({
        data: {
          dataUrl,
          sha256,
          mime: check.mime,
          size: toUpload.size,
          surface: "public",
          contentType: "post",
        },
      });
      if (!verdict.allow) throw new Error(verdict.reason || "Conteúdo bloqueado pelas regras da comunidade");

      if (caption.trim()) {
        const textVerdict = await moderateCaption({
          data: { text: caption.trim(), surface: "public", contentType: "post_caption" },
        });
        if (!textVerdict.allow) throw new Error(textVerdict.reason || "Legenda bloqueada pelas regras da comunidade");
      }

      // Mídias extras do carrossel: checar e moderar antes de publicar
      const extraChecked: { file: File; type: "image" | "video" }[] = [];
      for (const ex of extras) {
        const c = await checkFile(ex.file);
        if (!c.ok) throw new Error(c.error);
        const [du, sh] = await Promise.all([previewDataUrl(ex.file), sha256Hex(ex.file)]);
        const v = await moderate({
          data: { dataUrl: du, sha256: sh, mime: c.mime, size: ex.file.size, surface: "public", contentType: "post" },
        });
        if (!v.allow) throw new Error(v.reason || "Uma das mídias foi bloqueada pelas regras da comunidade");
        extraChecked.push({ file: ex.file, type: ex.file.type.startsWith("video/") ? "video" : "image" });
      }

      const path = await uploadMedia("posts", user.id, toUpload);
      const { data: created, error } = await supabase
        .from("posts")
        .insert({
          author_id: user.id,
          media_url: path,
          media_type: isVideo ? "video" : "image",
          post_kind: "post",
          caption: caption.trim(),
          ...(music ? { music_track_id: music.track.id, music_start_ms: music.startMs, music_end_ms: music.endMs, music_volume: music.volume } : {}),
        })
        .select("id")
        .single();
      if (error) throw error;
      for (let i = 0; i < extraChecked.length; i++) {
        const ex = extraChecked[i];
        const exPath = await uploadMedia("posts", user.id, ex.file);
        const { error: mErr } = await (supabase as any)
          .from("post_media")
          .insert({ post_id: created.id, position: i + 1, media_type: ex.type, media_url: exPath });
        if (mErr) throw mErr;
      }
      setPublishState("success");
      toast.success("Post publicado!");
      navigate({ to: "/" });
    } catch (err: any) {
      console.error("[create] publish failed", err);
      setPublishState("error");
      toast.error(err?.message ?? "Falha ao publicar", { action: { label: "Tentar novamente", onClick: () => void submit(e) } });
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  const canAdvance =
    mode === "media" ? !!file : mode === "poll" ? pollIsValid : true;

  function goNext() {
    if (!canAdvance) {
      toast.error(mode === "media" ? "Escolha uma foto ou vídeo" : "Complete a enquete");
      return;
    }
    setStep("details");
  }

  return (
    <div className="create-composer mx-auto min-h-[100dvh] w-full max-w-2xl pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:min-h-0 md:pb-8">
      <header className="sticky top-0 z-20 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 border-b border-border/70 bg-background/80 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl md:static md:rounded-t-2xl md:px-5 md:pt-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            if (step === "details") return setStep("compose");
            if (window.history.length > 1) window.history.back();
            else navigate({ to: "/" });
          }}
          aria-label="Voltar"
          className="rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 text-center">
          <p className="truncate font-display text-[1.05rem] font-bold text-foreground">
            {step === "compose" ? "Novo post" : "Finalizar"}
          </p>
          <div className="mt-1 flex items-center justify-center gap-1.5" aria-hidden="true">
            <span className="h-1 w-6 rounded-full bg-primary" />
            <span className={cn("h-1 w-6 rounded-full transition-colors", step === "details" ? "bg-primary" : "bg-border")} />
          </div>
        </div>
        <div aria-hidden="true" className="h-11 w-11" />
      </header>

      <main className="space-y-4 px-3 pt-4 sm:px-4 md:px-5">
        {step === "compose" ? (
          <>
            <section aria-labelledby="content-type-label">
              <h2 id="content-type-label" className="sr-only">Tipo de conteúdo</h2>
              <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border/60 bg-surface/80 p-1 shadow-sm backdrop-blur">
                {modes.map(({ id, label, shortLabel, icon: Icon }) => (
                  <Button
                    key={id}
                    type="button"
                    variant="ghost"
                    onClick={() => selectMode(id)}
                    aria-pressed={mode === id}
                    className={cn(
                      "h-10 min-w-0 rounded-xl px-2 text-xs transition-all duration-200 active:scale-[0.98] sm:text-[13px]",
                      mode === id
                        ? "bg-surface-2 text-foreground shadow-sm ring-1 ring-primary/30"
                        : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", mode === id && "text-primary")} />
                    <span className="hidden min-[350px]:inline">{label}</span>
                    <span className="min-[350px]:hidden">{shortLabel}</span>
                  </Button>
                ))}
              </div>
            </section>

            {mode === "media" ? (
              <section aria-labelledby="media-label" className="space-y-3">
                <h2 id="media-label" className="sr-only">Sua mídia</h2>
                {!preview ? (
                  <>
                    <label className="group flex min-h-[46dvh] cursor-pointer flex-col items-center justify-center rounded-[26px] border border-dashed border-primary/30 bg-surface/70 px-5 py-10 text-center shadow-sm backdrop-blur transition-all duration-200 hover:border-primary/60 hover:bg-primary/[0.05] active:scale-[0.99]">
                      <span className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-primary/25 bg-surface-2 text-primary shadow-sm transition-transform duration-200 group-active:scale-95">
                        <ImagePlus className="h-7 w-7" />
                      </span>
                      <span className="font-display text-[16px] font-semibold">Escolher foto ou vídeo</span>
                      <span className="mt-1 text-xs text-muted-foreground">Até {MAX_MEDIA} mídias · 25 MB cada</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        onChange={(e) => pick(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    <div className="grid gap-2 min-[410px]:grid-cols-2">
                      <StudioLink to="/create/video" icon={Video} title="Estúdio de vídeo" description="Grave, corte e publique" primary />
                      <StudioLink to="/create/studio" icon={Wand2} title="Vibely Studio" description="Edição avançada e IA" />
                    </div>
                  </>
                ) : (
                  <div className="animate-fade-in space-y-3">
                    <div className="relative overflow-hidden rounded-[26px] bg-background ring-1 ring-border/60">
                      {!isVideo ? (
                        <ImageEditor src={preview} value={imgEdit} onChange={setImgEdit} aspects={FEED_ASPECTS} />
                      ) : (
                        <video src={preview} controls playsInline className="mx-auto max-h-[58dvh] w-full object-contain" />
                      )}
                      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-foreground backdrop-blur">
                        {1 + extras.length}/{MAX_MEDIA}
                      </span>
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-background ring-2 ring-primary/60">
                        {isVideo ? (
                          <video src={preview} muted playsInline className="h-full w-full object-cover" />
                        ) : (
                          <img src={preview} alt="" className="h-full w-full object-cover" />
                        )}
                        <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-[9px] font-bold text-primary">1</span>
                      </div>
                      {extras.map((ex, i) => (
                        <div key={ex.url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-background ring-1 ring-border">
                          {ex.file.type.startsWith("video/") ? (
                            <video src={ex.url} muted playsInline className="h-full w-full object-cover" />
                          ) : (
                            <img src={ex.url} alt="" className="h-full w-full object-cover" />
                          )}
                          <span className="absolute left-1 top-1 rounded bg-background/80 px-1 text-[9px] font-bold">{i + 2}</span>
                          <button
                            type="button"
                            onClick={() => removeExtra(i)}
                            aria-label="Remover mídia"
                            className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-background/85 text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {1 + extras.length < MAX_MEDIA ? (
                        <button
                          type="button"
                          onClick={() => extraInputRef.current?.click()}
                          className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-dashed border-primary/40 text-primary transition active:scale-95"
                          aria-label="Adicionar mais mídias"
                        >
                          <ImagePlus className="h-5 w-5" />
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-9 rounded-full border-border bg-surface-2/60 text-xs hover:bg-surface-2">
                        <RefreshCw className="h-4 w-4" /> Substituir
                      </Button>
                      <Button type="button" variant="ghost" onClick={removeMedia} className="h-9 rounded-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-4 w-4" /> Remover
                      </Button>
                    </div>

                    {isVideo ? (
                      <section className="rounded-[22px] border border-border/60 bg-surface/80 p-3 shadow-sm backdrop-blur">
                        <VideoTrimmer src={preview} value={trim} onChange={setTrim} />
                      </section>
                    ) : null}

                    <section className="rounded-[22px] border border-border/60 bg-surface/80 p-3 shadow-sm backdrop-blur">
                      <h3 className="mb-2 font-display text-sm font-semibold">Trilha sonora</h3>
                      <MusicPicker value={music} onChange={setMusic} videoMode={!!isVideo} />
                    </section>

                    <input ref={extraInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => addExtras(e.target.files)} />
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                  </div>
                )}
              </section>
            ) : null}

            {mode === "poll" ? (
              <section className="animate-fade-in rounded-[22px] border border-border/60 bg-surface/80 p-4 shadow-sm backdrop-blur">
                <div className="mb-4">
                  <h2 className="font-display text-base font-semibold">Crie uma conversa</h2>
                  <p className="text-xs text-muted-foreground">Pergunte algo e escolha quando a votação termina.</p>
                </div>
                <PollComposer value={poll} onChange={setPoll} />
              </section>
            ) : null}

            <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-border/70 bg-card p-2 shadow-lg md:bottom-4">
              <Button
                type="button"
                onClick={goNext}
                disabled={!canAdvance}
                className={cn(
                  "h-11 w-full rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.99] disabled:opacity-100",
                  canAdvance ? "bg-primary text-primary-foreground shadow-[0_10px_28px_-14px_var(--primary)] hover:bg-primary/90" : "bg-surface-2 text-muted-foreground shadow-none",
                )}
              >
                Avançar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="animate-fade-in space-y-4">
            <section className="overflow-hidden rounded-[22px] border border-border/60 bg-surface/80 shadow-sm backdrop-blur">
              <div className="flex gap-3 p-3">
                {mode === "media" && preview ? (
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-background ring-1 ring-border">
                    {isVideo ? (
                      <video src={preview} muted playsInline className="h-full w-full object-cover" />
                    ) : (
                      <img src={preview} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                ) : null}
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder={mode === "text" ? "O que você quer compartilhar?" : mode === "poll" ? "Comentário opcional…" : "Escreva uma legenda…"}
                  maxLength={500}
                  rows={mode === "text" ? 7 : 4}
                  className="min-h-24 flex-1 resize-none border-0 bg-transparent p-0 text-[15px] shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void suggestCaptionIdeas()}
                  disabled={thinkingCaptions}
                  className="h-9 rounded-full px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                >
                  {thinkingCaptions ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <img src={mascot.url} alt="" className="h-5 w-5 object-contain" />}
                  {thinkingCaptions ? "Criando ideias…" : "Ideias da Vibely AI"}
                </Button>
                <span className={cn("text-[11px] tabular-nums", caption.length > 450 ? "text-destructive" : "text-muted-foreground")}>{caption.length}/500</span>
              </div>
              {captionIdeas.length ? (
                <div className="grid gap-2 border-t border-border/60 p-3">
                  {captionIdeas.map((idea, index) => (
                    <Button
                      key={`${index}-${idea}`}
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setCaption(idea);
                        setCaptionIdeas([]);
                      }}
                      className="h-auto min-h-10 justify-start whitespace-normal rounded-xl bg-surface-2/60 px-3 py-2 text-left text-xs font-normal leading-relaxed text-foreground/85 hover:bg-primary/10 hover:text-foreground"
                    >
                      <span className="line-clamp-3">{idea}</span>
                      <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
                    </Button>
                  ))}
                </div>
              ) : null}
            </section>

            {mode === "media" && music ? (
              <div className="flex items-center gap-3 rounded-[22px] border border-border/60 bg-surface/80 px-3 py-2.5 shadow-sm backdrop-blur">
                <span className="flex h-8 items-end gap-0.5">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="w-1 animate-pulse rounded-full bg-primary" style={{ height: `${8 + ((i * 7) % 18)}px`, animationDelay: `${i * 120}ms` }} />
                  ))}
                </span>
                <span className="min-w-0 truncate text-xs text-foreground">
                  {music.track.title} · <span className="text-muted-foreground">{music.track.artist}</span>
                </span>
              </div>
            ) : null}

            {mode === "media" && preview ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPreview(true)}
                className="h-10 w-full rounded-full border-border bg-surface-2/60 text-xs hover:bg-surface-2"
              >
                <Eye className="h-4 w-4" /> Ver como fica no feed
              </Button>
            ) : null}

            <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-border/70 bg-card p-2 shadow-lg md:bottom-4">
              <Button
                type="submit"
                disabled={busy || !canPublish}
                className={cn(
                  "h-11 w-full rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.99] disabled:opacity-100",
                  canPublish && !busy ? "bg-primary text-primary-foreground shadow-[0_10px_28px_-14px_var(--primary)] hover:bg-primary/90" : "bg-surface-2 text-muted-foreground shadow-none",
                  publishState === "error" && canPublish && "ring-1 ring-destructive/40",
                )}
              >
                {busy ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : publishState === "success" ? (
                  <Check className="h-4 w-4" />
                ) : null}
                {busy
                  ? progress > 0 && progress < 1
                    ? `Processando ${Math.round(progress * 100)}%`
                    : "Publicando…"
                  : publishState === "success"
                    ? "Publicado"
                    : publishState === "error"
                      ? "Tentar publicar novamente"
                      : mode === "poll"
                        ? "Publicar enquete"
                        : "Publicar no Vibely"}
              </Button>
            </div>
          </form>
        )}
      </main>

      {showPreview ? (
        <div
          role="dialog"
          aria-label="Prévia no feed"
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
        >
          <div className="w-full max-w-sm overflow-hidden rounded-[22px] border border-border/60 bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="h-8 w-8 rounded-full bg-surface-2" />
              <span className="text-xs font-semibold">Você</span>
            </div>
            <div className="bg-black">
              {preview ? (
                isVideo ? (
                  <video src={preview} muted playsInline className="max-h-[50dvh] w-full object-contain" />
                ) : (
                  <img src={preview} alt="" className="max-h-[50dvh] w-full object-contain" />
                )
              ) : null}
            </div>
            {caption.trim() ? <p className="px-3 py-2.5 text-xs leading-relaxed text-foreground/90">{caption}</p> : null}
            <div className="border-t border-border/60 p-2">
              <Button type="button" variant="ghost" className="h-9 w-full rounded-xl text-xs" onClick={() => setShowPreview(false)}>
                Fechar prévia
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudioLink({
  to,
  icon: Icon,
  title,
  description,
  primary = false,
}: {
  to: "/create/video" | "/create/studio";
  icon: typeof Video;
  title: string;
  description: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group grid min-h-[4.75rem] grid-cols-[2.75rem_minmax(0,1fr)_1.5rem] items-center gap-2.5 rounded-2xl border p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]",
        primary ? "border-primary/35 bg-primary/[0.07]" : "border-border/70 bg-surface",
      )}
    >
      <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", primary ? "bg-primary text-primary-foreground" : "bg-surface-2 text-primary")}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}