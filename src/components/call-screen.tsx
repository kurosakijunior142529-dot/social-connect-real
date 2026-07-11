import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  RotateCcw,
  SignalHigh,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

type Props = {
  call: {
    id: string;
    type: "audio" | "video";
    role: "caller" | "callee";
    status: string;
    other: {
      id: string;
      username?: string | null;
      display_name?: string | null;
      avatar_url?: string | null;
    };
  };
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionLabel: string;
  onSwitchCamera: () => void | Promise<void>;
  onHangup: () => void;
};

export function CallScreen({
  call,
  localStream,
  remoteStream,
  connectionLabel,
  onSwitchCamera,
  onHangup,
}: Props) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (localRef.current && localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteStream) {
      remoteRef.current.srcObject = remoteStream;
      // muted: audio playback is handled by the provider's hidden <audio> sink
      remoteRef.current.muted = true;
      remoteRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  useEffect(() => {
    if (call.status !== "accepted") return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [call.status]);

  function toggleMute() {
    if (!localStream) return;
    const enabled = !muted;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !enabled));
    setMuted(enabled);
  }
  function toggleCam() {
    if (!localStream) return;
    const off = !camOff;
    localStream.getVideoTracks().forEach((t) => (t.enabled = !off));
    setCamOff(off);
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const statusLabel =
    call.status === "ringing"
      ? call.role === "caller"
        ? "Chamando…"
        : "Conectando…"
      : call.status === "accepted"
        ? `${mm}:${ss}`
        : call.status;

  const isVideo = call.type === "video";
  const displayName = call.other.display_name ?? call.other.username ?? "Usuário";
  const hasRemote = !!remoteStream?.getTracks().length;

  return (
    <div className="fixed inset-0 z-[100] bg-background text-foreground flex flex-col">
      {/* Remote */}
      <div className="relative flex-1 overflow-hidden bg-[#050506]">
        {isVideo ? (
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 h-full w-full object-cover bg-black transition-opacity duration-300",
              hasRemote ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null}
        {/* Audio playback of the remote stream is handled by the CallProvider's hidden <audio> element. */}

        {(!isVideo || call.status !== "accepted" || !hasRemote) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_50%_20%,rgba(215,255,58,0.12),transparent_38%),linear-gradient(180deg,#111113,#050506)]">
            <div className="relative">
              <span className="absolute inset-[-18px] rounded-full border border-primary/25 animate-ping" />
              <UserAvatar
                avatarPath={call.other.avatar_url ?? null}
                displayName={displayName}
                className="h-28 w-28 ring-2 ring-primary/30 shadow-2xl"
              />
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-semibold">{displayName}</div>
              <div className="text-sm text-muted-foreground tabular-nums">{statusLabel}</div>
            </div>
          </div>
        )}

        <div className="absolute left-4 right-4 top-4 flex items-center justify-between gap-3 pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-xs text-white backdrop-blur-md">
            <SignalHigh className="h-3.5 w-3.5 text-primary" />
            <span>{connectionLabel}</span>
          </div>
          <div className="rounded-full bg-black/45 px-3 py-1.5 text-xs text-white tabular-nums backdrop-blur-md">
            {statusLabel}
          </div>
        </div>

        {!isVideo ? (
          <div className="absolute bottom-36 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/30 px-4 py-2 text-xs text-white/80 backdrop-blur-md">
            <Radio className="h-4 w-4 text-primary" />
            <span>Viva-voz {speakerOn ? "ativo" : "silenciado"}</span>
          </div>
        ) : null}

        {/* Local PIP */}
        {isVideo && (
          <div className="absolute bottom-5 right-4 w-28 h-40 md:w-40 md:h-56 rounded-[24px] overflow-hidden ring-1 ring-white/20 shadow-2xl bg-black">
            <video
              ref={localRef}
              autoPlay
              playsInline
              muted
              className={cn("h-full w-full object-cover", camOff && "opacity-0")}
            />
            {camOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-xs">
                Câmera off
              </div>
            )}
            <button
              type="button"
              onClick={onSwitchCamera}
              className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur active:scale-95"
              aria-label="Alternar câmera"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="hairline-t bg-[color:var(--surface)]/95 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
        <div className="mx-auto mb-4 flex max-w-sm items-center gap-3 rounded-full bg-[color:var(--surface-2)] px-4 py-2">
          <VolumeX className="h-4 w-4 text-muted-foreground" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            defaultValue="1"
            aria-label="Volume da chamada"
            className="min-w-0 flex-1 accent-primary"
            onChange={(e) => {
              const volume = Number(e.currentTarget.value);
              document.querySelectorAll("audio, video").forEach((el) => {
                (el as HTMLMediaElement).volume = volume;
              });
              setSpeakerOn(volume > 0);
            }}
          />
          <Volume2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex items-center justify-center gap-4">
        <button
          onClick={toggleMute}
          className={cn(
            "h-14 w-14 rounded-full flex items-center justify-center transition active:scale-95",
            muted ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)] hover:bg-accent",
          )}
          aria-label={muted ? "Ativar microfone" : "Silenciar"}
        >
          {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>

        {isVideo && (
          <button
            onClick={toggleCam}
            className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center transition active:scale-95",
              camOff ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)] hover:bg-accent",
            )}
            aria-label={camOff ? "Ligar câmera" : "Desligar câmera"}
          >
            {camOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </button>
        )}

        <button
          onClick={() => {
            const next = !speakerOn;
            setSpeakerOn(next);
            // Toggle volume on all audio elements (speakerphone on mobile is approximated
            // by adjusting output; true routing needs setSinkId with a real speaker device).
            document.querySelectorAll("audio, video").forEach((el) => {
              (el as HTMLMediaElement).volume = next ? 1 : 0;
            });
          }}
          className={cn(
            "h-14 w-14 rounded-full flex items-center justify-center transition active:scale-95",
            speakerOn ? "bg-[color:var(--surface-2)] hover:bg-accent" : "bg-primary text-primary-foreground",
          )}
          aria-label={speakerOn ? "Silenciar alto-falante" : "Ativar alto-falante"}
        >
          {speakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
        </button>

        {isVideo ? (
          <button
            onClick={onSwitchCamera}
            className="h-14 w-14 rounded-full bg-[color:var(--surface-2)] flex items-center justify-center transition hover:bg-accent active:scale-95"
            aria-label="Alternar câmera frontal/traseira"
          >
            <Camera className="h-6 w-6" />
          </button>
        ) : null}

        <button
          onClick={onHangup}
          className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg shadow-red-900/40"
          aria-label="Encerrar chamada"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
        </div>
      </div>
    </div>
  );
}
