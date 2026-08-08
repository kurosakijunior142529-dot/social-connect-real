import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Languages,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  RotateCcw,
  SignalHigh,
  Sparkles,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CALL_LANGUAGES, useAudioLevel } from "@/components/call-audio-level";
import type { CallCaption } from "@/components/call-provider";

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
  mediaConnected: boolean;
  captions: CallCaption[];
  translationEnabled: boolean;
  translationLanguage: string;
  onToggleTranslation: () => void;
  onTranslationLanguageChange: (language: string) => void;
  onRetryCaption: (id: string) => void;

  onSwitchCamera: () => void | Promise<void>;
  onMinimize?: () => void;
  onHangup: () => void;
};

type PanelMode = "expanded" | "compact" | "hidden";

export function CallScreen({
  call,
  localStream,
  remoteStream,
  connectionLabel,
  mediaConnected,
  captions,
  translationEnabled,
  translationLanguage,
  onToggleTranslation,
  onTranslationLanguageChange,
  onRetryCaption,

  onSwitchCamera,
  onMinimize,
  onHangup,
}: Props) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const captionsRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [panel, setPanel] = useState<PanelMode>("compact");

  const localLevel = useAudioLevel(muted ? null : localStream);
  const remoteLevel = useAudioLevel(remoteStream);
  const speaking = mediaConnected
    ? remoteLevel > 0.12
      ? "other"
      : localLevel > 0.12
        ? "me"
        : null
    : null;
  const level = Math.max(localLevel, remoteLevel);

  useEffect(() => {
    if (localRef.current && localStream) localRef.current.srcObject = localStream;
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

  useEffect(() => {
    if (panel === "expanded" && captionsRef.current) {
      captionsRef.current.scrollTop = captionsRef.current.scrollHeight;
    }
  }, [captions, panel]);

  useEffect(() => {
    if (translationEnabled && panel === "hidden") setPanel("compact");
  }, [translationEnabled]);

  function toggleMute() {
    if (!localStream) return;
    const next = !muted;
    localStream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
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
  const visibleCaptions = useMemo(
    () => (panel === "expanded" ? captions.slice(-40) : captions.slice(-2)),
    [captions, panel],
  );

  const auraScale = 1 + level * 0.22;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#05070a] text-white">
      {/* Animated ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-[55vh] w-[55vh] rounded-full bg-primary/25 blur-[120px] animate-[pulse_6s_ease-in-out_infinite]" />
        <div className="absolute -right-24 top-1/3 h-[45vh] w-[45vh] rounded-full bg-emerald-400/20 blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 left-1/4 h-[40vh] w-[40vh] rounded-full bg-cyan-400/15 blur-[130px] animate-[pulse_10s_ease-in-out_infinite]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
      </div>

      {/* Stage */}
      <div className="relative flex-1 overflow-hidden">
        {isVideo ? (
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
              hasRemote ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null}

        {(!isVideo || call.status !== "accepted" || !hasRemote) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 px-6">
            <div className="relative grid place-items-center">
              {/* Reactive sound waves */}
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="absolute rounded-full border border-primary/40"
                  style={{
                    width: `${11 + i * 3.5}rem`,
                    height: `${11 + i * 3.5}rem`,
                    opacity: 0.15 + level * (0.7 - i * 0.18),
                    transform: `scale(${1 + level * (0.18 - i * 0.04)})`,
                    transition: "transform 120ms ease-out, opacity 160ms ease-out",
                  }}
                />
              ))}
              <span
                className="absolute rounded-full bg-primary/30 blur-2xl"
                style={{
                  width: "13rem",
                  height: "13rem",
                  transform: `scale(${auraScale})`,
                  opacity: 0.35 + level * 0.5,
                  transition: "transform 120ms ease-out, opacity 160ms ease-out",
                }}
              />
              <span className="absolute h-[11rem] w-[11rem] animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite] rounded-full border border-primary/30" />
              <div
                className="relative rounded-full p-[3px]"
                style={{
                  background: "conic-gradient(from 0deg, var(--primary), transparent 55%, var(--primary))",
                  boxShadow: `0 0 ${20 + level * 60}px color-mix(in oklab, var(--primary) ${35 + level * 45}%, transparent)`,
                  transform: `scale(${1 + level * 0.05})`,
                  transition: "transform 120ms ease-out, box-shadow 160ms ease-out",
                }}
              >
                <UserAvatar
                  avatarPath={call.other.avatar_url ?? null}
                  displayName={displayName}
                  className="h-32 w-32 border-2 border-black/40"
                />
              </div>
            </div>

            <div className="space-y-2 text-center">
              <h1 className="text-3xl font-bold tracking-tight drop-shadow-lg">{displayName}</h1>
              {call.other.username ? (
                <p className="text-sm text-white/50">@{call.other.username}</p>
              ) : null}
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur-md">
                <span className={cn("h-2 w-2 rounded-full", call.status === "accepted" ? "bg-primary" : "bg-amber-400 animate-pulse")} />
                <span className="tabular-nums">{statusLabel}</span>
              </div>
              {speaking ? (
                <p className="animate-in fade-in text-xs uppercase tracking-widest text-primary">
                  {speaking === "me" ? "Você está falando" : `${displayName} está falando`}
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-3 pt-[env(safe-area-inset-top)]">
          {onMinimize ? (
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimizar chamada"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/10 backdrop-blur-md transition active:scale-90"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          ) : <span />}
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs backdrop-blur-md">
            <SignalHigh className="h-3.5 w-3.5 text-primary" />
            <span>{connectionLabel}</span>
          </div>
        </div>

        {/* Local PIP */}
        {isVideo && (
          <div className="absolute bottom-5 right-4 h-40 w-28 overflow-hidden rounded-[26px] bg-black shadow-2xl ring-1 ring-white/20 md:h-56 md:w-40">
            <video ref={localRef} autoPlay playsInline muted className={cn("h-full w-full object-cover", camOff && "opacity-0")} />
            {camOff && (
              <div className="absolute inset-0 grid place-items-center bg-white/10 text-xs text-white/70">Câmera off</div>
            )}
            <button
              type="button"
              onClick={onSwitchCamera}
              className="absolute bottom-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/55 backdrop-blur transition active:scale-90"
              aria-label="Alternar câmera"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Translation panel */}
      {panel !== "hidden" ? (
        <div
          className={cn(
            "relative z-10 mx-3 mb-2 overflow-hidden rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl transition-all duration-300 animate-in slide-in-from-bottom-4 fade-in",
            panel === "expanded" ? "max-h-[25vh]" : "max-h-32",
          )}
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
            <Languages className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
              Tradução ao vivo {translationEnabled ? "" : "(desligada)"}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPanel(panel === "expanded" ? "compact" : "expanded")}
                aria-label={panel === "expanded" ? "Minimizar tradução" : "Expandir tradução"}
                className="grid h-7 w-7 place-items-center rounded-full bg-white/10 transition active:scale-90"
              >
                {panel === "expanded" ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => setPanel("hidden")}
                aria-label="Ocultar tradução"
                className="grid h-7 w-7 place-items-center rounded-full bg-white/10 transition active:scale-90"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div
            ref={captionsRef}
            className={cn("space-y-2 overflow-y-auto px-3 py-2", panel === "expanded" ? "max-h-[19vh]" : "max-h-20")}
            aria-live="polite"
          >
            {visibleCaptions.length === 0 ? (
              <p className="py-2 text-center text-xs text-white/50">
                 {!mediaConnected
                   ? "Aguardando conexão"
                   : translationEnabled
                     ? "Ouvindo a conversa…"
                     : "Ative a tradução para ver as falas aqui."}
              </p>
            ) : (
              visibleCaptions.map((caption) => (
                <div key={caption.id} className="animate-in fade-in slide-in-from-bottom-2 rounded-xl bg-black/25 px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {caption.speaker === "me" ? "Você" : displayName}
                  </div>
                  <p className="text-xs text-white/50">{caption.original}</p>
                  <p className="text-sm font-semibold">
                    {caption.translated ?? <span className="text-white/60">traduzindo…</span>}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {/* Controls */}
      <div className="relative z-10 border-t border-white/10 bg-black/40 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] backdrop-blur-2xl">
        <div className="mx-auto mb-4 flex max-w-sm items-center gap-2">
          <button
            type="button"
            onClick={onToggleTranslation}
            className={cn(
              "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition active:scale-95",
              translationEnabled
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                : "border border-white/10 bg-white/10",
            )}
          >
            {translationEnabled ? <Sparkles className="h-4 w-4" /> : <Languages className="h-4 w-4" />}
            {translationEnabled ? "Traduzindo" : "Traduzir"}
          </button>
          <Select value={translationLanguage} onValueChange={onTranslationLanguageChange}>
            <SelectTrigger className="h-11 w-36 rounded-xl border-white/10 bg-white/10 text-white" aria-label="Idioma da tradução">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[120]">
              {CALL_LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.flag} {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mx-auto mb-5 flex max-w-sm items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2">
          <VolumeX className="h-4 w-4 text-white/50" />
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
          <Volume2 className="h-4 w-4 text-white/50" />
        </div>

        <div className="flex items-center justify-center gap-4">
          <ControlButton active={muted} onClick={toggleMute} label={muted ? "Ativar microfone" : "Silenciar"}>
            {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </ControlButton>

          {isVideo && (
            <ControlButton active={camOff} onClick={toggleCam} label={camOff ? "Ligar câmera" : "Desligar câmera"}>
              {camOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
            </ControlButton>
          )}

          <ControlButton
            active={!speakerOn}
            label={speakerOn ? "Silenciar alto-falante" : "Ativar alto-falante"}
            onClick={() => {
              const next = !speakerOn;
              setSpeakerOn(next);
              document.querySelectorAll("audio, video").forEach((el) => {
                (el as HTMLMediaElement).volume = next ? 1 : 0;
              });
            }}
          >
            {speakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
          </ControlButton>

          {isVideo ? (
            <ControlButton active={false} onClick={onSwitchCamera} label="Alternar câmera frontal/traseira">
              <Camera className="h-6 w-6" />
            </ControlButton>
          ) : null}

          <button
            onClick={onHangup}
            className="grid h-16 w-16 place-items-center rounded-full bg-red-600 shadow-[0_10px_40px_-8px_rgba(220,38,38,0.9)] transition hover:bg-red-500 active:scale-90"
            aria-label="Encerrar chamada"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void | Promise<void>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      aria-label={label}
      className={cn(
        "grid h-14 w-14 place-items-center rounded-full border transition duration-200 active:scale-90",
        active
          ? "border-transparent bg-white text-black shadow-lg"
          : "border-white/10 bg-white/10 text-white backdrop-blur-md hover:bg-white/20",
      )}
    >
      {children}
    </button>
  );
}
