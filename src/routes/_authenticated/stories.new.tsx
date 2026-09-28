import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, ImagePlus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { moderateMedia, moderateText } from "@/lib/moderation.functions";
import { checkFile, previewDataUrl, sha256Hex } from "@/lib/file-safety";
import {
  ImageEditor,
  STORY_ASPECTS,
  defaultImageEdit,
  exportEditedImage,
  imageEditIsNeutral,
  type ImageEditState,
} from "@/components/media/image-editor";

export const Route = createFileRoute("/_authenticated/stories/new")({
  component: NewStoryPage,
});

function NewStoryPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [stickerType, setStickerType] = useState<"none" | "poll" | "question">("none");
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState(["Sim", "Não"]);
  const [prompt, setPrompt] = useState("Manda uma Vibe");
  const [imgEdit, setImgEdit] = useState<ImageEditState>({ ...defaultImageEdit, aspect: "0.5625" });
  const moderate = useServerFn(moderateMedia);
  const moderateCaption = useServerFn(moderateText);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  // Libera a foto/vídeo da memória ao trocar de arquivo ou sair da tela.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);
  const isVideo = file?.type.startsWith("video/");

  async function submit() {
    if (!file) return toast.error("Escolha uma foto ou vídeo");
    if (file.size > 25 * 1024 * 1024) return toast.error("Arquivo maior que 25MB");
    setBusy(true);
    try {
      let upload: File = file;
      if (!isVideo && preview && !imageEditIsNeutral(imgEdit)) {
        try {
          upload = await exportEditedImage(preview, imgEdit, 1920);
        } catch {
          toast.message("Não foi possível aplicar a edição — enviando a foto original");
        }
      }
      const check = await checkFile(upload);
      if (!check.ok) throw new Error(check.error);
      const [dataUrl, sha256] = await Promise.all([previewDataUrl(upload), sha256Hex(upload)]);
      const verdict = await moderate({ data: { dataUrl, sha256, mime: check.mime, size: upload.size, surface: "public", contentType: "story" } });
      if (!verdict.allow) throw new Error(verdict.reason || "Conteúdo bloqueado pelas regras da comunidade");
      if (caption.trim()) {
        const textVerdict = await moderateCaption({ data: { text: caption.trim(), surface: "public", contentType: "story_caption" } });
        if (!textVerdict.allow) throw new Error(textVerdict.reason || "Legenda bloqueada pelas regras da comunidade");
      }
      let sticker: any = null;
      if (stickerType === "poll") {
        const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
        if (!pollQ.trim() || opts.length < 2) throw new Error("Preencha a pergunta e duas opções da enquete");
        sticker = { type: "poll", question: pollQ.trim().slice(0, 80), options: opts.map((o) => o.slice(0, 30)) };
      } else if (stickerType === "question") {
        if (!prompt.trim()) throw new Error("Escreva a pergunta da caixinha");
        sticker = { type: "question", prompt: prompt.trim().slice(0, 80) };
      }
      if (sticker) {
        const txt = sticker.type === "poll" ? [sticker.question, ...sticker.options].join(" | ") : sticker.prompt;
        const v = await moderateCaption({ data: { text: txt, surface: "public", contentType: "story_caption" } });
        if (!v.allow) throw new Error(v.reason || "Figurinha bloqueada pelas regras da comunidade");
      }
      const path = await uploadMedia("stories", user.id, upload);
      const { error } = await (supabase as any).from("stories").insert({
        user_id: user.id,
        media_url: path,
        media_type: isVideo ? "video" : "image",
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

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/" })} className="grid h-10 w-10 place-items-center rounded-full bg-white/5 transition hover:bg-white/10" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <p className="text-xs font-bold uppercase text-primary">Momento</p>
          <h1 className="text-2xl font-bold">Nova Vibe</h1>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      {!preview ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative block aspect-[9/16] w-full cursor-pointer overflow-hidden rounded-[28px] border border-white/10 bg-[color:var(--surface-2)] shadow-[0_24px_70px_-30px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
        >
          <div className="absolute inset-0 grid place-items-center gap-3 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(60%_45%_at_50%_35%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)]"
            />
            <div className="relative space-y-2">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-brand shadow-[0_0_28px_-4px_color-mix(in_oklab,var(--primary)_80%,transparent)] transition-transform group-hover:scale-105">
                <ImagePlus className="h-7 w-7 text-primary-foreground" />
              </div>
              <div className="text-sm font-medium">Escolha foto ou vídeo</div>
              <div className="text-xs text-muted-foreground">Sua Vibe fica no ar por 24 horas</div>
            </div>
          </div>
        </button>
      ) : (
        <div className="space-y-3">
          {isVideo ? (
            <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] border border-white/10 bg-black">
              <video src={preview} className="h-full w-full object-contain" muted autoPlay loop playsInline />
            </div>
          ) : (
            <ImageEditor src={preview} value={imgEdit} onChange={setImgEdit} aspects={STORY_ASPECTS} />
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mx-auto flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-semibold transition hover:bg-white/10"
          >
            <ImagePlus className="h-4 w-4" /> Trocar foto
          </button>
        </div>
      )}


      <div className="social-card space-y-2 rounded-2xl p-3">
        <Textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Escreva uma legenda (opcional)"
          className="resize-none rounded-xl border-white/10 bg-transparent focus-visible:ring-primary/40"
        />
        <div className="text-right text-xs text-muted-foreground">{caption.length}/200</div>
      </div>

      <div className="social-card space-y-3 rounded-2xl p-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Figurinha interativa</p>
        <div className="grid grid-cols-3 gap-2">
          {([["none", "Nenhuma"], ["poll", "Enquete"], ["question", "Perguntas"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setStickerType(k)}
              className={`rounded-full px-3 py-2 text-sm font-medium ${stickerType === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{l}</button>
          ))}
        </div>
        {stickerType === "poll" ? (
          <div className="space-y-2">
            <input value={pollQ} onChange={(e) => setPollQ(e.target.value)} maxLength={80} placeholder="Pergunta da enquete" className="w-full rounded-xl bg-muted px-3 py-2 text-sm outline-none" />
            {pollOpts.map((o, i) => (
              <input key={i} value={o} maxLength={30} onChange={(e) => setPollOpts(pollOpts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Opção ${i + 1}`} className="w-full rounded-xl bg-muted px-3 py-2 text-sm outline-none" />
            ))}
            {pollOpts.length < 4 ? <button type="button" onClick={() => setPollOpts([...pollOpts, ""])} className="text-sm text-primary">+ opção</button> : null}
          </div>
        ) : stickerType === "question" ? (
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={80} placeholder="Ex.: Manda uma Vibe" className="w-full rounded-xl bg-muted px-3 py-2 text-sm outline-none" />
        ) : null}
      </div>

      <Button
        disabled={busy || !file}
        onClick={submit}
        className="h-12 w-full rounded-full bg-gradient-brand shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--primary)_85%,transparent)] hover:opacity-90"
      >
        {busy ? "Publicando…" : "Publicar por 24h"}
      </Button>
    </div>
  );
}

