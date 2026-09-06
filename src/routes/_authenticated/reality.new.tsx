import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowLeft, Camera, DoorOpen, Image as ImageIcon, Palette, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { REALITY_STYLES, PRIVACY_OPTIONS, type RealityPrivacy, type RealityStyle } from "@/lib/reality/catalog";
import { createReality, fileToDataUrl, uploadRealityImage } from "@/lib/reality/api";
import { realityGenerate } from "@/lib/reality/reality.functions";

export const Route = createFileRoute("/_authenticated/reality/new")({
  component: NewReality,
  head: () => ({
    meta: [
      { title: "Criar minha realidade · Vibely Reality" },
      {
        name: "description",
        content: "Escolha uma foto, transforme o ambiente e crie uma sala para receber pessoas na sua realidade.",
      },
      { property: "og:title", content: "Criar minha realidade · Vibely Reality" },
      { property: "og:description", content: "Foto, transformação e sala: crie sua realidade no Vibely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Step = "image" | "style" | "result" | "room";

function NewReality() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const generate = useServerFn(realityGenerate);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("image");
  const [original, setOriginal] = useState<string | null>(null);
  const [style, setStyle] = useState<RealityStyle | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<RealityPrivacy>("public");
  const [creating, setCreating] = useState(false);

  async function pick(file?: File | null) {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setOriginal(dataUrl);
      setGenerated(null);
      setStep("style");
    } catch {
      toast.error("Não conseguimos ler essa imagem.");
    }
  }

  const activePrompt = style ? (style.id === "custom" ? customPrompt : style.prompt) : "";

  async function transform(target?: RealityStyle) {
    const chosen = target ?? style;
    if (!original || !chosen) return;
    const prompt = chosen.id === "custom" ? customPrompt.trim() : chosen.prompt;
    if (prompt.length < 3) {
      toast.error("Descreva como você quer transformar este lugar.");
      return;
    }
    setStyle(chosen);
    setBusy(true);
    setError(null);
    setStep("result");
    try {
      const res = await generate({ data: { image: original, prompt } });
      setGenerated(res.image);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não conseguimos criar sua realidade agora.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRoom() {
    if (!generated || !style) return;
    if (name.trim().length < 2) {
      toast.error("Dê um nome para a sua realidade.");
      return;
    }
    setCreating(true);
    try {
      const [generatedPath, originalPath] = await Promise.all([
        uploadRealityImage(user.id, generated, "gen"),
        original ? uploadRealityImage(user.id, original, "src") : Promise.resolve(null),
      ]);
      const reality = await createReality({
        userId: user.id,
        name: name.trim(),
        description: description.trim(),
        privacy,
        style: style.id,
        prompt: activePrompt,
        originalPath,
        generatedPath,
      });
      toast.success("Sua realidade está no ar.");
      void navigate({ to: "/reality/$id", params: { id: reality.id }, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível criar a sala.");
    } finally {
      setCreating(false);
    }
  }

  const stepIndex = step === "image" ? 0 : step === "style" ? 1 : step === "result" ? 2 : 3;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => history.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-display text-lg font-semibold">Criar minha realidade</h1>
      </div>

      {/* passos */}
      <div className="mt-3 flex items-center gap-2">
        {["Foto", "Transformação", "Realidade", "Sala"].map((label, i) => (
          <div key={label} className="flex flex-1 flex-col gap-1">
            <span
              className={cn(
                "h-1 rounded-full transition-colors",
                i <= stepIndex ? "bg-primary" : "bg-[color:var(--surface-2)]",
              )}
            />
            <span
              className={cn(
                "text-[10px] font-medium uppercase tracking-wide",
                i <= stepIndex ? "text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {step === "image" ? (
        <div className="relative mt-4 overflow-hidden rounded-[26px] border border-border/60 social-card p-6 animate-in fade-in">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full opacity-60 blur-3xl"
            style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 40%, transparent), transparent 70%)" }}
          />
          <div className="relative">
            <p className="text-[17px] font-semibold">Comece por uma foto real</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Um cômodo, a rua, o carro, a varanda — a IA transforma o lugar e mantém o espaço reconhecível.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button size="lg" className="h-14 rounded-2xl shadow-elegant" onClick={() => cameraRef.current?.click()}>
                <Camera className="mr-2 h-5 w-5" /> Tirar foto
              </Button>
              <Button
                size="lg"
                variant="secondary"
                className="h-14 rounded-2xl"
                onClick={() => galleryRef.current?.click()}
              >
                <ImageIcon className="mr-2 h-5 w-5" /> Escolher da galeria
              </Button>
            </div>
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void pick(e.target.files?.[0])}
          />
        </div>
      ) : null}

      {step === "style" && original ? (
        <div className="mt-4 space-y-4 animate-in fade-in">
          <div className="relative overflow-hidden rounded-[26px] border border-border/60">
            <img src={original} alt="Prévia do ambiente" className="aspect-[4/3] w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
            <p className="absolute bottom-3 left-4 text-xs font-medium text-white/85">Sua foto original</p>
          </div>
          <div className="rounded-[26px] border border-border/60 social-card p-5">
            <p className="text-[17px] font-semibold">Como você quer transformar este lugar?</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {REALITY_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void transform(s)}
                  className="group relative overflow-hidden rounded-2xl border border-border/60 bg-[color:var(--surface-2)] px-3 py-4 text-left text-sm font-medium transition-all hover:border-primary/40 active:scale-[0.98]"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-0 blur-2xl transition-opacity group-hover:opacity-70"
                    style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 55%, transparent), transparent 70%)" }}
                  />
                  <span className="relative block text-2xl">{s.emoji}</span>
                  <span className="relative mt-1 block">{s.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Sparkles className="h-4 w-4" /> Criar com IA
              </p>
              <Textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                maxLength={300}
                rows={2}
                placeholder="Ex: transforme este quarto numa boate futurista com luz neon."
                className="mt-2 rounded-xl"
              />
              <Button
                className="mt-2 h-11 w-full rounded-xl"
                onClick={() => void transform({ id: "custom", emoji: "✨", label: "Personalizada", prompt: "" })}
              >
                Transformar
              </Button>
            </div>
            <Button variant="ghost" className="mt-3 w-full rounded-xl" onClick={() => setStep("image")}>
              Escolher outra foto
            </Button>
          </div>
        </div>
      ) : null}

      {step === "result" ? (
        <div className="mt-4 space-y-4 animate-in fade-in">
          {busy ? (
            <div className="relative grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-[26px] border border-border/60 social-card">
              {original ? (
                <img src={original} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover opacity-25 blur-md" />
              ) : null}
              <div className="relative text-center">
                <div className="relative mx-auto h-16 w-16">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                  <span className="absolute inset-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                  <span className="absolute inset-0 grid place-items-center text-xl">{style?.emoji ?? "✨"}</span>
                </div>
                <p className="mt-4 text-sm font-semibold">Criando sua realidade...</p>
                <p className="text-xs text-muted-foreground">A IA está redesenhando o ambiente.</p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-[26px] border border-destructive/40 bg-destructive/5 p-6 text-center">
              <p className="text-[15px] font-semibold">Não conseguimos criar sua realidade agora.</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <Button className="mt-4 h-11 rounded-2xl" onClick={() => void transform()}>
                Tentar novamente
              </Button>
            </div>
          ) : generated ? (
            <>
              <p className="font-display text-xl font-semibold">
                Sua <span className="text-gradient-brand">realidade</span> está pronta.
              </p>
              <div className="relative overflow-hidden rounded-[26px] border border-border/60 shadow-elegant">
                <img src={generated} alt="Sua realidade" className="w-full object-cover" />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button variant="secondary" className="h-12 rounded-2xl" onClick={() => void transform()}>
                  <Sparkles className="mr-2 h-4 w-4" /> Transformar de novo
                </Button>
                <Button variant="secondary" className="h-12 rounded-2xl" onClick={() => setStep("style")}>
                  <Palette className="mr-2 h-4 w-4" /> Outro estilo
                </Button>
                <Button className="h-12 rounded-2xl shadow-elegant" onClick={() => setStep("room")}>
                  <DoorOpen className="mr-2 h-4 w-4" /> Criar sala
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {step === "room" && generated ? (
        <div className="mt-4 space-y-4 animate-in fade-in">
          <img src={generated} alt="Sua realidade" className="h-40 w-full rounded-3xl object-cover" />
          <div className="rounded-3xl border border-border/60 bg-[color:var(--surface)] p-5 space-y-4">
            <div>
              <label className="text-sm font-medium">Nome da realidade</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="Ex: Cinema do Sérgio"
                className="mt-1 h-12 rounded-xl"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={120}
                placeholder="Ex: Vem assistir comigo."
                className="mt-1 h-12 rounded-xl"
              />
            </div>
            <div>
              <p className="text-sm font-medium">Privacidade</p>
              <div className="mt-2 space-y-2">
                {PRIVACY_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPrivacy(o.id)}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                      privacy === o.id
                        ? "border-primary/40 bg-primary/10"
                        : "border-border/60 bg-[color:var(--surface-2)]",
                    )}
                  >
                    <span className="block text-sm font-semibold">{o.label}</span>
                    <span className="block text-xs text-muted-foreground">{o.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <Button className="h-12 w-full rounded-2xl" disabled={creating} onClick={() => void submitRoom()}>
              {creating ? "Criando..." : "CRIAR REALIDADE"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
