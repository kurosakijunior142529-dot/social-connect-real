import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, ImagePlus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { moderateMedia, moderateText } from "@/lib/moderation.functions";
import { checkFile, previewDataUrl, sha256Hex } from "@/lib/file-safety";

export const Route = createFileRoute("/_authenticated/stories/new")({
  component: NewStoryPage,
});

function NewStoryPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const moderate = useServerFn(moderateMedia);
  const moderateCaption = useServerFn(moderateText);
  const preview = file ? URL.createObjectURL(file) : null;
  const isVideo = file?.type.startsWith("video/");

  async function submit() {
    if (!file) return toast.error("Escolha uma foto ou vídeo");
    if (file.size > 25 * 1024 * 1024) return toast.error("Arquivo maior que 25MB");
    setBusy(true);
    try {
      const check = await checkFile(file);
      if (!check.ok) throw new Error(check.error);
      const [dataUrl, sha256] = await Promise.all([previewDataUrl(file), sha256Hex(file)]);
      const verdict = await moderate({ data: { dataUrl, sha256, mime: check.mime, size: file.size, surface: "public", contentType: "story" } });
      if (!verdict.allow) throw new Error(verdict.reason || "Conteúdo bloqueado pelas regras da comunidade");
      if (caption.trim()) {
        const textVerdict = await moderateCaption({ data: { text: caption.trim(), surface: "public", contentType: "story_caption" } });
        if (!textVerdict.allow) throw new Error(textVerdict.reason || "Legenda bloqueada pelas regras da comunidade");
      }
      const path = await uploadMedia("stories", user.id, file);
      const { error } = await (supabase as any).from("stories").insert({
        user_id: user.id,
        media_url: path,
        media_type: isVideo ? "video" : "image",
        caption: caption.trim() || null,
      });
      if (error) throw error;
      toast.success("Story publicado!");
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao publicar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/" })} className="grid h-10 w-10 place-items-center rounded-full bg-white/5" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">Novo story</h1>
      </header>

      <label className="block relative aspect-[9/16] rounded-3xl overflow-hidden border border-dashed border-white/15 bg-gradient-to-br from-secondary to-background cursor-pointer">
        {preview ? (
          isVideo ? (
            <video src={preview} className="h-full w-full object-cover" muted autoPlay loop playsInline />
          ) : (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <div className="absolute inset-0 grid place-items-center text-center gap-2">
            <div className="grid h-14 w-14 mx-auto place-items-center rounded-full bg-gradient-brand">
              <ImagePlus className="h-6 w-6 text-white" />
            </div>
            <div className="text-sm text-muted-foreground">Toque para escolher foto ou vídeo</div>
          </div>
        )}
        <input
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <Textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={200}
        rows={2}
        placeholder="Legenda (opcional)"
        className="rounded-2xl resize-none glass"
      />
      <div className="text-right text-xs text-muted-foreground">{caption.length}/200</div>

      <Button
        disabled={busy || !file}
        onClick={submit}
        className="w-full h-12 rounded-full bg-gradient-brand hover:opacity-90"
      >
        {busy ? "Publicando…" : "Publicar por 24h"}
      </Button>
    </div>
  );
}
