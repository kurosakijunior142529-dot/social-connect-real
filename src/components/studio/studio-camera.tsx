import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RefreshCw, Sparkles, Timer, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, Row } from "@/components/studio/ui";
import { ArCanvas } from "@/components/ar/ar-canvas";
import { ArEffectTray } from "@/components/ar/ar-effect-tray";
import { useArEngine } from "@/hooks/use-ar-engine";
import { ASPECTS, type AspectId } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

type Take = { blob: Blob; url: string; duration: number };

export function StudioCamera({
  aspect,
  onClose,
  onCapture,
}: {
  aspect: AspectId;
  onClose: () => void;
  onCapture: (takes: { blob: Blob; duration: number }[]) => Promise<void> | void;
}) {
  const startRef = useRef(0);

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [fps, setFps] = useState<30 | 60>(30);
  const [countdown, setCountdown] = useState<0 | 3 | 10>(0);
  const [tick, setTick] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [saving, setSaving] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);

  const ar = useArEngine({ facing, fps });
  const ready = ar.status === "ready" || ar.status === "loading-effect" || ar.status === "recording";
  const ratio = ASPECTS.find((a) => a.id === aspect)?.ratio ?? 9 / 16;

  useEffect(() => {
    if (ar.errorKind === "permission-denied") toast.error("Permissão de câmera negada. Libere o acesso nas configurações do navegador.");
    else if (ar.errorKind === "camera-unavailable") toast.error("Não foi possível acessar a câmera");
    else if (ar.errorKind === "effect-incompatible") toast.error("Este efeito não funciona no seu aparelho");
  }, [ar.errorKind]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsed((performance.now() - startRef.current) / 1000), 100);
    return () => window.clearInterval(id);
  }, [recording]);

  const beginRecording = useCallback(async () => {
    const engine = ar.engine;
    if (!engine) return;
    try {
      await engine.startRecording();
      startRef.current = performance.now();
      setRecording(true);
    } catch {
      toast.error("Não foi possível iniciar a gravação");
    }
  }, [ar.engine]);

  const finishRecording = useCallback(async () => {
    const engine = ar.engine;
    if (!engine) return;
    try {
      const rec = await engine.stopRecording();
      setTakes((t) => [...t, { blob: rec.blob, url: URL.createObjectURL(rec.blob), duration: rec.duration }]);
    } catch {
      /* nada gravado */
    } finally {
      setRecording(false);
      setElapsed(0);
    }
  }, [ar.engine]);

  const toggle = () => {
    if (recording) {
      void finishRecording();
      return;
    }
    if (!countdown) {
      void beginRecording();
      return;
    }
    let left = countdown;
    setTick(left);
    const id = window.setInterval(() => {
      left -= 1;
      setTick(left);
      if (left <= 0) {
        window.clearInterval(id);
        void beginRecording();
      }
    }, 1000);
  };

  const confirm = async () => {
    if (!takes.length) return;
    setSaving(true);
    try {
      await onCapture(takes.map((t) => ({ blob: t.blob, duration: t.duration })));
      takes.forEach((t) => URL.revokeObjectURL(t.url));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Button size="icon" variant="ghost" className="text-white" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold text-white/90">Câmera</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="text-white" onClick={() => setFps((f) => (f === 30 ? 60 : 30))}>
            <span className="text-[11px] font-bold">{fps}</span>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className={cn("text-white", trayOpen && "text-primary")}
            onClick={() => setTrayOpen((v) => !v)}
            aria-label="Efeitos"
          >
            <Sparkles className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="ghost" className="text-white" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}>
            <RefreshCw className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3">
        <div
          className="relative w-full overflow-hidden rounded-3xl bg-neutral-900 shadow-2xl"
          style={{ aspectRatio: `${ratio}`, maxHeight: "100%", width: "auto", height: "100%" }}
        >
          <ArCanvas engine={ar.engine} engineVersion={ar.engineVersion} className="h-full w-full [&>canvas]:h-full [&>canvas]:w-full [&>canvas]:object-cover" />
          {!ready && (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
            </div>
          )}
          {ar.status === "loading-effect" && (
            <div className="absolute inset-x-0 top-3 flex justify-center">
              <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/80 backdrop-blur">Carregando efeito…</span>
            </div>
          )}
          {tick > 0 && !recording && (
            <div className="absolute inset-0 grid place-items-center bg-black/40 text-6xl font-black text-white">{tick}</div>
          )}
          {recording && (
            <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              {elapsed.toFixed(1)}s
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {trayOpen && (
          <div className="space-y-2">
            {!ar.lensesAvailable && (
              <p className="px-1 text-[11px] text-white/60">
                Os efeitos AR ainda não foram configurados nesta conta — a câmera segue funcionando no modo Normal.
              </p>
            )}
            <ArEffectTray
              effects={ar.effects}
              active={ar.effect}
              onSelect={(e) => void ar.selectEffect(e)}
              disabled={!ready || recording}
            />
          </div>
        )}

        <Row className="justify-center">
          {([0, 3, 10] as const).map((c) => (
            <Chip key={c} active={countdown === c} onClick={() => setCountdown(c)}>
              <span className="flex items-center gap-1">
                {c === 0 ? <Zap className="h-3 w-3" /> : <Timer className="h-3 w-3" />}
                {c === 0 ? "Direto" : `${c}s`}
              </span>
            </Chip>
          ))}
        </Row>

        {!!takes.length && (
          <Row>
            {takes.map((t, i) => (
              <div key={i} className="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-[10px] text-white/80">
                Tomada {i + 1} · {t.duration.toFixed(1)}s
              </div>
            ))}
            <button
              type="button"
              className="shrink-0 rounded-lg border border-white/20 px-2 py-1 text-[10px] text-white/60"
              onClick={() => {
                takes.forEach((t) => URL.revokeObjectURL(t.url));
                setTakes([]);
              }}
            >
              Limpar
            </button>
          </Row>
        )}

        <div className="flex items-center justify-between">
          <div className="w-20 text-[11px] text-white/60">{takes.length ? `${takes.length} tomada(s)` : "Grave quantas quiser"}</div>
          <button
            type="button"
            onClick={toggle}
            disabled={!ready}
            className={cn(
              "grid h-[70px] w-[70px] place-items-center rounded-full border-4 border-white/80 transition",
              recording ? "bg-red-500" : "bg-white/10",
            )}
          >
            {recording ? <span className="h-6 w-6 rounded-md bg-white" /> : <Camera className="h-7 w-7 text-white" />}
          </button>
          <div className="flex w-20 justify-end">
            <Button size="sm" disabled={!takes.length || saving} onClick={() => void confirm()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
