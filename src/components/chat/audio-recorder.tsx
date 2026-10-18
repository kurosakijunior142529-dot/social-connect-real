import { useEffect, useRef, useState } from "react";
import { Mic, Send, Trash2, LockKeyhole, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/chat-media";
import { Button } from "@/components/ui/button";

export function AudioRecorder({ onSend, disabled }: {
  onSend: (file: File, durationMs: number) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const starting = useRef(false);
  const pendingStop = useRef<"send" | "cancel" | null>(null);
  const cancelled = useRef(false);
  const lockedRef = useRef(false);
  const gesture = useRef<{ x: number; y: number; held: boolean } | null>(null);

  function releaseTracks() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelled.current = true;
      if (holdTimer.current) clearTimeout(holdTimer.current);
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        if (recorder.state !== "inactive") recorder.stop();
      }
      releaseTracks();
    };
  }, []);

  function stop(cancel = false) {
    cancelled.current = cancel;
    if (starting.current) { pendingStop.current = cancel ? "cancel" : "send"; return; }
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  async function start(lock: boolean) {
    if (disabled || busy || starting.current || recorderRef.current) return;
    starting.current = true;
    pendingStop.current = null;
    cancelled.current = false;
    lockedRef.current = lock;
    setLocked(lock);
    setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Este navegador não permite gravar áudio");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 },
      } });
      if (!mounted.current || pendingStop.current === "cancel") {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mime = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { audioBitsPerSecond: 128_000, ...(mime ? { mimeType: mime } : {}) });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        const duration = Date.now() - startedAt;
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const discard = cancelled.current;
        releaseTracks();
        if (!mounted.current) return;
        setRecording(false); setLocked(false); setElapsed(0);
        if (discard || blob.size < 500) return;
        setBusy(true);
        try {
          const ext = /mp4|aac/i.test(blob.type) ? "m4a" : "webm";
          await onSend(new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type }), duration);
        } catch { toast.error("Não foi possível enviar o áudio"); }
        finally { if (mounted.current) setBusy(false); }
      };
      recorder.start(250);
      setRecording(true); setElapsed(0);
      timer.current = setInterval(() => setElapsed(Date.now() - startedAt), 250);
      starting.current = false;
      if (pendingStop.current) stop(pendingStop.current === "cancel");
    } catch (error) {
      releaseTracks();
      if (mounted.current) {
        setRecording(false);
        toast.error(error instanceof Error ? error.message : "Não foi possível acessar o microfone");
      }
    } finally { starting.current = false; if (mounted.current) setBusy(false); }
  }

  return (
    <div data-swipe-lock className={cn("relative shrink-0", recording && "flex min-w-0 flex-1 items-center gap-2")}>
      {recording && <>
        <span className="h-2 w-2 shrink-0 rounded-full bg-destructive motion-safe:animate-pulse" />
        <span role="status" className="text-xs tabular-nums text-foreground">{formatDuration(elapsed)}</span>
        {locked && <LockKeyhole aria-label="Gravação travada" className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <Button type="button" variant="ghost" size="icon" className="ml-auto shrink-0 rounded-full text-destructive"
          onClick={() => stop(true)} aria-label="Cancelar áudio" title="Cancelar áudio"><Trash2 /></Button>
        <Button type="button" size="icon" className="shrink-0 rounded-full" onClick={() => stop()} aria-label="Enviar áudio" title="Enviar áudio"><Send /></Button>
      </>}
      {recording && !locked && <span aria-hidden className="pointer-events-none absolute bottom-14 right-1 flex flex-col items-center gap-1 rounded-full border border-border bg-background p-2 text-muted-foreground shadow-sm"><LockKeyhole className="h-4 w-4" /><ChevronUp className="h-4 w-4" /></span>}
      <Button type="button" variant="ghost" size="icon"
        disabled={disabled || busy} aria-label={recording ? "Travar gravação" : "Gravar áudio"}
        title={recording ? "Travar gravação" : "Gravar áudio"}
        className={cn("audio-record-trigger h-10 w-10 shrink-0 touch-none rounded-full bg-chat-mine text-chat-mine-foreground glow-chat", recording && locked && "hidden")}
        onPointerDown={(event) => {
          if (recording || busy || disabled || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          gesture.current = { x: event.clientX, y: event.clientY, held: false };
          holdTimer.current = setTimeout(() => {
            if (!gesture.current) return;
            gesture.current.held = true;
            void start(false);
          }, 180);
        }}
        onPointerMove={(event) => {
          const origin = gesture.current;
          if (!origin?.held || lockedRef.current) return;
          if (event.clientY - origin.y < -64) {
            lockedRef.current = true; setLocked(true);
            navigator.vibrate?.(10);
          } else if (event.clientX - origin.x < -80) { gesture.current = null; stop(true); }
        }}
        onPointerUp={() => {
          if (holdTimer.current) clearTimeout(holdTimer.current);
          const origin = gesture.current;
          gesture.current = null;
          if (origin?.held && !lockedRef.current) stop();
        }}
        onPointerCancel={() => {
          if (holdTimer.current) clearTimeout(holdTimer.current);
          gesture.current = null;
          if (!lockedRef.current) stop(true);
        }}
        onClick={() => {
          if (lockedRef.current && recorderRef.current) return;
          if (recording) { lockedRef.current = true; setLocked(true); return; }
          if (!busy) void start(true);
        }}>
        {busy ? <Loader2 className="animate-spin" /> : <Mic />}
      </Button>
    </div>
  );
}
