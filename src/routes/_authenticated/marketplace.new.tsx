import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { X, ImagePlus, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/marketplace/new")({
  component: NewListing,
});

const FALLBACK_CATS = [
  { id: "electronics", label: "Eletrônicos" },
  { id: "fashion", label: "Moda" },
  { id: "home", label: "Casa" },
  { id: "vehicles", label: "Veículos" },
  { id: "sports", label: "Esportes" },
  { id: "services", label: "Serviços" },
  { id: "other", label: "Outros" },
];

function NewListing() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("other");
  const [condition, setCondition] = useState("used");
  const [city, setCity] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [cats, setCats] = useState<{ id: string; label: string }[]>(FALLBACK_CATS);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (supabase as any)
      .from("listing_categories")
      .select("id, label")
      .order("position")
      .then(({ data }: any) => {
        if (data?.length) setCats(data);
      });
  }, []);

  function pickFiles(fs: FileList | null) {
    if (!fs) return;
    const arr = Array.from(fs).slice(0, 8 - files.length);
    setFiles((prev) => [
      ...prev,
      ...arr.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    ]);
  }

  function removeAt(i: number) {
    setFiles((p) => p.filter((_, j) => j !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return toast.error("Adicione um título.");
    const priceCents = Math.round(parseFloat(price.replace(",", ".") || "0") * 100);
    if (priceCents < 0 || Number.isNaN(priceCents)) return toast.error("Preço inválido.");
    setSaving(true);
    try {
      const { data: listing, error } = await (supabase as any)
        .from("listings")
        .insert({
          seller_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          price_cents: priceCents,
          currency: "BRL",
          category_id: category,
          condition,
          city: city.trim() || null,
          status: "active",
        })
        .select("id")
        .single();
      if (error || !listing) throw new Error(error?.message ?? "Falha ao criar");

      // upload images
      for (let i = 0; i < files.length; i++) {
        const f = files[i].file;
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("marketplace")
          .upload(path, f, { contentType: f.type, upsert: false });
        if (upErr) continue;
        await (supabase as any).from("listing_images").insert({
          listing_id: listing.id,
          storage_path: path,
          position: i,
        });
      }
      toast.success("Anúncio publicado!");
      navigate({ to: "/marketplace/$id", params: { id: listing.id } });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao publicar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-20 glass-heavy hairline-b flex items-center gap-2 px-3 h-12">
        <Link
          to="/marketplace"
          className="p-2 -ml-1 rounded-full active:bg-[color:var(--surface-2)]"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-[17px] font-display font-semibold">Novo anúncio</h1>
      </header>

      <form onSubmit={submit} className="p-4 space-y-4">
        <div>
          <Label>Fotos ({files.length}/8)</Label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                <img src={f.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/70 grid place-items-center"
                >
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            ))}
            {files.length < 8 ? (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-[color:var(--hairline)] grid place-items-center text-muted-foreground hover:bg-[color:var(--surface)]"
              >
                <ImagePlus className="h-6 w-6" />
              </button>
            ) : null}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => pickFiles(e.target.files)}
          />
        </div>

        <div>
          <Label>Título *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Preço (R$)</Label>
            <Input
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Categoria</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 rounded-md bg-[color:var(--surface-2)] px-3 text-sm"
            >
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Condição</Label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="w-full h-10 rounded-md bg-[color:var(--surface-2)] px-3 text-sm"
            >
              <option value="new">Novo</option>
              <option value="used">Usado</option>
              <option value="refurbished">Recondicionado</option>
            </select>
          </div>
        </div>

        <div>
          <Label>Descrição</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={4000}
            placeholder="Detalhes, estado, forma de entrega…"
          />
        </div>

        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Publicando…" : "Publicar anúncio"}
        </Button>
      </form>
    </div>
  );
}
