import { useEffect, useRef, useState } from "react";
import { Mic, Square, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/chat-media";

export function AudioRecorder({
  onSend,
  disabled,
}: {
  onSend: (file: File, durationMs: number) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const chunks = useRef<Blob[]>([]);
  const mr = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef<number>(0);
  const timer = useRef<number | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    mr.current = null;
    chunks.current = [];
    setElapsed(0);
    setRecording(false);
  }

  async function start() {
    if (disabled || busy) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.current = s;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
      mr.current = recorder;
      chunks.current = [];
      cancelled.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        const duration = Date.now() - startedAt.current;
        const blob = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
        cleanup();
        if (cancelled.current) return;
        if (blob.size < 500) return; // ignore accidental taps
        setBusy(true);
        try {
          const ext = (recorder.mimeType || "audio/webm").includes("mp4") ? "m4a" : "webm";
          const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
          await onSend(file, duration);
        } finally {
          setBusy(false);
        }
      };
      startedAt.current = Date.now();
      recorder.start(250);
      setRecording(true);
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    } catch (err: any) {
      toast.error(err?.message ?? "Permissão de microfone negada");
      cleanup();
    }
  }

  function stop(cancel = false) {
    cancelled.current = cancel;
    try {
      mr.current?.state !== "inactive" && mr.current?.stop();
    } catch {
      cleanup();
    }
  }

  if (!recording) {
    return (
      <button
        type="button"
        onClick={start}
        disabled={disabled || busy}
        aria-label="Gravar áudio"
        className="p-2 rounded-full active:bg-[color:var(--surface-2)] disabled:opacity-40"
      >
        <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-2 rounded-full bg-destructive/10 border border-destructive/30 px-3 py-1.5">
      <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
      <span className="text-[13px] font-medium text-destructive tabular-nums">
        {formatDuration(elapsed)}
      </span>
      <span className={cn("text-[12px] text-muted-foreground truncate")}>gravando…</span>
      <button
        type="button"
        onClick={() => stop(true)}
        aria-label="Cancelar"
        className="ml-auto p-1.5 rounded-full hover:bg-destructive/20 text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => stop(false)}
        aria-label="Enviar"
        className="p-1.5 rounded-full bg-primary text-primary-foreground"
      >
        <Send className="h-4 w-4" strokeWidth={2.2} />
      </button>
      <button type="button" onClick={() => stop(true)} className="sr-only">
        <Square className="h-4 w-4" />
      </button>
    </div>
  );
}
