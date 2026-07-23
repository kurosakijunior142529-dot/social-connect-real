import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createLive } from "@/lib/lives.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Radio, Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadImage } from "@/lib/media";

export const Route = createFileRoute("/_authenticated/lives/new")({
  head: () => ({
    meta: [
      { title: "Nova live — Vibely" },
      { name: "description", content: "Configure e inicie sua transmissão ao vivo." },
      { property: "og:title", content: "Nova live — Vibely" },
      { property: "og:description", content: "Configure e inicie sua transmissão ao vivo." },
    ],
  }),
  component: NewLive,
});

const CATEGORIES = [
  "Bate-papo",
  "Jogos",
  "Música",
  "Arte",
  "Esportes",
  "Notícias",
  "Educação",
  "Tecnologia",
  "Lifestyle",
  "Viagem",
];

function NewLive() {
  const navigate = useNavigate();
  const create = useServerFn(createLive);
  const [busy, setBusy] = useState(false);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Bate-papo",
    tags: "",
    language: "pt-BR",
    audience: "public" as "public" | "followers" | "friends" | "private" | "subs_only",
    age_restricted: false,
    allow_guests: true,
    auto_record: true,
  });

  const onPickThumb = (f: File | null) => {
    setThumbFile(f);
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Dê um título à sua live.");
      return;
    }
    setBusy(true);
    try {
      let thumbnail_url: string | undefined;
      if (thumbFile) {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          try {
            const path = await uploadImage("covers", u.user.id, thumbFile);
            const { data: signed } = await supabase.storage.from("covers").createSignedUrl(path, 60 * 60 * 24 * 30);
            thumbnail_url = signed?.signedUrl;
          } catch {
            /* skip thumb */
          }
        }
      }
      const res = await create({
        data: {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          category: form.category,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10),
          language: form.language,
          audience: form.audience,
          age_restricted: form.age_restricted,
          allow_guests: form.allow_guests,
          auto_record: form.auto_record,
          thumbnail_url,
        },
      });
      navigate({ to: "/live/$id", params: { id: res.liveId }, search: { host: 1 } as any });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao criar a live");
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <button onClick={() => navigate({ to: "/lives" })} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </button>

      <header className="space-y-1">
        <div className="flex items-center gap-2 text-primary text-[11px] uppercase tracking-[0.2em] font-semibold">
          <Radio className="h-3.5 w-3.5" /> Nova live
        </div>
        <h1 className="text-2xl font-bold">Configure sua transmissão</h1>
        <p className="text-sm text-muted-foreground">Tudo pode ser alterado depois. Você configura câmera, microfone e tela na próxima tela.</p>
      </header>

      <form onSubmit={submit} className="space-y-5 rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-5">
        <div className="space-y-1.5">
          <Label>Miniatura (opcional)</Label>
          <div className="flex items-center gap-3">
            <label className="relative flex items-center justify-center w-32 h-20 rounded-xl border-2 border-dashed border-[color:var(--hairline)] hover:border-primary bg-[color:var(--surface-2)] cursor-pointer overflow-hidden">
              {thumbPreview ? (
                <img src={thumbPreview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-muted-foreground">Escolher</span>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPickThumb(e.target.files?.[0] ?? null)} />
            </label>
            {thumbFile && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onPickThumb(null)}>
                Remover
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Ex.: Jogando com os inscritos"
            maxLength={120}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="desc">Descrição</Label>
          <Textarea
            id="desc"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Sobre o que é a transmissão?"
            maxLength={1000}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full h-10 rounded-md bg-background border border-input px-3 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Idioma</Label>
            <select
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className="w-full h-10 rounded-md bg-background border border-input px-3 text-sm"
            >
              <option value="pt-BR">Português (BR)</option>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Tags (separadas por vírgula)</Label>
          <Input
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="gaming, fifa, brasil"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Público</Label>
          <select
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value as any })}
            className="w-full h-10 rounded-md bg-background border border-input px-3 text-sm"
          >
            <option value="public">Público</option>
            <option value="followers">Seguidores</option>
            <option value="friends">Amigos</option>
            <option value="subs_only">Apenas inscritos</option>
            <option value="private">Privada (apenas com link)</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ToggleRow label="Conteúdo adulto" checked={form.age_restricted} onChange={(v) => setForm({ ...form, age_restricted: v })} />
          <ToggleRow label="Permitir convidados" checked={form.allow_guests} onChange={(v) => setForm({ ...form, allow_guests: v })} />
          <ToggleRow label="Gravar automaticamente" checked={form.auto_record} onChange={(v) => setForm({ ...form, auto_record: v })} />
        </div>

        <Button type="submit" disabled={busy} className="w-full rounded-full h-11 gap-2 shadow-elegant">
          <Sparkles className="h-4 w-4" />
          {busy ? "Criando…" : "Continuar para o estúdio"}
        </Button>
      </form>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-[color:var(--hairline)] bg-background px-3 py-2">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
