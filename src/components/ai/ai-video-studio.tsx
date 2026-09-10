/**
 * Vibely AI Video Studio.
 *
 * Interface dedicada à criação de vídeos por IA: escolha do modelo, prompt com
 * melhoria pela IA, estilos, formato, resolução, duração, áudio, prompt
 * negativo e imagem de referência — só com as opções que a API do modelo
 * escolhido realmente aceita (`ai-video-models.ts`).
 *
 * O custo mostrado é sempre em créditos internos do Vibely.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  X, Sparkles, Loader2, Wand2, ImagePlus, Check, Upload, Volume2, VolumeX,
  ChevronDown, Clapperboard, History, Gem, RotateCcw, Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl } from "@/hooks/use-signed-url";
import {
  VIDEO_MODEL_LIST, VIDEO_MODELS, VIDEO_STYLES, VIDEO_COST_CREDITS,
  allowedDurations, type VideoModelId,
} from "@/lib/ai-video-models";
import { startVideo, checkVideo, enhanceVideoPrompt, videoProviderStatus, publishGenerated } from "@/lib/ai-video.functions";
import { AI_DAILY_LIMITS } from "@/lib/ai-credits";

type Props = {
  threadId: string;
  userId: string | undefined;
  credits: number;
  onClose: () => void;
  onCredits: () => void;
};

type Phase = { state: "idle" } | { state: "working"; seconds: number } | { state: "done"; path: string };

export function AiVideoStudio({ threadId, userId, credits, onClose, onCredits }: Props) {
  const qc = useQueryClient();
  const start = useServerFn(startVideo);
  const check = useServerFn(checkVideo);
  const enhance = useServerFn(enhanceVideoPrompt);
  const status = useServerFn(videoProviderStatus);

  const [model, setModel] = useState<VideoModelId>("veo-3.1");
  const caps = VIDEO_MODELS[model];
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string | null>("cinematic");
  const [aspect, setAspect] = useState(caps.aspectRatios[0]!);
  const [resolution, setResolution] = useState(caps.resolutions[0]!);
  const durations = allowedDurations(caps, resolution);
  const [seconds, setSeconds] = useState(durations[0]!);
  const [audio, setAudio] = useState(true);
  const [negative, setNegative] = useState("");
  const [refImage, setRefImage] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [phase, setPhase] = useState<Phase>({ state: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  const providers = useQuery({ queryKey: ["ai-video-providers"], queryFn: () => status() });
  const available = providers.data?.[model] !== false;

  // Ajusta as opções quando o modelo muda (nada de valor que a API não aceita).
  useEffect(() => {
    const c = VIDEO_MODELS[model];
    setAspect((a) => (c.aspectRatios.includes(a) ? a : c.aspectRatios[0]!));
    setResolution((r) => (c.resolutions.includes(r) ? r : c.resolutions[0]!));
  }, [model]);
  useEffect(() => {
    const list = allowedDurations(VIDEO_MODELS[model], resolution);
    setSeconds((s) => (list.includes(s) ? s : list[list.length - 1]!));
  }, [model, resolution]);

  const history = useQuery({
    queryKey: ["ai-video-history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_generations")
        .select("id, prompt, status, result_path, created_at")
        .eq("kind", "video")
        .order("created_at", { ascending: false })
        .limit(12);
      return (data ?? []) as { id: string; prompt: string; status: string; result_path: string | null; created_at: string }[];
    },
  });

  const usedToday = useMemo(() => {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    return (history.data ?? []).filter((g) => new Date(g.created_at).getTime() > since).length;
  }, [history.data]);

  const enough = credits >= VIDEO_COST_CREDITS;

  async function improve() {
    if (prompt.trim().length < 3) return toast.info("Escreva a ideia do vídeo primeiro");
    setEnhancing(true);
    try {
      const r = await enhance({ data: { prompt: prompt.trim() } });
      setPrompt(r.prompt);
    } catch (e: any) {
      toast.error(String(e?.message ?? "Não consegui melhorar agora").slice(0, 140));
    } finally {
      setEnhancing(false);
    }
  }

  function pickImage(file: File | undefined) {
    if (!file) return;
    if (file.size > 6_000_000) return toast.error("Escolha uma imagem menor que 6 MB");
    const reader = new FileReader();
    reader.onload = () => setRefImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function generate() {
    if (phase.state === "working") return;
    if (prompt.trim().length < 5) return toast.info("Descreva o vídeo com um pouco mais de detalhe");
    setPhase({ state: "working", seconds: 0 });
    const began = Date.now();
    const tick = setInterval(
      () => setPhase({ state: "working", seconds: Math.round((Date.now() - began) / 1000) }),
      1000,
    );
    try {
      const job = await start({
        data: {
          threadId,
          prompt: prompt.trim(),
          model,
          seconds,
          resolution,
          aspectRatio: aspect,
          audio: caps.audio ? audio : false,
          ...(caps.negativePrompt && negative.trim() ? { negativePrompt: negative.trim() } : {}),
          ...(style ? { style } : {}),
          ...(caps.imageReference && refImage ? { imageDataUrl: refImage } : {}),
        },
      });
      qc.invalidateQueries({ queryKey: ["coin-balance", userId] });
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (Date.now() - began > 10 * 60 * 1000) throw new Error("O vídeo está demorando mais que o normal. Ele aparece no histórico quando ficar pronto.");
        await new Promise((r) => setTimeout(r, 6000));
        const r = await check({ data: { generationId: job.generationId } });
        if (r.status === "completed" && r.path) {
          setPhase({ state: "done", path: r.path });
          break;
        }
        if (r.status === "failed") throw new Error(r.error || "A IA não conseguiu gerar esse vídeo. Tente outra descrição.");
      }
      qc.invalidateQueries({ queryKey: ["ai-messages", threadId] });
      qc.invalidateQueries({ queryKey: ["ai-video-history", userId] });
      qc.invalidateQueries({ queryKey: ["coin-balance", userId] });
    } catch (e: any) {
      setPhase({ state: "idle" });
      toast.error(String(e?.message ?? "Não consegui gerar o vídeo").slice(0, 200));
      qc.invalidateQueries({ queryKey: ["coin-balance", userId] });
    } finally {
      clearInterval(tick);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background text-foreground">
      <header className="hairline-b flex items-center gap-3 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] ring-1 ring-primary/30">
          <Clapperboard className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold truncate">Estúdio de vídeo</h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {usedToday}/{AI_DAILY_LIMITS.video} vídeos hoje · {VIDEO_COST_CREDITS} créditos por vídeo
          </p>
        </div>
        <button
          onClick={onCredits}
          className="flex h-9 items-center gap-1.5 rounded-full bg-[color:var(--surface-2)] px-3 text-xs font-semibold ring-1 ring-primary/25"
        >
          <Gem className="h-3.5 w-3.5 text-primary" />
          <span className="tabular">{credits.toLocaleString("pt-BR")}</span>
        </button>
        <button onClick={onClose} aria-label="Fechar estúdio" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)] text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-40 pt-4 space-y-5">
        {/* Palco */}
        <Stage phase={phase} aspect={aspect} onReset={() => setPhase({ state: "idle" })} />

        {/* Modelo */}
        <section className="space-y-2">
          <SectionTitle>Modelo</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {VIDEO_MODEL_LIST.map((m) => {
              const ok = providers.data?.[m.id] !== false;
              const active = model === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={cn(
                    "rounded-2xl p-3 text-left transition ring-1",
                    active ? "bg-[color:var(--surface-2)] ring-primary/40" : "bg-[color:var(--surface)] ring-[color:var(--hairline)]",
                  )}
                >
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <span>{m.emoji}</span>
                    {m.label}
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{m.tagline}</p>
                  {!ok ? (
                    <span className="mt-2 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-400">
                      Ainda não configurado
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {!available ? (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              Este modelo ainda não está liberado neste app. Escolha o outro modelo ou peça ao administrador para ativá-lo.
            </p>
          ) : null}
        </section>

        {/* Prompt */}
        <section className="space-y-2">
          <SectionTitle>Descrição do vídeo</SectionTitle>
          <div className="rounded-3xl bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--hairline)] focus-within:ring-primary/40">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ex.: um skatista atravessando uma cidade neon à noite, câmera acompanhando por trás, chuva fina refletindo as luzes"
              className="min-h-[96px] resize-none border-0 bg-transparent p-0 text-base focus-visible:outline-none focus-visible:ring-0"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{prompt.length}/1000</span>
              <Button size="sm" variant="secondary" className="rounded-full" onClick={improve} disabled={enhancing}>
                {enhancing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
                Melhorar
              </Button>
            </div>
          </div>
        </section>

        {/* Estilos */}
        <section className="space-y-2">
          <SectionTitle>Estilo</SectionTitle>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {VIDEO_STYLES.map((s) => (
              <Chip key={s.id} active={style === s.id} onClick={() => setStyle(style === s.id ? null : s.id)}>
                {s.label}
              </Chip>
            ))}
          </div>
        </section>

        {/* Formato */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <SectionTitle>Formato</SectionTitle>
            <div className="flex gap-2">
              {caps.aspectRatios.map((a) => (
                <Chip key={a} active={aspect === a} onClick={() => setAspect(a)}>{a}</Chip>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <SectionTitle>Qualidade</SectionTitle>
            <div className="flex gap-2">
              {caps.resolutions.map((r) => (
                <Chip key={r} active={resolution === r} onClick={() => setResolution(r)}>{r}</Chip>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <SectionTitle>Duração</SectionTitle>
            <div className="flex gap-2">
              {durations.map((d) => (
                <Chip key={d} active={seconds === d} onClick={() => setSeconds(d)}>{d}s</Chip>
              ))}
            </div>
          </div>
        </section>

        {/* Avançado */}
        <section className="rounded-2xl bg-[color:var(--surface)] ring-1 ring-[color:var(--hairline)]">
          <button onClick={() => setAdvanced((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
            Opções avançadas
            <ChevronDown className={cn("h-4 w-4 transition-transform", advanced && "rotate-180")} />
          </button>
          {advanced ? (
            <div className="space-y-4 border-t border-[color:var(--hairline)] px-4 py-4">
              {caps.audio ? (
                <button onClick={() => setAudio((v) => !v)} className="flex w-full items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    {audio ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                    Gerar áudio junto
                  </span>
                  <span className={cn("h-6 w-11 rounded-full p-0.5 transition", audio ? "bg-primary" : "bg-[color:var(--surface-2)]")}>
                    <span className={cn("block h-5 w-5 rounded-full bg-background transition-transform", audio && "translate-x-5")} />
                  </span>
                </button>
              ) : null}

              {caps.imageReference ? (
                <div className="space-y-2">
                  <SectionTitle>Imagem de referência (primeiro quadro)</SectionTitle>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
                  {refImage ? (
                    <div className="flex items-center gap-3">
                      <img src={refImage} alt="Referência" className="h-16 w-16 rounded-xl object-cover" />
                      <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setRefImage(null)}>Remover</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" className="rounded-full" onClick={() => fileRef.current?.click()}>
                      <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> Escolher imagem
                    </Button>
                  )}
                </div>
              ) : null}

              {caps.negativePrompt ? (
                <div className="space-y-2">
                  <SectionTitle>O que evitar</SectionTitle>
                  <Textarea
                    value={negative}
                    onChange={(e) => setNegative(e.target.value)}
                    rows={2}
                    maxLength={300}
                    placeholder="Ex.: texto na tela, rostos deformados, imagem tremida"
                    className="resize-none rounded-2xl bg-[color:var(--surface-2)]"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Histórico */}
        {history.data?.length ? (
          <section className="space-y-2">
            <SectionTitle>
              <span className="inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Seus vídeos</span>
            </SectionTitle>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {history.data.map((g) => (
                <HistoryCard
                  key={g.id}
                  item={g}
                  onReuse={() => { setPrompt(g.prompt); toast.success("Descrição carregada"); }}
                  onOpen={() => g.result_path && setPhase({ state: "done", path: g.result_path })}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {/* Barra de geração */}
      <div className="hairline-t sticky bottom-0 space-y-2 bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Custo desta geração</span>
          <span className={cn("font-semibold", enough ? "text-foreground" : "text-red-400")}>
            {VIDEO_COST_CREDITS} créditos
          </span>
        </div>
        <Button
          className="h-12 w-full rounded-2xl text-base font-semibold"
          onClick={enough ? generate : onCredits}
          disabled={phase.state === "working" || !available}
        >
          {phase.state === "working" ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando… {phase.seconds}s</>
          ) : !enough ? (
            <>Créditos insuficientes · recarregar</>
          ) : (
            <><Sparkles className="mr-2 h-4 w-4" /> Gerar vídeo</>
          )}
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-2 text-xs font-medium transition ring-1",
        active ? "bg-primary/15 text-foreground ring-primary/40" : "bg-[color:var(--surface)] text-muted-foreground ring-transparent",
      )}
    >
      {children}
    </button>
  );
}

function Stage({ phase, aspect, onReset }: { phase: Phase; aspect: string; onReset: () => void }) {
  const ratio = aspect === "9:16" ? "9 / 16" : aspect === "1:1" ? "1 / 1" : "16 / 9";
  return (
    <div
      className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl bg-black ring-1 ring-[color:var(--hairline)]"
      style={{ aspectRatio: phase.state === "done" ? undefined : ratio, maxHeight: "46vh" }}
    >
      {phase.state === "done" ? (
        <DonePreview path={phase.path} onReset={onReset} />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_65%)]" />
          {phase.state === "working" ? (
            <div className="relative flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium">Criando seu vídeo…</p>
              <p className="text-[11px] text-muted-foreground">{phase.seconds}s · pode levar alguns minutos</p>
            </div>
          ) : (
            <div className="relative flex flex-col items-center gap-2 px-6 text-center">
              <Clapperboard className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium">Sua prévia aparece aqui</p>
              <p className="text-[11px] text-muted-foreground">Descreva a cena, escolha o modelo e toque em Gerar vídeo.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DonePreview({ path, onReset }: { path: string; onReset: () => void }) {
  const url = useSignedUrl("posts", path);
  const publish = useServerFn(publishGenerated);
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const r = await publish({ data: { path, kind: "video" } });
      setDone(true);
      toast.success("Publicado no seu perfil!", {
        action: { label: "Ver", onClick: () => nav({ to: "/p/$id", params: { id: r.postId } }) },
      });
    } catch (e: any) {
      toast.error(String(e?.message ?? "Não consegui publicar").slice(0, 140));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 bg-black p-2">
      {url.data ? (
        <video src={url.data} controls playsInline autoPlay loop className="max-h-[42vh] w-full rounded-2xl bg-black" />
      ) : (
        <div className="h-56 w-full animate-pulse rounded-2xl bg-white/5" />
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="rounded-full" onClick={go} disabled={busy || done}>
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : done ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
          {done ? "Publicado" : "Publicar no Vibely"}
        </Button>
        {url.data ? (
          <Button size="sm" variant="secondary" className="rounded-full" asChild>
            <a href={url.data} download="vibely-ai.mp4"><Download className="mr-1.5 h-3.5 w-3.5" /> Baixar</a>
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="rounded-full" onClick={onReset}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Novo vídeo
        </Button>
      </div>
    </div>
  );
}

function HistoryCard({
  item, onReuse, onOpen,
}: {
  item: { id: string; prompt: string; status: string; result_path: string | null };
  onReuse: () => void;
  onOpen: () => void;
}) {
  const url = useSignedUrl("posts", item.result_path ?? "");
  return (
    <div className="w-36 shrink-0 space-y-1.5">
      <button
        onClick={onOpen}
        className="relative block h-48 w-36 overflow-hidden rounded-2xl bg-black ring-1 ring-[color:var(--hairline)]"
      >
        {item.result_path && url.data ? (
          <video src={url.data} muted playsInline className="h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">
            {item.status === "failed" ? "Falhou" : "Processando…"}
          </span>
        )}
      </button>
      <p className="line-clamp-2 text-[11px] text-muted-foreground">{item.prompt}</p>
      <button onClick={onReuse} className="text-[11px] font-medium text-primary">Usar como base</button>
    </div>
  );
}
