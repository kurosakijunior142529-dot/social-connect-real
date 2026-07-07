import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/media";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Users, Megaphone, ImagePlus } from "lucide-react";

const searchSchema = z.object({
  type: z.enum(["group", "channel"]).default("group"),
});

export const Route = createFileRoute("/_authenticated/chats/new")({
  validateSearch: searchSchema,
  component: NewChatPage,
});

function NewChatPage() {
  const { user } = Route.useRouteContext();
  const { type } = Route.useSearch();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const isGroup = type === "group";
  const preview = avatarFile ? URL.createObjectURL(avatarFile) : null;

  async function submit() {
    if (title.trim().length < 2) return toast.error("Título muito curto");
    setBusy(true);
    try {
      let avatar_url: string | null = null;
      if (avatarFile) avatar_url = await uploadMedia("chats", user.id, avatarFile);
      const { data, error } = await (supabase as any)
        .from("chats")
        .insert({
          type,
          title: title.trim(),
          description: description.trim() || null,
          avatar_url,
          owner_id: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success(isGroup ? "Grupo criado" : "Canal criado");
      navigate({ to: "/chats/$id", params: { id: data.id } });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao criar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/messages" })} className="grid h-10 w-10 place-items-center rounded-full bg-white/5" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            Nova {isGroup ? "sala" : "transmissão"}
          </div>
          <h1 className="text-2xl font-display font-black">
            {isGroup ? "Criar grupo" : "Criar canal"}
          </h1>
        </div>
      </header>

      <div className="flex items-center gap-4">
        <label className="cursor-pointer">
          <div className="relative grid h-24 w-24 place-items-center rounded-3xl overflow-hidden bg-gradient-brand text-white shadow-elegant">
            {preview ? (
              <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : isGroup ? (
              <Users className="h-8 w-8" />
            ) : (
              <Megaphone className="h-8 w-8" />
            )}
            <div className="absolute bottom-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-background text-primary">
              <ImagePlus className="h-3 w-3" />
            </div>
          </div>
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="flex-1 text-sm text-muted-foreground">
          {isGroup
            ? "Todos os membros conversam. Você é o dono e pode adicionar admins."
            : "Só você (e admins) publica. Membros só leem e reagem."}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="t">Nome</Label>
        <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} className="rounded-xl" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="d">Descrição</Label>
        <Textarea id="d" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={3} className="rounded-2xl resize-none" />
      </div>

      <Button disabled={busy} onClick={submit} className="w-full h-12 rounded-full bg-gradient-brand hover:opacity-90">
        {busy ? "Criando…" : `Criar ${isGroup ? "grupo" : "canal"}`}
      </Button>
    </div>
  );
}
