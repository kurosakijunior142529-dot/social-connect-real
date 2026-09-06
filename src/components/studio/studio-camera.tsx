import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, RefreshCw, Timer, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, Row } from "@/components/studio/ui";
import { ASPECTS, type AspectId } from "@/lib/studio/types";
import { cn } from "@/lib/utils";

type Take = { blob: Blob; url: string; duration: number };

const MIMES = [
  "video/mp4;codecs=avc1.4d002a,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function bestMime() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export function StudioCamera({
  aspect,
  onClose,
  onCapture,
}: {
  aspect: AspectId;
  onClose: () => void;
  onCapture: (takes: { blob: Blob; duration: number }[]) => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startRef = useRef(0);

  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [fps, setFps] = useState<30 | 60>(30);
  const [countdown, setCountdown] = useState<0 | 3 | 10>(0);
  const [tick, setTick] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  const ratio = ASPECTS.find((a) => a.id === aspect)?.ratio ?? 9 / 16;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void (async () => {
      stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: fps, max: fps },
          },
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000, channelCount: 1 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        toast.error("Não foi possível acessar a câmera");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facing, fps, stop]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => setElapsed((performance.now() - startRef.current) / 1000), 100);
    return () => window.clearInterval(id);
  }, [recording]);

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = bestMime();
    const rec = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 192_000,
    });
    chunksRef.current = [];
    rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
      const duration = (performance.now() - startRef.current) / 1000;
      setTakes((t) => [...t, { blob, url: URL.createObjectURL(blob), duration }]);
      setRecording(false);
      setElapsed(0);
    };
    recorderRef.current = rec;
    startRef.current = performance.now();
    rec.start(250);
    setRecording(true);
  }, []);

  const toggle = () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!countdown) {
      beginRecording();
      return;
    }
    let left = countdown;
    setTick(left);
    const id = window.setInterval(() => {
      left -= 1;
      setTick(left);
      if (left <= 0) {
        window.clearInterval(id);
        beginRecording();
      }
    }, 1000);
  };

  const confirm = async () => {
    if (!takes.length) return;
    setSaving(true);
    try {
      await onCapture(takes.map((t) => ({ blob: t.blob, duration: t.duration })));
      takes.forEach((t) => URL.revokeObjectURL(t.url));
      stop();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Button size="icon" variant="ghost" className="text-white" onClick={() => { stop(); onClose(); }}>
          <X className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold text-white/90">Câmera</span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="text-white" onClick={() => setFps((f) => (f === 30 ? 60 : 30))}>
            <span className="text-[11px] font-bold">{fps}</span>
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
          <video
            ref={videoRef}
            playsInline
            muted
            className={cn("h-full w-full object-cover", facing === "user" && "-scale-x-100")}
          />
          {!ready && (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/70" />
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
