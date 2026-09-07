import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  ChevronDown,
  Languages,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  Signal,
  Sparkles,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
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
  remoteScreenStream?: MediaStream | null;
  connectionLabel: string;
  mediaConnected: boolean;
  captions: CallCaption[];
  translationEnabled: boolean;
  translationLanguage: string;
  spokenLanguage?: string;
  onSpokenLanguageChange?: (language: string) => void;
  speakTranslations?: boolean;
  onToggleSpeakTranslations?: () => void;
  showTranscript?: boolean;
  onToggleShowTranscript?: () => void;
  screenSharing?: boolean;
  screenAudioShared?: boolean;
  screenShareSupported?: boolean;
  onToggleScreenShare?: () => void | Promise<void>;
  onToggleTranslation: () => void;
  onTranslationLanguageChange: (language: string) => void;
  onRetryCaption: (id: string) => void;

  onSwitchCamera: () => void | Promise<void>;
  onMinimize?: () => void;
  onHangup: () => void;
};

type Corner = "br" | "bl" | "tr" | "tl";

export function CallScreen({
  call,
  localStream,
  remoteStream,
  remoteScreenStream,
  connectionLabel,
  mediaConnected,
  captions,
  translationEnabled,
  translationLanguage,
  spokenLanguage = "auto",
  onSpokenLanguageChange,
  speakTranslations = false,
  onToggleSpeakTranslations,
  showTranscript = false,
  onToggleShowTranscript,
  screenSharing = false,
  screenAudioShared = false,
  screenShareSupported = false,
  onToggleScreenShare,
  onToggleTranslation,
  onTranslationLanguageChange,
  onRetryCaption,

  onSwitchCamera,
  onMinimize,
  onHangup,
}: Props) {
  const screenRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [sheet, setSheet] = useState<null | "captions" | "settings">(null);
  const [corner, setCorner] = useState<Corner>("br");

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
    if (sheet === "captions" && historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [captions, sheet]);

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
  function setVolume(v: number) {
    document.querySelectorAll("audio, video").forEach((el) => {
      (el as HTMLMediaElement).volume = v;
    });
    setSpeakerOn(v > 0);
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");
  const timeLabel = `${mm}:${ss}`;
  const statusLabel =
    call.status === "ringing"
      ? call.role === "caller"
        ? "Chamando…"
        : "Conectando…"
      : call.status === "accepted"
        ? speaking === "other"
          ? `${call.other.display_name ?? call.other.username ?? "Ele"} está falando`
          : speaking === "me"
            ? "Você está falando"
            : "Conectado"
        : call.status;

  const isVideo = call.type === "video";
  const displayName = call.other.display_name ?? call.other.username ?? "Usuário";
  const hasRemote = !!remoteStream?.getTracks().length;
  const showStage = !isVideo || call.status !== "accepted" || !hasRemote;

  const live = useMemo(() => captions.slice(-2), [captions]);
  const weakConnection = /ruim|fraca|instáv|reconect|perdid/i.test(connectionLabel);

  const cornerClass: Record<Corner, string> = {
    br: "bottom-36 right-4",
    bl: "bottom-36 left-4",
    tr: "top-24 right-4",
    tl: "top-24 left-4",
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#050505] text-white select-none">
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
              hasRemote && call.status === "accepted" ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null}

        {showStage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-8">
            {/* Single soft halo that breathes with the voice */}
            <div className="relative grid place-items-center">
              <span
                className="absolute rounded-full bg-primary/25 blur-[70px]"
                style={{
                  width: "18rem",
                  height: "18rem",
                  opacity: 0.25 + level * 0.35,
                  transform: `scale(${1 + level * 0.12})`,
                  transition: "transform 200ms ease-out, opacity 220ms ease-out",
                }}
              />
              <div
                className={cn(
                  "relative rounded-full p-[2px] transition-colors duration-300",
                  speaking ? "bg-primary/70" : "bg-white/10",
                )}
                style={{
                  transform: `scale(${1 + level * 0.03})`,
                  transition: "transform 160ms ease-out",
                }}
              >
                <UserAvatar
                  avatarPath={call.other.avatar_url ?? null}
                  displayName={displayName}
                  className="h-36 w-36 border-2 border-black"
                />
              </div>
            </div>

            <div className="space-y-1.5 text-center">
              <h1 className="text-[28px] font-semibold tracking-tight">{displayName}</h1>
              {call.other.username ? (
                <p className="text-[13px] text-white/40">@{call.other.username}</p>
              ) : null}
              <p className="pt-1 text-[13px] text-white/55">{statusLabel}</p>
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3 pt-[env(safe-area-inset-top)]">
          {onMinimize ? (
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimizar chamada"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.08] text-white/70 backdrop-blur-md transition active:scale-90"
            >
              <Minimize2 className="h-4 w-4" strokeWidth={1.8} />
            </button>
          ) : (
            <span />
          )}

          <div className="flex flex-col items-end gap-2">
            {call.status === "accepted" ? (
              <span className="rounded-full bg-black/40 px-3 py-1.5 text-[13px] font-medium tabular-nums text-white/85 backdrop-blur-md">
                {timeLabel}
              </span>
            ) : null}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] backdrop-blur-md",
                weakConnection ? "text-primary" : "text-white/45",
              )}
            >
              <Signal className="h-3 w-3" strokeWidth={1.8} />
              {connectionLabel}
            </span>
          </div>
        </div>

        {/* Name overlay while on video */}
        {isVideo && !showStage ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />
        ) : null}

        {/* Local PIP — draggable across corners, double tap switches camera */}
        {isVideo && (
          <div
            className={cn(
              "absolute h-40 w-28 overflow-hidden rounded-3xl bg-black shadow-2xl ring-1 ring-white/15 transition-all duration-300 md:h-52 md:w-36",
              cornerClass[corner],
            )}
            onDoubleClick={() => void onSwitchCamera()}
            onPointerUp={(e) => {
              const x = e.clientX < window.innerWidth / 2 ? "l" : "r";
              const y = e.clientY < window.innerHeight / 2 ? "t" : "b";
              setCorner(`${y}${x}` as Corner);
            }}
          >
            <video
              ref={localRef}
              autoPlay
              playsInline
              muted
              className={cn("h-full w-full object-cover", camOff && "opacity-0")}
            />
            {camOff && (
              <div className="absolute inset-0 grid place-items-center bg-white/5 text-[11px] text-white/60">
                Câmera off
              </div>
            )}
          </div>
        )}

        {/* Cinema captions */}
        {live.length > 0 ? (
          <button
            type="button"
            onClick={() => setSheet("captions")}
            className="absolute inset-x-4 bottom-4 mx-auto max-w-md space-y-1 rounded-2xl bg-black/55 px-4 py-3 text-left backdrop-blur-md transition active:scale-[0.99]"
          >
            {live.map((caption) => (
              <p key={caption.id} className="text-[15px] leading-snug">
                <span className={cn("mr-1.5 text-[11px] font-semibold uppercase tracking-wide", caption.speaker === "me" ? "text-white/45" : "text-primary")}>
                  {caption.speaker === "me" ? "Você" : displayName}
                </span>
                <span className={caption.status === "pending" ? "text-white/50" : "text-white"}>
                  {caption.status === "failed"
                    ? caption.original
                    : (caption.translated ?? caption.original)}
                </span>
              </p>
            ))}
          </button>
        ) : translationEnabled ? (
          <p className="absolute inset-x-0 bottom-6 text-center text-[12px] text-white/35">
            {mediaConnected ? "Ouvindo a conversa…" : "Aguardando conexão"}
          </p>
        ) : null}
      </div>

      {/* Floating controls */}
      <div className="relative z-10 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 rounded-full border border-white/[0.08] bg-white/[0.06] px-3 py-3 backdrop-blur-2xl">
          <ControlButton active={muted} onClick={toggleMute} label={muted ? "Ativar microfone" : "Silenciar"}>
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </ControlButton>

          {isVideo ? (
            <ControlButton active={camOff} onClick={toggleCam} label={camOff ? "Ligar câmera" : "Desligar câmera"}>
              {camOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </ControlButton>
          ) : null}

          <ControlButton
            active={!speakerOn}
            label={speakerOn ? "Silenciar alto-falante" : "Ativar alto-falante"}
            onClick={() => setVolume(speakerOn ? 0 : 1)}
          >
            {speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </ControlButton>

          {isVideo ? (
            <ControlButton active={false} onClick={onSwitchCamera} label="Alternar câmera frontal/traseira">
              <Camera className="h-5 w-5" />
            </ControlButton>
          ) : null}

          <ControlButton
            active={translationEnabled}
            onClick={() => setSheet("settings")}
            label="Tradução e legendas"
          >
            {translationEnabled ? <Sparkles className="h-5 w-5" /> : <Languages className="h-5 w-5" />}
          </ControlButton>

          <button
            type="button"
            onClick={onHangup}
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-red-600 transition hover:bg-red-500 active:scale-90"
            aria-label="Encerrar chamada"
          >
            <PhoneOff className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Sheets */}
      {sheet ? (
        <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50" onClick={() => setSheet(null)}>
          <div
            className="max-h-[70vh] overflow-hidden rounded-t-[28px] border-t border-white/10 bg-[#0b0b0c] pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-5 py-4">
              <span className="text-[15px] font-semibold">
                {sheet === "captions" ? "Legendas da chamada" : "Tradução ao vivo"}
              </span>
              <button
                type="button"
                onClick={() => setSheet(null)}
                aria-label="Fechar"
                className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-white/[0.08] text-white/70 transition active:scale-90"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            {sheet === "settings" ? (
              <div className="space-y-3 px-5 pb-5">
                <button
                  type="button"
                  onClick={onToggleTranslation}
                  className={cn(
                    "flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold transition active:scale-[0.98]",
                    translationEnabled
                      ? "bg-primary text-primary-foreground"
                      : "border border-white/10 bg-white/[0.06] text-white",
                  )}
                >
                  {translationEnabled ? <Sparkles className="h-4 w-4" /> : <Languages className="h-4 w-4" />}
                  {translationEnabled ? "Tradução ligada" : "Ligar tradução"}
                </button>

                <div className="space-y-1.5">
                  <span className="text-[12px] text-white/45">Traduzir para</span>
                  <Select value={translationLanguage} onValueChange={onTranslationLanguageChange}>
                    <SelectTrigger
                      className="h-12 w-full rounded-2xl border-white/10 bg-white/[0.06] text-white"
                      aria-label="Idioma da tradução"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[130]">
                      {CALL_LANGUAGES.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.flag} {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-4 py-3">
                  <VolumeX className="h-4 w-4 text-white/40" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    defaultValue="1"
                    aria-label="Volume da chamada"
                    className="min-w-0 flex-1 accent-primary"
                    onChange={(e) => setVolume(Number(e.currentTarget.value))}
                  />
                  <Volume2 className="h-4 w-4 text-white/40" />
                </div>

                <button
                  type="button"
                  onClick={() => setSheet("captions")}
                  className="w-full rounded-2xl border border-white/[0.07] bg-white/[0.04] px-4 py-3 text-left text-[14px] text-white/70 transition active:scale-[0.99]"
                >
                  Ver histórico de legendas
                </button>
              </div>
            ) : (
              <div ref={historyRef} className="max-h-[52vh] space-y-2 overflow-y-auto px-5 pb-5" aria-live="polite">
                {captions.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-white/40">
                    {!mediaConnected
                      ? "Aguardando conexão"
                      : translationEnabled
                        ? "Ouvindo a conversa…"
                        : "Ative a tradução para ver as falas aqui."}
                  </p>
                ) : (
                  captions.slice(-60).map((caption) => (
                    <div
                      key={caption.id}
                      className={cn(
                        "rounded-2xl px-3.5 py-2.5",
                        caption.speaker === "me" ? "bg-white/[0.05]" : "bg-primary/10",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wide",
                            caption.speaker === "me" ? "text-white/45" : "text-primary",
                          )}
                        >
                          {caption.speaker === "me" ? "Você" : displayName}
                        </span>
                        {caption.status === "pending" ? (
                          <span className="text-[10px] text-white/40">traduzindo…</span>
                        ) : null}
                      </div>
                      {caption.status === "failed" ? (
                        <div className="mt-0.5 space-y-1">
                          <p className="text-[14px] leading-snug">{caption.original}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] text-white/40">
                              {caption.error ?? "não foi possível traduzir"}
                            </span>
                            <button
                              type="button"
                              onClick={() => onRetryCaption(caption.id)}
                              className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold transition active:scale-95"
                            >
                              Tentar novamente
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-[14px] leading-snug">{caption.translated ?? caption.original}</p>
                          {caption.translated && caption.translated !== caption.original ? (
                            <p className="text-[11px] leading-snug text-white/40">{caption.original}</p>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
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
        "grid h-12 w-12 shrink-0 place-items-center rounded-full transition active:scale-90",
        active ? "bg-primary text-primary-foreground" : "bg-white/[0.08] text-white/80",
      )}
    >
      {children}
    </button>
  );
}
