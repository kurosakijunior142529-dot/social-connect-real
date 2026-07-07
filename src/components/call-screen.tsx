import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
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
  onHangup: () => void;
};

export function CallScreen({ call, localStream, remoteStream, onHangup }: Props) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (localRef.current && localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteStream) {
      remoteRef.current.srcObject = remoteStream;
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

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col">
      {/* Remote */}
      <div className="relative flex-1 overflow-hidden">
        {isVideo ? (
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-cover bg-black"
          />
        ) : (
          <audio ref={remoteRef} autoPlay />
        )}

        {(!isVideo || call.status !== "accepted") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-purple-900 via-pink-900 to-orange-900">
            <UserAvatar
              avatarPath={call.other.avatar_url ?? null}
              displayName={call.other.display_name ?? call.other.username ?? "?"}
              className="h-28 w-28 ring-4 ring-white/20"
            />
            <div className="text-2xl font-semibold">
              {call.other.display_name ?? call.other.username ?? "Usuário"}
            </div>
            <div className="text-sm text-white/70">{statusLabel}</div>
          </div>
        )}

        {isVideo && call.status === "accepted" && (
          <div className="absolute top-4 right-4 text-xs px-3 py-1 rounded-full bg-black/40 backdrop-blur">
            {statusLabel}
          </div>
        )}

        {/* Local PIP */}
        {isVideo && (
          <div className="absolute bottom-4 right-4 w-28 h-40 md:w-40 md:h-56 rounded-2xl overflow-hidden ring-2 ring-white/30 shadow-xl bg-black">
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
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-4 bg-black/60">
        <button
          onClick={toggleMute}
          className={cn(
            "h-14 w-14 rounded-full flex items-center justify-center transition",
            muted ? "bg-white text-black" : "bg-white/15 hover:bg-white/25",
          )}
          aria-label={muted ? "Ativar microfone" : "Silenciar"}
        >
          {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>

        {isVideo && (
          <button
            onClick={toggleCam}
            className={cn(
              "h-14 w-14 rounded-full flex items-center justify-center transition",
              camOff ? "bg-white text-black" : "bg-white/15 hover:bg-white/25",
            )}
            aria-label={camOff ? "Ligar câmera" : "Desligar câmera"}
          >
            {camOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </button>
        )}

        <button
          onClick={onHangup}
          className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-lg shadow-red-900/40"
          aria-label="Encerrar chamada"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
}
