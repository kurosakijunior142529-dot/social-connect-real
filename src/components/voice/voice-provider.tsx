import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Room,
  RoomEvent,
  Track,
  AudioPresets,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type Participant,
} from "livekit-client";
import { startVoiceKeepAlive, setVoiceMediaSession } from "@/lib/voice-keepalive";
import { getVoiceChannelAccess } from "@/lib/voice.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type VoiceMember = {
  identity: string;
  name: string;
  avatarUrl: string | null;
  isLocal: boolean;
  speaking: boolean;
  muted: boolean;
  volume: number;
};

export type VoiceChannelInfo = { id: string; name: string; emoji: string | null };
export type VoiceMode = "open" | "ptt";

type Ctx = {
  channel: VoiceChannelInfo | null;
  status: "idle" | "connecting" | "connected";
  members: VoiceMember[];
  micEnabled: boolean;
  deafened: boolean;
  mode: VoiceMode;
  pttKey: string;
  pttHeld: boolean;
  joinedAt: number | null;
  join: (channel: VoiceChannelInfo) => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  toggleDeafen: () => void;
  setMode: (m: VoiceMode) => void;
  setPttKey: (k: string) => void;
  setPttHeld: (v: boolean) => void;
  setMemberVolume: (identity: string, volume: number) => void;
};

const VoiceContext = createContext<Ctx | null>(null);

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used inside VoiceProvider");
  return ctx;
}

