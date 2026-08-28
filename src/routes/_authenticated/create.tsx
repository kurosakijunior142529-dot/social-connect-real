import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ImagePlus, Video, X } from "lucide-react";
import { VideoTrimmer, defaultTrim, type TrimState } from "@/components/media/video-trimmer";
import { exportVideo, needsReencode, shouldCompress } from "@/lib/video-export";
import { useServerFn } from "@tanstack/react-start";
import { moderateMedia, moderateText } from "@/lib/moderation.functions";
import { checkFile, previewDataUrl, sha256Hex } from "@/lib/file-safety";
import { PollComposer, emptyPollDraft } from "@/components/polls/poll-composer";
import { createPoll, validateDraft, type PollDraft } from "@/lib/polls";
import { cn } from "@/lib/utils";

type Mode = "media" | "text" | "poll";

export const Route = createFileRoute("/_authenticated/create")({
  component: CreatePage,
});

function CreatePage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [trim, setTrim] = useState<TrimState>(defaultTrim);
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<Mode>("media");
  const [poll, setPoll] = useState<PollDraft>({ ...emptyPollDraft, options: ["", ""] });
  const moderate = useServerFn(moderateMedia);
  const moderateCaption = useServerFn(moderateText);

  const isVideo = !!file?.type.startsWith("video/");

  function pick(f: File | null) {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) return toast.error("Arquivo maior que 25MB");
    const isImage = f.type.startsWith("image/");
    const isVid = f.type.startsWith("video/");
    if (!isImage && !isVid) return toast.error("Envie uma imagem ou vídeo");
    setFile(f);
    setTrim(defaultTrim);
    setProgress(0);
    setPreview(URL.createObjectURL(f));
  }

  /** Post de texto e/ou enquete — sem upload de mídia. */
  async function submitTextOrPoll() {
    const text = caption.trim();
    if (mode === "text" && text.length < 1) return toast.error("Escreva algo para publicar");
    if (mode === "poll") {
      const err = validateDraft(poll);
      if (err) return toast.error(err);
    }
    setBusy(true);
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

      const pollId = mode === "poll" ? await createPoll(poll, user.id) : null;
      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        media_url: null,
        media_type: "text" as any,
        post_kind: "post",
        caption: text,
        poll_id: pollId,
      } as any);
      if (error) throw error;
      toast.success(mode === "poll" ? "Enquete publicada!" : "Publicado!");
      navigate({ to: "/" });
    } catch (err: any) {
      console.error("[create] publish text/poll failed", err);
      toast.error(err?.message ?? "Falha ao publicar");
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
        // Reprocessa quando o usuário editou OU quando o arquivo original é
        // pesado demais para streaming fluido no feed.
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

      // Segurança: validação real do arquivo + moderação no servidor antes de publicar.
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

      const path = await uploadMedia("posts", user.id, toUpload);
      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        media_url: path,
        media_type: isVideo ? "video" : "image",
        post_kind: "post",
        caption: caption.trim(),
      });
      if (error) throw error;
      toast.success("Post publicado!");
      navigate({ to: "/" });
    } catch (err: any) {
      console.error("[create] publish failed", err);
      toast.error(err?.message ?? "Falha ao publicar");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Novo post</h1>

      <Link
        to="/create/video"
        className="flex items-center gap-3 rounded-2xl p-4 bg-gradient-brand text-white shadow-lg active:scale-[0.99] transition"
      >
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
          <Video className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold">Estúdio de vídeo</div>
          <div className="text-xs opacity-90">Grave com filtros, ajuste o trim e publique</div>
        </div>
      </Link>


      <div className="flex gap-2">
        {([
          { id: "media", label: "Foto/Vídeo" },
          { id: "text", label: "Texto" },
          { id: "poll", label: "Enquete" },
        ] as { id: Mode; label: string }[]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setMode(t.id)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-[13px] font-medium transition",
              mode === t.id
                ? "border-primary bg-primary/15 text-primary"
                : "border-white/10 text-muted-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-4">
        {mode !== "media" ? null : preview ? (
          <div className="relative rounded-3xl overflow-hidden bg-black">
            {isVideo ? (
              <video src={preview} controls playsInline className="w-full aspect-square object-cover" />
            ) : (
              <img src={preview} alt="preview" className="w-full aspect-square object-cover" />
            )}
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setTrim(defaultTrim);
              }}
              className="absolute top-3 right-3 rounded-full bg-black/60 text-white p-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center aspect-square rounded-3xl border-2 border-dashed cursor-pointer hover:bg-muted transition">
            <ImagePlus className="h-12 w-12 text-primary mb-3" />
            <span className="font-semibold">Toque para adicionar</span>
            <span className="text-xs text-muted-foreground mt-1">Foto ou vídeo, até 25MB</span>
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
            />
          </label>
        )}

        {mode === "media" && isVideo && preview ? (
          <VideoTrimmer src={preview} value={trim} onChange={setTrim} />
        ) : null}

        {mode === "poll" ? (
          <div className="rounded-3xl border border-white/10 p-4">
            <PollComposer value={poll} onChange={setPoll} />
          </div>
        ) : null}

        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={
            mode === "text"
              ? "O que você quer dizer?"
              : mode === "poll"
                ? "Contexto da enquete (opcional)…"
                : "Escreva uma legenda…"
          }
          maxLength={500}
          rows={mode === "text" ? 6 : 4}
          className="rounded-2xl resize-none"
        />
        <div className="text-right text-xs text-muted-foreground">{caption.length}/500</div>

        <Button
          type="submit"
          disabled={busy || (mode === "media" && !file)}
          className="w-full h-12 rounded-full bg-gradient-brand hover:opacity-90 text-base font-semibold"
        >
          {busy
            ? progress > 0 && progress < 1
              ? `Processando ${Math.round(progress * 100)}%`
              : "Publicando…"
            : mode === "poll"
              ? "Publicar enquete"
              : "Publicar"}
        </Button>
      </form>
    </div>
  );
}
