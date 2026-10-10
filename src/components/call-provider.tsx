import { appAlert } from "@/components/app-dialog";
import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CallScreen } from "@/components/call-screen";
import { CallMiniBar } from "@/components/call-mini-bar";
import { IncomingCallDialog } from "@/components/incoming-call-dialog";
import { getCameraTrack, getLocalMedia, stopStream } from "@/lib/webrtc";
import { studioVoice, resumeStudioVoice, releaseStudioVoice } from "@/lib/call-audio-dsp";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { translateText, translateBatch } from "@/lib/ai.functions";
import { transcribeCallClip } from "@/lib/call-transcribe.functions";
import { startSttFallback, type SttFallbackHandle } from "@/lib/call-stt-fallback";
import { speakCallTranslation } from "@/lib/call-speech.functions";
import { getCallVoice, deviceVoicesFor } from "@/lib/call-voice";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getCallAccess } from "@/lib/calls.functions";
import {
  AudioPresets,
  LocalAudioTrack,

  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";

export type CallType = "audio" | "video";
export type CallRole = "caller" | "callee";
export type CallStatus =
  | "ringing"
  | "accepted"
  | "rejected"
  | "ended"
  | "missed"
  | "canceled";

export type OtherParty = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

type ActiveCall = {
  id: string;
  type: CallType;
  role: CallRole;
  other: OtherParty;
  status: CallStatus;
};

type IncomingCall = {
  id: string;
  type: CallType;
  other: OtherParty;
};

type Ctx = {
  startCall: (other: OtherParty, type: CallType) => Promise<void>;
  activeCall: ActiveCall | null;
};

export type CallCaption = {
  id: string;
  speaker: "me" | "other";
  original: string;
  translated?: string;
  /**
   * pending = translating, done = translated, failed = show original + retry,
   * unclear = audio was too noisy to transcribe with confidence
   */
  status: "pending" | "done" | "failed" | "unclear";
  error?: string;
};


const CallContext = createContext<Ctx | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be inside CallProvider");
  return ctx;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const translate = useServerFn(translateText);
  const getCallAccessToken = useServerFn(getCallAccess);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  
  // persistentRemoteStreamRef holds the actual MediaStream object throughout the call
  const persistentRemoteStreamRef = useRef<MediaStream>(new MediaStream());
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [trackUpdate, setTrackUpdate] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const facingModeRef = useRef<"user" | "environment">("user");
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const callerReadyRef = useRef(false);
  const negotiationIdRef = useRef<string | null>(null);
  const sendSignalRef = useRef<((kind: "offer" | "answer" | "ice" | "bye" | "caption", payload: Record<string, unknown>) => Promise<void>) | null>(null);
  const sttFallbackRef = useRef<SttFallbackHandle | null>(null);
  const stopTranslationRef = useRef<(() => void) | null>(null);
  const mediaConnectedRef = useRef(false);
  const translationSessionRef = useRef(0);
  const lastTranscriptRef = useRef({ text: "", at: 0 });
  const lastRemoteCaptionRef = useRef({ text: "", at: 0 });
  const translateCaptionRef = useRef<((id: string, original: string, speakAloud?: boolean) => Promise<void>) | null>(null);
  const captionsMirrorRef = useRef<CallCaption[]>([]);
  const spokenLangRef = useRef<string>("pt-BR");

  const transcribe = useServerFn(transcribeCallClip);
  const translateMany = useServerFn(translateBatch);
  const translationEnabledRef = useRef(false);
  /** True while the other person has translation on and needs our captions. */
  const peerCaptureRef = useRef(false);
  const startCaptureRef = useRef<(() => Promise<boolean>) | null>(null);
  const capturing = () => translationEnabledRef.current || peerCaptureRef.current;
  const translationLanguageRef = useRef("pt-BR");
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("pt-BR");
  const [captions, setCaptions] = useState<CallCaption[]>([]);
  const [mediaConnected, setMediaConnected] = useState(false);
  const [connectionLabel, setConnectionLabel] = useState("Conectando");
  const previousUserIdRef = useRef<string | null>(null);

  // Screen sharing, spoken translation and transcript state.
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const remoteScreenStreamRef = useRef<MediaStream>(new MediaStream());
  const [screenSharing, setScreenSharing] = useState(false);
  const screenSharingRef = useRef(false);
  const [screenAudioShared, setScreenAudioShared] = useState(false);
  const [spokenLanguage, setSpokenLanguage] = useState("auto");
  const spokenAutoRef = useRef(true);
  const [speakTranslations, setSpeakTranslations] = useState(false);
  const speakTranslationsRef = useRef(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const ttsBusyUntilRef = useRef(0);
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastUnclearRef = useRef(0);
  const pushUnclearRef = useRef<(() => void) | null>(null);
  const speakTranslatedRef = useRef<((text: string) => void) | null>(null);
  const speak = useServerFn(speakCallTranslation);

  const teardown = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (roomRef.current) {
      void roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);
    
    // Clear the persistent remote stream tracks
    persistentRemoteStreamRef.current.getTracks().forEach(t => t.stop());
    persistentRemoteStreamRef.current = new MediaStream();
    setRemoteStream(null);
    setTrackUpdate(0);
    
    videoSenderRef.current = null;
    facingModeRef.current = "user";
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
    processedSignalsRef.current.clear();
    callerReadyRef.current = false;
    negotiationIdRef.current = null;
    sendSignalRef.current = null;
    translationSessionRef.current += 1;
    sttFallbackRef.current?.stop();
    sttFallbackRef.current = null;
    translationEnabledRef.current = false;
    peerCaptureRef.current = false;
    mediaConnectedRef.current = false;
    setMediaConnected(false);
    setTranslationEnabled(false);
    setCaptions([]);
    setConnectionLabel("Conectando");
    setMinimized(false);
    setCallStartedAt(null);
  }, []);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    const nextUserId = user?.id ?? null;
    if (previousUserId && previousUserId !== nextUserId) {
      teardown();
      setActive(null);
      setIncoming(null);
    }
    previousUserIdRef.current = nextUserId;
  }, [user?.id, teardown]);

  const setupPeer = useCallback(
    async (callId: string, type: CallType, _role: CallRole, selfId: string) => {
      mediaConnectedRef.current = false;
      setMediaConnected(false);
      const stream = localStreamRef.current ?? (await getLocalMedia(type === "video", facingModeRef.current));
      localStreamRef.current = stream;
      setLocalStream(stream);

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack || audioTrack.readyState !== "live") {
        throw new Error("O microfone não está gerando uma faixa de áudio ativa");
      }
      audioTrack.enabled = true;
      setConnectionLabel("Microfone ativo");

      const remote = persistentRemoteStreamRef.current;
      setRemoteStream(remote);

      const sendSignal = async (kind: "offer" | "answer" | "ice" | "bye" | "caption", payload: Record<string, unknown>) => {
        const { error } = await (supabase as any).from("call_signals").insert({
          call_id: callId,
          sender_id: selfId,
          kind,
          payload,
        });
        if (error) console.warn("call signal insert failed", error);
      };
      sendSignalRef.current = sendSignal;

      const handleSignal = async (row: any) => {
        if (!row || row.sender_id === selfId || processedSignalsRef.current.has(row.id)) return;
        processedSignalsRef.current.add(row.id);
        const payload = row.payload ?? {};
        try {
          if (row.kind === "caption") {
            // The other person asks us to send captions of what we say.
            if (payload.control === "start") {
              peerCaptureRef.current = true;
              if (!sttFallbackRef.current) void startCaptureRef.current?.();
              return;
            }
            if (payload.control === "stop") {
              peerCaptureRef.current = false;
              if (!translationEnabledRef.current) {
                sttFallbackRef.current?.stop();
                sttFallbackRef.current = null;
              }
              return;
            }
            const original = typeof payload.text === "string" ? payload.text.trim() : "";
            if (!original || !translationEnabledRef.current) return;
            const id = String(row.id);
            lastRemoteCaptionRef.current = { text: original, at: Date.now() };
            setCaptions((current) => [
              ...current.slice(-60),
              { id, speaker: "other" as const, original, status: "pending" as const },
            ]);
            await translateCaptionRef.current?.(id, original, true);
          } else if (row.kind === "bye") {

            hangupLocalRef.current?.();
          }
        } catch (e) {
          console.error("signal error", e);
        }
      };

      const channel = supabase.channel(`call-signals-${callId}`);
      channelRef.current = channel;

      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_signals", filter: `call_id=eq.${callId}` },
        (payload) => { void handleSignal(payload.new); },
      );

      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
        });
      });

      const { data: existingSignals } = await (supabase as any)
        .from("call_signals")
        .select("*")
        .eq("call_id", callId)
        .order("created_at", { ascending: true });
      for (const signal of existingSignals ?? []) await handleSignal(signal);

      setConnectionLabel("Conectando mídia");
      const access = await getCallAccessToken({ data: { callId } });
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
        const mediaTrack = track.mediaStreamTrack;
        const isScreen =
          publication.source === Track.Source.ScreenShare ||
          publication.source === Track.Source.ScreenShareAudio;
        if (isScreen) {
          const screen = remoteScreenStreamRef.current;
          if (!screen.getTracks().some((current) => current.id === mediaTrack.id)) screen.addTrack(mediaTrack);
          setRemoteScreenStream(screen);
          setTrackUpdate((value) => value + 1);
          return;
        }
        if (!remote.getTracks().some((current) => current.id === mediaTrack.id)) remote.addTrack(mediaTrack);
        setRemoteStream(remote);
        setTrackUpdate((value) => value + 1);
        if (track.kind === Track.Kind.Audio) setConnectionLabel("Áudio recebido");
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        const screen = remoteScreenStreamRef.current;
        if (screen.getTracks().some((current) => current.id === track.mediaStreamTrack.id)) {
          screen.removeTrack(track.mediaStreamTrack);
          setRemoteScreenStream(screen.getTracks().length ? screen : null);
        } else {
          remote.removeTrack(track.mediaStreamTrack);
        }
        setTrackUpdate((value) => value + 1);
      });
      room.on(RoomEvent.Reconnecting, () => {
        mediaConnectedRef.current = false;
        setMediaConnected(false);
        stopTranslationRef.current?.();
        setConnectionLabel("Reconectando");
      });
      room.on(RoomEvent.Reconnected, () => {
        mediaConnectedRef.current = true;
        setMediaConnected(true);
        setConnectionLabel("Conectado");
      });
      room.on(RoomEvent.Disconnected, () => {
        mediaConnectedRef.current = false;
        setMediaConnected(false);
        stopTranslationRef.current?.();
        setConnectionLabel("Desconectado");
      });

      await room.connect(access.wsUrl, access.token);
      await room.startAudio().catch(() => setConnectionLabel("Toque na tela para liberar o áudio"));
      setConnectionLabel("Enviando áudio");
      await room.localParticipant.publishTrack(new LocalAudioTrack(audioTrack), {
        source: Track.Source.Microphone,
        dtx: true,
        red: true,
        // High-fidelity mono Opus (~64 kbps) instead of the low default bitrate.
        audioPreset: AudioPresets.musicHighQuality,

      });

      mediaConnectedRef.current = true;
      setMediaConnected(true);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const publication = await room.localParticipant.publishTrack(new LocalVideoTrack(videoTrack), {
          source: Track.Source.Camera,
          simulcast: true,
        });
        videoSenderRef.current = publication.track?.sender ?? null;
      }
      setConnectionLabel("Áudio enviado");
    },
    [getCallAccessToken, translate],
  );

  const hangupLocalRef = useRef<(() => void) | null>(null);
  const hangupLocal = useCallback(() => {
    setActive((prev) => {
      if (prev) {
        const nextStatus: CallStatus =
          prev.status === "ringing" && prev.role === "caller" ? "canceled" : "ended";
        supabase
          .from("calls")
          .update({ status: nextStatus, ended_at: new Date().toISOString() })
          .eq("id", prev.id)
          .then(() => {});
        try {
          if (user?.id) {
            void (supabase as any).from("call_signals").insert({
              call_id: prev.id,
              sender_id: user.id,
              kind: "bye",
              payload: {},
            });
          }
        } catch { /* ignore */ }
      }
      teardown();
      return null;
    });
  }, [teardown, user?.id]);
  hangupLocalRef.current = hangupLocal;

  // Incoming call listener
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`incoming-calls-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as {
            id: string; caller_id: string; call_type: CallType; status: CallStatus;
          };
          if (row.status !== "ringing") return;
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, is_verified, badge_variant")
            .eq("id", row.caller_id)
            .maybeSingle();
          setIncoming({ id: row.id, type: row.call_type, other: prof ?? { id: row.caller_id } });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Call status update listener
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`call-updates-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls" },
        async (payload) => {
          const row = payload.new as {
            id: string; status: CallStatus; caller_id: string; callee_id: string; call_type: CallType;
          };
          if (row.caller_id !== user.id && row.callee_id !== user.id) return;
          setIncoming((prev) => (prev && prev.id === row.id && row.status !== "ringing" ? null : prev));

          if (row.status === "ended" || row.status === "rejected" || row.status === "canceled") {
            setActive((prev) => {
              if (!prev || prev.id !== row.id) return prev;
              teardown();
              return null;
            });
            return;
          }

          if (row.status === "accepted") {
            setActive((prev) => {
              if (!prev || prev.id !== row.id) return prev;
              const next = { ...prev, status: "accepted" as CallStatus };
              if (prev.role === "caller" && !callerReadyRef.current) {
                callerReadyRef.current = true;
                setupPeer(prev.id, prev.type, "caller", user.id).catch((e) => {
                  console.error(e);
                  hangupLocalRef.current?.();
                });
              }
              return next;
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, setupPeer, teardown]);

  // Fallback: Realtime UPDATE events can be missed (tab throttling, dropped
  // socket). Poll the call row while the caller is ringing so the peer
  // connection — and therefore the audio — always gets established.
  useEffect(() => {
    if (!user || !active || active.role !== "caller" || active.status !== "ringing") return;
    let cancelled = false;
    const id = setInterval(async () => {
      const { data } = await supabase
        .from("calls")
        .select("status")
        .eq("id", active.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const status = data.status as CallStatus;
      if (status === "accepted") {
        setActive((prev) => (prev && prev.id === active.id ? { ...prev, status: "accepted" } : prev));
        if (!callerReadyRef.current) {
          callerReadyRef.current = true;
          setupPeer(active.id, active.type, "caller", user.id).catch((e) => {
            console.error(e);
            hangupLocalRef.current?.();
          });
        }
      } else if (status === "ended" || status === "rejected" || status === "canceled") {
        teardown();
        setActive(null);
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, active, setupPeer, teardown]);

  // Recover the current user's call after refresh, re-entry, or an account switch.
  useEffect(() => {
    if (!user || active || incoming) return;
    let cancelled = false;
    void supabase
      .from("calls")
      .select("id, caller_id, callee_id, call_type, status")
      .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
      .in("status", ["ringing", "accepted"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        if (cancelled || !data) return;
        const isCaller = data.caller_id === user.id;
        const otherId = isCaller ? data.callee_id : data.caller_id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, is_verified, badge_variant")
          .eq("id", otherId)
          .maybeSingle();
        if (cancelled) return;
        const other = profile ?? { id: otherId };
        if (data.status === "ringing" && !isCaller) {
          setIncoming({ id: data.id, type: data.call_type as CallType, other });
          return;
        }
        setActive({
          id: data.id,
          type: data.call_type as CallType,
          role: isCaller ? "caller" : "callee",
          other,
          status: data.status as CallStatus,
        });
        if (data.status === "accepted") {
          if (isCaller) callerReadyRef.current = true;
          await setupPeer(data.id, data.call_type as CallType, isCaller ? "caller" : "callee", user.id);
        }
      })
      .then(undefined, (error: unknown) => console.warn("call recovery failed", error));
    return () => { cancelled = true; };
  }, [user?.id]);

  const startCall = useCallback(
    async (other: OtherParty, type: CallType) => {
      if (!user || active) return;
      let preparedStream: MediaStream | null = null;
      try {
        preparedStream = await getLocalMedia(type === "video", facingModeRef.current);
        localStreamRef.current = preparedStream;
        setLocalStream(preparedStream);
      } catch (err: any) {
        const msg = err?.name === "NotAllowedError"
          ? "Permita o acesso ao microfone para iniciar a chamada."
          : err?.name === "NotFoundError"
            ? "Microfone não encontrado neste dispositivo."
            : "Não foi possível acessar microfone/câmera.";
        void appAlert(msg);
        return;
      }
      const { data, error } = await supabase
        .from("calls")
        .insert({ caller_id: user.id, callee_id: other.id, call_type: type })
        .select("id")
        .single();
      if (error || !data) {
        stopStream(preparedStream);
        localStreamRef.current = null;
        setLocalStream(null);
        console.error("start call failed", error);
        void appAlert("Não foi possível iniciar a chamada.");
        return;
      }
      setActive({ id: data.id, type, role: "caller", other, status: "ringing" });
    },
    [user, active],
  );

  const acceptIncoming = useCallback(async () => {
    if (!incoming || !user) return;
    const inc = incoming;
    setIncoming(null);
    setActive({ id: inc.id, type: inc.type, role: "callee", other: inc.other, status: "accepted" });
    try {
      const { error } = await supabase
        .from("calls")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", inc.id);
      if (error) throw error;
      await setupPeer(inc.id, inc.type, "callee", user.id);
    } catch (e) {
      console.error(e);
      void appAlert("Não foi possível acessar câmera/microfone.");
      await supabase
        .from("calls")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", inc.id);
      teardown();
      setActive(null);
    }
  }, [incoming, user, setupPeer, teardown]);

  const rejectIncoming = useCallback(async () => {
    if (!incoming) return;
    const id = incoming.id;
    setIncoming(null);
    await supabase
      .from("calls")
      .update({ status: "rejected", ended_at: new Date().toISOString() })
      .eq("id", id);
  }, [incoming]);

  const switchCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream?.getVideoTracks().length) return;
    const nextFacing = facingModeRef.current === "user" ? "environment" : "user";
    try {
      const nextTrack = await getCameraTrack(nextFacing);
      const oldTrack = stream.getVideoTracks()[0];
      if (videoSenderRef.current) await videoSenderRef.current.replaceTrack(nextTrack);
      stream.removeTrack(oldTrack);
      oldTrack.stop();
      stream.addTrack(nextTrack);
      facingModeRef.current = nextFacing;
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch (err) {
      console.warn("switch camera failed", err);
      void appAlert("Não foi possível alternar a câmera neste dispositivo.");
    }
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const audioSinkRef = useRef<HTMLAudioElement>(null);
  const unlockAudioSink = useCallback(() => {
    const el = audioSinkRef.current;
    if (!el) return;
    const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      const context = audioContextRef.current ?? new AudioContextCtor();
      audioContextRef.current = context;
      void context.resume();
    }
    el.muted = false;
    el.volume = 1;
    // Attempting a tiny playback to unlock audio context on some browsers
    void el.play().catch(() => {});
  }, []);

  const startCallWithAudioUnlock = useCallback(
    async (other: OtherParty, type: CallType) => {
      unlockAudioSink();
      await startCall(other, type);
    },
    [startCall, unlockAudioSink],
  );

  const acceptIncomingWithAudioUnlock = useCallback(async () => {
    unlockAudioSink();
    await acceptIncoming();
  }, [acceptIncoming, unlockAudioSink]);

  // ---- Live translation -------------------------------------------------
  // Everything I say is transcribed from the audio track already acquired for
  // the call. Translation never requests microphone access of its own.

  /** Normalized similarity helper used to drop echoed / duplicated speech. */
  const isNearlySame = (a: string, b: string) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return false;
    return x === y || (x.length > 8 && (x.includes(y) || y.includes(x)));
  };

  /** Translates one caption, keeping its status in sync so failures can be retried. */
  const translateCaption = useCallback(
    async (id: string, original: string, speakAloud = false) => {
      const target = translationLanguageRef.current;
      setCaptions((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "pending" as const, error: undefined } : item,
        ),
      );
      const previous = captionsMirrorRef.current
        .filter((item) => item.id !== id && item.original.trim())
        .slice(-1)[0]?.original;
      try {
        const result = await translate({ data: { text: original, target, context: previous } });
        if (translationLanguageRef.current !== target) return;
        setCaptions((current) =>
          current.map((item) =>
            item.id === id ? { ...item, translated: result.text, status: "done" as const, error: undefined } : item,
          ),
        );
        if (speakAloud && result?.text) speakTranslatedRef.current?.(result.text);
      } catch (error: any) {
        console.error("[call-translation] translate failed", error);
        setCaptions((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  translated: undefined,
                  status: "failed" as const,
                  error: error?.message ?? "Não foi possível traduzir",
                }
              : item,
          ),
        );
      }
    },
    [translate],
  );
  translateCaptionRef.current = translateCaption;

  const retryCaption = useCallback(
    (id: string) => {
      const caption = captionsMirrorRef.current.find((item) => item.id === id);
      if (!caption) return;
      void translateCaption(id, caption.original);
    },
    [translateCaption],
  );

  /** Rejects transcription noise: fillers, single tokens and model hallucinations. */
  const isNoise = (text: string) => {
    const norm = text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
    if (norm.length < 3) return true;
    if (/^(a+h*|e+h*|hum+|hm+|uh+|um+|mm+|ok|oi|hã|ãh|yeah|you|the)$/.test(norm)) return true;
    // Common Whisper hallucinations on silence/noise.
    if (/(legendas pela comunidade|amara\.org|obrigado por assistir|thanks for watching|subscribe)/.test(norm)) {
      return true;
    }
    const words = norm.split(" ");
    if (words.length === 1 && norm.length < 5) return true;
    // A phrase repeating the same word over and over is a decoding loop.
    if (words.length > 3 && new Set(words).size === 1) return true;
    return false;
  };

  /**
   * Low confidence: the clip had voice but the transcript is unusable. We say so
   * instead of inventing a sentence to translate.
   */
  const pushUnclear = useCallback(() => {
    const now = Date.now();
    if (now - lastUnclearRef.current < 8_000) return;
    lastUnclearRef.current = now;
    setCaptions((current) => [
      ...current.slice(-60),
      {
        id: crypto.randomUUID(),
        speaker: "me" as const,
        original: "Não consegui entender claramente",
        status: "unclear" as const,
      },
    ]);
  }, []);
  pushUnclearRef.current = pushUnclear;

  const pushMyCaption = useCallback(
    (text: string, sourceLang: string) => {
      const clean = text.trim();
      if (!clean) return;
      if (isNoise(clean)) {
        pushUnclear();
        return;
      }
      const now = Date.now();
      if (lastTranscriptRef.current.text === clean && now - lastTranscriptRef.current.at < 8_000) return;
      // Anti-echo: ignore my "speech" when it just repeats what the other person said.
      if (
        now - lastRemoteCaptionRef.current.at < 6_000 &&
        isNearlySame(clean, lastRemoteCaptionRef.current.text)
      ) {
        return;
      }
      lastTranscriptRef.current = { text: clean, at: now };
      void sendSignalRef.current?.("caption", { text: clean, language: sourceLang });
      // Only capturing for the other person: no local captions needed.
      if (!translationEnabledRef.current) return;
      const id = crypto.randomUUID();
      setCaptions((current) => [
        ...current.slice(-60),
        { id, speaker: "me" as const, original: clean, status: "pending" as const },
      ]);

      const target = translationLanguageRef.current;
      if (sourceLang.split("-")[0] === target.split("-")[0]) {
        setCaptions((current) =>
          current.map((item) =>
            item.id === id ? { ...item, translated: clean, status: "done" as const } : item,
          ),
        );
        return;
      }
      void translateCaption(id, clean);
    },
    [translateCaption],
  );

  const stopTranslation = useCallback(() => {
    const wasOn = translationEnabledRef.current;
    translationEnabledRef.current = false;
    if (wasOn) void sendSignalRef.current?.("caption", { control: "stop" }).catch(() => {});
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    ttsAudioRef.current?.pause();
    if (!peerCaptureRef.current) {
      translationSessionRef.current += 1;
      sttFallbackRef.current?.stop();
      sttFallbackRef.current = null;
    }
    setTranslationEnabled(false);
  }, []);
  stopTranslationRef.current = stopTranslation;

  /** Transcribes the existing call track without acquiring the microphone again. */
  const startCallTranscription = useCallback(async () => {
    const stream = localStreamRef.current;
    const audioTrack = stream?.getAudioTracks()[0];
    if (!mediaConnectedRef.current || !stream || !audioTrack || audioTrack.readyState !== "live") {
      toast.info("Aguardando a conexão da chamada.");
      return false;
    }
    sttFallbackRef.current?.stop();

    // Free path first: the device's own speech recognition (no AI credits).
    const Recognition =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    // Android beeps every time recognition restarts, which sounds like noise in the call.
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (Recognition && !isAndroid) {
      const nativeSession = translationSessionRef.current + 1;
      translationSessionRef.current = nativeSession;
      let alive = true;
      let failed = false;
      let rec: any = null;
      const active = () => alive && capturing() && nativeSession === translationSessionRef.current;
      const begin = () => {
        if (!active()) return;
        try {
          rec = new Recognition();
          rec.continuous = true;
          rec.interimResults = false;
          rec.lang = spokenAutoRef.current ? navigator.language || "pt-BR" : spokenLangRef.current;
          rec.onresult = (event: any) => {
            if (Date.now() < ttsBusyUntilRef.current) return; // ignore our own spoken translation
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const r = event.results[i];
              if (r?.isFinal) pushMyCaption(String(r[0]?.transcript ?? ""), rec.lang);
            }
          };
          rec.onerror = (event: any) => {
            if (event?.error === "not-allowed" || event?.error === "service-not-allowed" || event?.error === "audio-capture") {
              failed = true;
            }
          };
          rec.onend = () => {
            if (failed || !active()) return;
            window.setTimeout(begin, 250); // keep listening for the whole call
          };
          rec.start();
        } catch (error) {
          console.warn("[call-translation] native recognition failed", error);
          failed = true;
        }
      };
      begin();
      await new Promise((r) => window.setTimeout(r, 600));
      if (!failed && active()) {
        sttFallbackRef.current = {
          ready: Promise.resolve(true),
          stop: () => {
            alive = false;
            try { rec?.abort(); } catch { /* noop */ }
          },
        };
        return true;
      }
      alive = false;
      try { rec?.abort(); } catch { /* noop */ }
    }

    const session = translationSessionRef.current + 1;
    translationSessionRef.current = session;
    let notified = false;
    let consecutiveFailures = 0;
    const handle = startSttFallback(stream, {
      remoteStream: persistentRemoteStreamRef.current,
      shouldPause: () => Date.now() < ttsBusyUntilRef.current,


      onClip: async (audio) => {
        if (!capturing() || session !== translationSessionRef.current || !mediaConnectedRef.current) return;
        try {
          let timeoutId: number | undefined;
          const timeout = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(
              () => reject(new Error("Tempo limite da transcrição excedido.")),
              15_000,
            );
          });
          const result = await Promise.race([
            transcribe({
              data: {
                audio,
                // "auto" lets the model detect the language of the speech.
                language: spokenAutoRef.current ? undefined : spokenLangRef.current,
                context: captionsMirrorRef.current
                  .slice(-2)
                  .map((item) => item.original)
                  .join(" ")
                  .slice(-600),
              },
            }),
            timeout,
          ]).finally(() => {
            if (timeoutId !== undefined) window.clearTimeout(timeoutId);
          });
          consecutiveFailures = 0;
          if (capturing() && session === translationSessionRef.current) {
            if (result.text) pushMyCaption(result.text, spokenLangRef.current);
            else pushUnclearRef.current?.();
          }
        } catch (error: any) {
          consecutiveFailures += 1;
          console.error("[call-translation] transcription failed", error);
          if (!notified && translationEnabledRef.current && session === translationSessionRef.current) {
            notified = true;
            toast.error(error?.message ?? "Não foi possível transcrever o áudio.");
          }
          if (consecutiveFailures >= 3 && session === translationSessionRef.current) {
            stopTranslationRef.current?.();
          }
        }
      },
      onStateChange: (state) => console.info("[call-translation] capture state", state),
      onError: (error) => console.error("[call-translation] audio capture failed", error),
    });
    if (!handle) {
      toast.error("Não foi possível capturar o áudio para a tradução.");
      return false;
    }
    sttFallbackRef.current = handle;
    const ready = await handle.ready;
    if (!ready || session !== translationSessionRef.current || !mediaConnectedRef.current) {
      handle.stop();
      if (sttFallbackRef.current === handle) sttFallbackRef.current = null;
      toast.error("Não foi possível iniciar a captura de áudio da tradução.");
      return false;
    }
    return true;
  }, [pushMyCaption, transcribe]);
  startCaptureRef.current = startCallTranscription;

  const startTranslation = useCallback(async () => {
    if (!mediaConnectedRef.current || roomRef.current?.state !== "connected") {
      toast.info("Aguardando a conexão da chamada.");
      return;
    }
    spokenLangRef.current = navigator.language || "pt-BR";
    translationEnabledRef.current = true;
    if (!sttFallbackRef.current && !(await startCallTranscription())) {
      translationEnabledRef.current = false;
      setTranslationEnabled(false);
      return;
    }
    setTranslationEnabled(true);
    // Ask the other phone to send captions of what they say.
    void sendSignalRef.current?.("caption", { control: "start" }).catch(() => {});
  }, [startCallTranscription]);

  const toggleTranslation = useCallback(() => {
    try {
      if (translationEnabledRef.current) stopTranslation();
      else
        void startTranslation().catch((error) => {
          console.error("[call-translation] start failed", error);
          stopTranslation();
          toast.error("Não foi possível ligar a tradução.");
        });
    } catch (error) {
      console.error("[call-translation] toggle failed", error);
      stopTranslation();
    }
  }, [startTranslation, stopTranslation]);

  const changeTranslationLanguage = useCallback(
    (language: string) => {
      const allowed = ["pt-BR", "en", "es", "fr", "de", "it", "ja", "ko", "zh", "ar"];
      if (!allowed.includes(language)) return;
      if (language === translationLanguageRef.current) return;
      // Apply the language immediately: the selector never waits for the network.
      translationLanguageRef.current = language;
      setTranslationLanguage(language);

      const visible = captionsMirrorRef.current.slice(-8).filter((item) => item.original.trim().length > 0);
      setCaptions((current) =>
        current.map((item) =>
          visible.some((v) => v.id === item.id)
            ? { ...item, translated: undefined, status: "pending" as const, error: undefined }
            : item,
        ),
      );
      if (visible.length === 0) return;

      const markFailed = (message: string) =>
        setCaptions((rows) =>
          rows.map((row) =>
            visible.some((v) => v.id === row.id) && row.status === "pending"
              ? { ...row, translated: undefined, status: "failed" as const, error: message }
              : row,
          ),
        );

      void translateMany({
        data: { items: visible.map((v) => ({ id: v.id, text: v.original })), target: language },
      })
        .then((response: { ok: boolean; error: string | null; results: { id: string; text: string; ok: boolean }[] }) => {
          if (translationLanguageRef.current !== language) return;
          if (!response.ok) {
            markFailed(response.error ?? "Não foi possível traduzir");
            return;
          }
          const map = new Map(response.results.map((r) => [r.id, r]));
          setCaptions((rows) =>
            rows.map((row) => {
              const next = map.get(row.id);
              if (!next) return row;
              return next.ok
                ? { ...row, translated: next.text, status: "done" as const, error: undefined }
                : { ...row, translated: undefined, status: "failed" as const, error: "Não foi possível traduzir" };
            }),
          );
        })
        .catch((error: any) => {
          console.error("[call-translation] batch translate failed", error);
          if (translationLanguageRef.current !== language) return;
          markFailed(error?.message ?? "Não foi possível traduzir");
        });

    },
    [translateMany],
  );

  // Keep a synchronous mirror of the captions so retries and language changes
  // can read the latest list without stale closures.
  useEffect(() => {
    captionsMirrorRef.current = captions;
  }, [captions]);


  // Audio Playback Management — re-attach the persistent stream and force
  // play() whenever new remote tracks arrive (trackUpdate bumps).
  useEffect(() => {
    const el = audioSinkRef.current;
    if (!el) return;
    const stream = remoteStream;
    if (stream && stream.getAudioTracks().length > 0) {
      stream.getAudioTracks().forEach((t) => (t.enabled = true));
      const processed = studioVoice(stream);
      if (el.srcObject !== processed) el.srcObject = processed;
      el.muted = false;
      el.volume = 1;
      const tryPlay = () => {
        resumeStudioVoice();
        const p = el.play();
        if (p && typeof p.catch === "function") {
          p.then(() => setConnectionLabel("Áudio reproduzindo"), () => setConnectionLabel("Toque na tela para liberar o áudio"));
        }
      };
      tryPlay();
      const retry = () => tryPlay();
      document.addEventListener("pointerdown", retry);
      document.addEventListener("touchstart", retry);
      const t = setTimeout(tryPlay, 800);
      return () => {
        document.removeEventListener("pointerdown", retry);
        document.removeEventListener("touchstart", retry);
        clearTimeout(t);
      };
    }
    if (!stream) {
      el.srcObject = null;
      releaseStudioVoice();
    }
  }, [remoteStream, trackUpdate]);

  // Track when the call became active (used by the floating mini bar timer).
  useEffect(() => {
    if (active?.status === "accepted") setCallStartedAt((prev) => prev ?? Date.now());
    else if (!active) setCallStartedAt(null);
  }, [active?.status, active?.id]);

  // Keep the call alive in the background: expose media session controls and
  // resume playback when the app returns to the foreground. This never changes
  // the audio pipeline itself.
  useEffect(() => {
    if (!active) return;
    const name = active.other.display_name ?? active.other.username ?? "Chamada";
    const mediaSession = (navigator as Navigator & { mediaSession?: any }).mediaSession;
    if (mediaSession && "MediaMetadata" in window) {
      try {
        mediaSession.metadata = new (window as any).MediaMetadata({ title: name, artist: "Chamada em andamento" });
        mediaSession.playbackState = "playing";
        mediaSession.setActionHandler?.("pause", () => {});
        mediaSession.setActionHandler?.("play", () => {});
      } catch { /* ignore */ }
    }
    const resume = () => {
      const el = audioSinkRef.current;
      if (!el) return;
      void audioContextRef.current?.resume?.();
      if (el.paused) void el.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      if (mediaSession) mediaSession.playbackState = "none";
    };
  }, [active?.id]);

  // ---- Screen sharing ---------------------------------------------------
  // Uses the same LiveKit/WebRTC session as the call: no second infrastructure,
  // and the native permission prompt of the OS/browser is always shown.
  const screenShareSupported = useMemo(
    () => typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function",
    [],
  );

  const toggleScreenShare = useCallback(
    async (withAudio = true) => {
      const room = roomRef.current;
      if (!room || room.state !== "connected") {
        toast.info("Aguardando a conexão da chamada.");
        return;
      }
      if (screenSharingRef.current) {
        try {
          await room.localParticipant.setScreenShareEnabled(false);
        } catch (error) {
          console.warn("[call] stop screen share failed", error);
        }
        screenSharingRef.current = false;
        setScreenSharing(false);
        setScreenAudioShared(false);
        return;
      }
      if (!screenShareSupported) {
        toast.error("Este dispositivo não permite compartilhar a tela pelo navegador.");
        return;
      }
      const enable = async (audio: boolean) => {
        await room.localParticipant.setScreenShareEnabled(
          true,
          { audio, systemAudio: audio ? "include" : "exclude", resolution: { width: 1280, height: 720 } } as never,
        );
      };
      try {
        try {
          await enable(withAudio);
          setScreenAudioShared(withAudio);
        } catch (error: any) {
          if (!withAudio || error?.name === "NotAllowedError") throw error;
          // The device refused internal audio capture: share the picture only,
          // never breaking the call.
          await enable(false);
          setScreenAudioShared(false);
          toast.info("Este dispositivo não permite enviar o áudio interno. Compartilhando só a tela.");
        }
        screenSharingRef.current = true;
        setScreenSharing(true);
      } catch (error: any) {
        if (error?.name === "NotAllowedError") {
          toast.info("Compartilhamento de tela cancelado.");
          return;
        }
        console.error("[call] screen share failed", error);
        toast.error("Não foi possível compartilhar a tela.");
      }
    },
    [screenShareSupported],
  );

  // ---- Spoken translation (text-to-speech) -------------------------------
  const speakTranslated = useCallback(
    (text: string) => {
      if (!speakTranslationsRef.current) return;
      const clean = text.trim();
      if (!clean) return;
      // Keep the microphone capture paused while we speak so the translation is
      // never transcribed back as the user's own voice.
      ttsBusyUntilRef.current = Date.now() + 2_000;
      // Free path: the device's own voice. AI voice when chosen or unavailable.
      const pref = getCallVoice();
      const aiVoice = pref.startsWith("ai:") ? pref.slice(3) : "nova";
      const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (!pref.startsWith("ai:") && synth && typeof SpeechSynthesisUtterance !== "undefined") {
        try {
          const utter = new SpeechSynthesisUtterance(clean.slice(0, 600));
          const lang = translationLanguageRef.current;
          utter.lang = lang === "pt-BR" ? "pt-BR" : lang;
          const list = deviceVoicesFor(lang);
          const chosen = pref.startsWith("device:") ? synth.getVoices().find((v) => v.voiceURI === pref.slice(7)) : undefined;
          const voice = chosen ?? list[0];
          if (voice) utter.voice = voice;
          ttsBusyUntilRef.current = Date.now() + 20_000;
          utter.onend = () => { ttsBusyUntilRef.current = Date.now() + 400; };
          utter.onerror = () => { ttsBusyUntilRef.current = 0; };
          synth.speak(utter);
          return;
        } catch (error) {
          console.warn("[call-translation] native speech failed", error);
        }
      }
      void speak({ data: { text: clean.slice(0, 600), voice: aiVoice } })
        .then((result: { audio: string; mime: string }) => {
          if (!speakTranslationsRef.current) return;
          const audio = ttsAudioRef.current ?? new Audio();
          ttsAudioRef.current = audio;
          audio.src = `data:${result.mime};base64,${result.audio}`;
          audio.onended = () => {
            ttsBusyUntilRef.current = Date.now() + 400;
          };
          ttsBusyUntilRef.current = Date.now() + 20_000;
          void audio.play().catch(() => {
            ttsBusyUntilRef.current = 0;
          });
        })
        .catch((error: unknown) => {
          ttsBusyUntilRef.current = 0;
          console.warn("[call-translation] speak failed", error);
        });
    },
    [speak],
  );
  speakTranslatedRef.current = speakTranslated;

  const toggleSpeakTranslations = useCallback(() => {
    setSpeakTranslations((prev) => {
      const next = !prev;
      speakTranslationsRef.current = next;
      if (next) {
        // Unlock the phone's voice inside the tap so later translations can play.
        try {
          const u = new SpeechSynthesisUtterance(" ");
          u.volume = 0;
          window.speechSynthesis?.speak(u);
        } catch { /* noop */ }
      }
      if (!next) {
        ttsAudioRef.current?.pause();
        try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
        ttsBusyUntilRef.current = 0;
      }
      return next;
    });
  }, []);

  const changeSpokenLanguage = useCallback((language: string) => {
    setSpokenLanguage(language);
    spokenAutoRef.current = language === "auto";
    spokenLangRef.current = language === "auto" ? navigator.language || "pt-BR" : language;
  }, []);

  const value = useMemo<Ctx>(
    () => ({ startCall: startCallWithAudioUnlock, activeCall: active }),
    [startCallWithAudioUnlock, active],
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <audio ref={audioSinkRef} autoPlay playsInline />
      {incoming ? (
        <IncomingCallDialog incoming={incoming} onAccept={acceptIncomingWithAudioUnlock} onReject={rejectIncoming} />
      ) : null}
      {active && minimized ? (
        <CallMiniBar
          name={active.other.display_name ?? active.other.username ?? "Usuário"}
          avatarUrl={active.other.avatar_url}
          status={active.status === "ringing" ? "Chamando…" : connectionLabel}
          startedAt={active.status === "accepted" ? callStartedAt : null}
          onExpand={() => setMinimized(false)}
          onHangup={hangupLocal}
        />
      ) : null}
      {active && !minimized ? (
        <CallScreenBoundary onCrash={() => stopTranslationRef.current?.()}>
        <CallScreen
          call={active}
          localStream={localStream}
          remoteStream={remoteStream}
          remoteScreenStream={remoteScreenStream}
          connectionLabel={connectionLabel}
          mediaConnected={mediaConnected}
          captions={captions}
          translationEnabled={translationEnabled}
          translationLanguage={translationLanguage}
          spokenLanguage={spokenLanguage}
          onSpokenLanguageChange={changeSpokenLanguage}
          speakTranslations={speakTranslations}
          onToggleSpeakTranslations={toggleSpeakTranslations}
          showTranscript={showTranscript}
          onToggleShowTranscript={() => setShowTranscript((v) => !v)}
          screenSharing={screenSharing}
          screenAudioShared={screenAudioShared}
          screenShareSupported={screenShareSupported}
          onToggleScreenShare={toggleScreenShare}
          onToggleTranslation={toggleTranslation}
          onTranslationLanguageChange={changeTranslationLanguage}
          onRetryCaption={retryCaption}

          onSwitchCamera={switchCamera}
          onMinimize={() => setMinimized(true)}
          onHangup={hangupLocal}
        />
        </CallScreenBoundary>
      ) : null}
    </CallContext.Provider>
  );
}

/** Keeps a rendering error in the call screen from blanking the whole app. */
class CallScreenBoundary extends Component<{ children: ReactNode; onCrash: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[call] screen crashed", error);
    this.props.onCrash();
    toast.error("A tradução foi desligada por um erro. A chamada continua.");
    window.setTimeout(() => this.setState({ failed: false }), 50);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