function parseAvatar(p: Participant): string | null {
  try {
    const meta = p.metadata ? JSON.parse(p.metadata) : null;
    return meta?.avatarUrl ?? null;
  } catch {
    return null;
  }
}

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const getAccess = useServerFn(getVoiceChannelAccess);

  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const volumesRef = useRef<Map<string, number>>(new Map());
  const keepAliveRef = useRef<{ stop: () => void } | null>(null);

  const [channel, setChannel] = useState<VoiceChannelInfo | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [members, setMembers] = useState<VoiceMember[]>([]);
  const [micEnabled, setMicEnabled] = useState(true);
  const [deafened, setDeafened] = useState(false);
  const [mode, setModeState] = useState<VoiceMode>("open");
  const [pttKey, setPttKeyState] = useState("Space");
  const [pttHeld, setPttHeldState] = useState(false);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);

  // Coalescido em um frame + diff: evita re-render da UI a cada evento do LiveKit
  // (ActiveSpeakersChanged dispara dezenas de vezes por segundo).
  const rafRef = useRef<number | null>(null);
  const refreshMembers = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const room = roomRef.current;
      if (!room) return setMembers((prev) => (prev.length ? [] : prev));
      const all: Participant[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
      const next: VoiceMember[] = all.map((p) => ({
        identity: p.identity,
        name: p.name || "Usuário",
        avatarUrl: parseAvatar(p),
        isLocal: p.isLocal,
        speaking: p.isSpeaking,
        muted: p.isLocal
          ? !room.localParticipant.isMicrophoneEnabled
          : !!p.audioTrackPublications.values().next().value?.isMuted,
        volume: volumesRef.current.get(p.identity) ?? 1,
      }));
      setMembers((prev) => {
        if (
          prev.length === next.length &&
          prev.every((m, i) => {
            const n = next[i]!;
            return (
              m.identity === n.identity &&
              m.speaking === n.speaking &&
              m.muted === n.muted &&
              m.volume === n.volume &&
              m.name === n.name &&
              m.avatarUrl === n.avatarUrl
            );
          })
        ) {
          return prev;
        }
        return next;
      });
    });
  }, []);


  const attachTrack = useCallback(
    (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      el.volume = deafened ? 0 : volumesRef.current.get(participant.identity) ?? 1;
      el.style.display = "none";
      document.body.appendChild(el);
      audioElsRef.current.set(participant.identity, el);
      void el.play().catch(() => undefined);
      refreshMembers();
    },
    [deafened, refreshMembers],
  );

  const cleanupAudio = useCallback(() => {
    audioElsRef.current.forEach((el) => {
      el.pause();
      el.srcObject = null;
      el.remove();
    });
    audioElsRef.current.clear();
  }, []);

  const leave = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) void room.disconnect();
    cleanupAudio();
    keepAliveRef.current?.stop();
    keepAliveRef.current = null;
    setChannel(null);
    setStatus("idle");
    setMembers([]);
    setJoinedAt(null);
    setPttHeldState(false);
  }, [cleanupAudio]);

  const join = useCallback(
    async (target: VoiceChannelInfo) => {
      if (!user) return;
      if (roomRef.current) leave();
      setChannel(target);
      setStatus("connecting");
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", user.id)
          .maybeSingle();

        const access = await getAccess({
          data: {
            channelId: target.id,
            displayName: profile?.display_name ?? profile?.username ?? "Usuário",
            avatarUrl: profile?.avatar_url ?? null,
          },
        });

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          // Captura leve: mono, 24 kHz, com supressão de ruído/eco do próprio SO.
          audioCaptureDefaults: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          // Opus com DTX (não transmite silêncio) + RED (resiste a perda de pacote).
          publishDefaults: { dtx: true, red: true, audioPreset: AudioPresets.speech },
        });
        roomRef.current = room;

        room
          .on(RoomEvent.TrackSubscribed, attachTrack)
          .on(RoomEvent.TrackUnsubscribed, (_t, _p, participant) => {
            const el = audioElsRef.current.get(participant.identity);
            if (el) {
              el.remove();
              audioElsRef.current.delete(participant.identity);
            }
            refreshMembers();
          })
          .on(RoomEvent.ParticipantConnected, refreshMembers)
          .on(RoomEvent.ParticipantDisconnected, refreshMembers)
          .on(RoomEvent.ActiveSpeakersChanged, refreshMembers)
          .on(RoomEvent.TrackMuted, refreshMembers)
          .on(RoomEvent.TrackUnmuted, refreshMembers)
          .on(RoomEvent.LocalTrackPublished, refreshMembers)
          .on(RoomEvent.Reconnecting, () => setStatus("connecting"))
          .on(RoomEvent.Reconnected, () => {
            setStatus("connected");
            // Reanexa e volta a tocar todo áudio remoto após a reconexão.
            audioElsRef.current.forEach((el) => void el.play().catch(() => undefined));
            refreshMembers();
          })
          .on(RoomEvent.MediaDevicesError, () => {
            toast.error("O microfone foi tomado por outro app (jogo). Use um headset ou libere o microfone.");
          })
          .on(RoomEvent.Disconnected, () => {
            cleanupAudio();
            keepAliveRef.current?.stop();
            keepAliveRef.current = null;
            setStatus("idle");
            setChannel(null);
            setMembers([]);
          });


        await room.connect(access.wsUrl, access.token);
        await room.localParticipant.setMicrophoneEnabled(mode === "open");
        setMicEnabled(mode === "open");
        setStatus("connected");
        setJoinedAt(Date.now());
        refreshMembers();

        // Mantém a sessão de áudio viva em segundo plano (tela bloqueada, jogo aberto).
        keepAliveRef.current?.stop();
        keepAliveRef.current = startVoiceKeepAlive(() => audioElsRef.current.values());
        setVoiceMediaSession({
          title: target.name,
          artist: "Canal de voz · vibely",
          onHangUp: () => leave(),
          onToggleMic: () => {
            const r = roomRef.current;
            if (!r) return;
            void r.localParticipant.setMicrophoneEnabled(!r.localParticipant.isMicrophoneEnabled);
          },
        });

        toast.success(`Conectado em ${target.name}`);

      } catch (err) {
        console.error("[voice] join failed", err);
        toast.error(err instanceof Error ? err.message : "Não foi possível entrar no canal");
        leave();
      }
    },
    [user, leave, getAccess, attachTrack, refreshMembers, cleanupAudio, mode],
  );

  const toggleMic = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    void room.localParticipant.setMicrophoneEnabled(next).then(() => {
      setMicEnabled(next);
      refreshMembers();
    });
  }, [refreshMembers]);

  const toggleDeafen = useCallback(() => {
    setDeafened((prev) => {
      const next = !prev;
      audioElsRef.current.forEach((el, identity) => {
        el.volume = next ? 0 : volumesRef.current.get(identity) ?? 1;
      });
      return next;
    });
  }, []);

  const setMemberVolume = useCallback((identity: string, volume: number) => {
    volumesRef.current.set(identity, volume);
    const el = audioElsRef.current.get(identity);
    if (el) el.volume = volume;
    setMembers((prev) => prev.map((m) => (m.identity === identity ? { ...m, volume } : m)));
  }, []);

  const setPttHeld = useCallback(
    (held: boolean) => {
      setPttHeldState(held);
      const room = roomRef.current;
      if (!room) return;
      void room.localParticipant.setMicrophoneEnabled(held).then(() => {
        setMicEnabled(held);
        refreshMembers();
      });
    },
    [refreshMembers],
  );

  const setMode = useCallback(
    (m: VoiceMode) => {
      setModeState(m);
      const room = roomRef.current;
      if (!room) return;
      const enable = m === "open";
      void room.localParticipant.setMicrophoneEnabled(enable).then(() => {
        setMicEnabled(enable);
        refreshMembers();
      });
    },
    [refreshMembers],
  );

  // Push-to-talk keyboard binding (desktop)
  useEffect(() => {
    if (mode !== "ptt" || status !== "connected") return;
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== pttKey || e.repeat || isTyping(e.target)) return;
      e.preventDefault();
      setPttHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== pttKey) return;
      setPttHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [mode, status, pttKey, setPttHeld]);

  // Keep the session alive when the tab is hidden / screen is locked
  useEffect(() => {
    if (status !== "connected") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        audioElsRef.current.forEach((el) => void el.play().catch(() => undefined));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [status]);

  useEffect(() => () => leave(), [leave]);

  const value = useMemo<Ctx>(
    () => ({
      channel,
      status,
      members,
      micEnabled,
      deafened,
      mode,
      pttKey,
      pttHeld,
      joinedAt,
      join,
      leave,
      toggleMic,
      toggleDeafen,
      setMode,
      setPttKey: setPttKeyState,
      setPttHeld,
      setMemberVolume,
    }),
    [
      channel,
      status,
      members,
      micEnabled,
      deafened,
      mode,
      pttKey,
      pttHeld,
      joinedAt,
      join,
      leave,
      toggleMic,
      toggleDeafen,
      setMode,
      setPttHeld,
      setMemberVolume,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
