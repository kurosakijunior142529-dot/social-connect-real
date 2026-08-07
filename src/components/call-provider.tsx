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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CallScreen } from "@/components/call-screen";
import { CallMiniBar } from "@/components/call-mini-bar";
import { IncomingCallDialog } from "@/components/incoming-call-dialog";
import { getCameraTrack, getLocalMedia, stopStream } from "@/lib/webrtc";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { translateText, translateBatch } from "@/lib/ai.functions";
import { transcribeCallClip } from "@/lib/call-transcribe.functions";
import { startSttFallback, type SttFallbackHandle } from "@/lib/call-stt-fallback";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getCallAccess } from "@/lib/calls.functions";
import {
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
  const recognitionRef = useRef<any>(null);
  const sttFallbackRef = useRef<SttFallbackHandle | null>(null);
  const spokenLangRef = useRef<string>("pt-BR");
  const transcribe = useServerFn(transcribeCallClip);
  const translateMany = useServerFn(translateBatch);
  const translationEnabledRef = useRef(false);
  const translationLanguageRef = useRef("pt-BR");
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState("pt-BR");
  const [captions, setCaptions] = useState<CallCaption[]>([]);
  const [connectionLabel, setConnectionLabel] = useState("Conectando");
  const previousUserIdRef = useRef<string | null>(null);

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
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    translationEnabledRef.current = false;
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
      const stream = localStreamRef.current ?? (await getLocalMedia(type === "video", facingModeRef.current));
      localStreamRef.current = stream;
      setLocalStream(stream);

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack || audioTrack.readyState !== "live") {
        throw new Error("O microfone não está gerando uma faixa de áudio ativa");
      }
      audioTrack.enabled = true;
      setConnectionLabel("Microfone ativo");

      try {
        const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          const context = new AudioContextCtor();
          audioContextRef.current = context;
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          context.createMediaStreamSource(new MediaStream([audioTrack])).connect(analyser);
          const samples = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(samples);
        }
      } catch (error) {
        console.warn("microphone analyser unavailable", error);
      }

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
            const original = typeof payload.text === "string" ? payload.text.trim() : "";
            if (!original || !translationEnabledRef.current) return;
            const id = String(row.id);
            setCaptions((current) => [...current.slice(-60), { id, speaker: "other", original }]);
            try {
              const result = await translate({ data: { text: original, target: translationLanguageRef.current } });
              setCaptions((current) => current.map((item) => item.id === id ? { ...item, translated: result.text } : item));
            } catch {
              setCaptions((current) => current.map((item) => item.id === id ? { ...item, translated: original } : item));
            }
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
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
        const mediaTrack = track.mediaStreamTrack;
        if (!remote.getTracks().some((current) => current.id === mediaTrack.id)) remote.addTrack(mediaTrack);
        setRemoteStream(remote);
        setTrackUpdate((value) => value + 1);
        if (track.kind === Track.Kind.Audio) setConnectionLabel("Áudio recebido");
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        remote.removeTrack(track.mediaStreamTrack);
        setTrackUpdate((value) => value + 1);
      });
      room.on(RoomEvent.Reconnecting, () => setConnectionLabel("Reconectando"));
      room.on(RoomEvent.Reconnected, () => setConnectionLabel("Conectado"));
      room.on(RoomEvent.Disconnected, () => setConnectionLabel("Desconectado"));

      await room.connect(access.wsUrl, access.token);
      await room.startAudio().catch(() => setConnectionLabel("Toque na tela para liberar o áudio"));
      setConnectionLabel("Enviando áudio");
      await room.localParticipant.publishTrack(new LocalAudioTrack(audioTrack), {
        source: Track.Source.Microphone,
        dtx: true,
        red: true,
      });
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
            .select("id, username, display_name, avatar_url")
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
          .select("id, username, display_name, avatar_url")
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
        alert(msg);
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
        alert("Não foi possível iniciar a chamada.");
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
      alert("Não foi possível acessar câmera/microfone.");
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
      alert("Não foi possível alternar a câmera neste dispositivo.");
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
  // Everything I say is transcribed locally (Web Speech API, or AI transcription
  // as a fallback) and translated into the language I picked, together with the
  // captions the other side broadcasts.

  const pushMyCaption = useCallback(
    (text: string, sourceLang: string) => {
      const clean = text.trim();
      if (!clean) return;
      const id = crypto.randomUUID();
      setCaptions((current) => [...current.slice(-60), { id, speaker: "me", original: clean }]);
      void sendSignalRef.current?.("caption", { text: clean, language: sourceLang });

      const target = translationLanguageRef.current;
      if (sourceLang.split("-")[0] === target.split("-")[0]) {
        setCaptions((current) =>
          current.map((item) => (item.id === id ? { ...item, translated: clean } : item)),
        );
        return;
      }
      void translate({ data: { text: clean, target } })
        .then((result) => {
          setCaptions((current) =>
            current.map((item) => (item.id === id ? { ...item, translated: result.text } : item)),
          );
        })
        .catch((error) => {
          console.error("[call-translation] translate failed", error);
          setCaptions((current) =>
            current.map((item) => (item.id === id ? { ...item, translated: clean } : item)),
          );
        });
    },
    [translate],
  );

  const stopTranslation = useCallback(() => {
    translationEnabledRef.current = false;
    try {
      recognitionRef.current?.stop?.();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
    sttFallbackRef.current?.stop();
    sttFallbackRef.current = null;
    setTranslationEnabled(false);
  }, []);

  /** Fallback for browsers without the Web Speech API (Android WebView, Firefox). */
  const startAiTranscription = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      toast.error("Ative o microfone para usar a tradução ao vivo.");
      return false;
    }
    let notified = false;
    const handle = startSttFallback(stream, {
      onClip: async (audio) => {
        if (!translationEnabledRef.current) return;
        try {
          const result = await transcribe({ data: { audio, language: spokenLangRef.current } });
          if (translationEnabledRef.current && result.text) {
            pushMyCaption(result.text, spokenLangRef.current);
          }
        } catch (error: any) {
          console.error("[call-translation] transcription failed", error);
          if (!notified) {
            notified = true;
            toast.error(error?.message ?? "Não foi possível transcrever o áudio.");
          }
        }
      },
      onError: (error) => console.error("[call-translation] audio capture failed", error),
    });
    if (!handle) {
      toast.error("Não foi possível capturar o áudio para a tradução.");
      return false;
    }
    sttFallbackRef.current = handle;
    return true;
  }, [pushMyCaption, transcribe]);

  const startTranslation = useCallback(() => {
    const browserWindow = window as unknown as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    spokenLangRef.current = navigator.language || "pt-BR";
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;

    if (!Recognition) {
      translationEnabledRef.current = true;
      if (!startAiTranscription()) {
        translationEnabledRef.current = false;
        return;
      }
      setTranslationEnabled(true);
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = spokenLangRef.current;
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (!event.results[i].isFinal) continue;
        pushMyCaption(String(event.results[i][0]?.transcript ?? ""), recognition.lang);
      }
    };
    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      console.error("[call-translation] recognition error", event.error);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        toast.error("Permissão de microfone negada para a tradução.");
        stopTranslation();
        return;
      }
      // Network/engine failures: fall back to AI transcription instead of dying.
      if (translationEnabledRef.current && !sttFallbackRef.current) {
        try {
          recognition.stop();
        } catch {
          /* noop */
        }
        recognitionRef.current = null;
        startAiTranscription();
      }
    };
    recognition.onend = () => {
      if (translationEnabledRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          /* already restarting */
        }
      }
    };
    translationEnabledRef.current = true;
    recognitionRef.current = recognition;
    setTranslationEnabled(true);
    try {
      recognition.start();
    } catch (error) {
      console.error("[call-translation] could not start recognition", error);
      recognitionRef.current = null;
      if (!startAiTranscription()) stopTranslation();
    }
  }, [pushMyCaption, startAiTranscription, stopTranslation]);

  const toggleTranslation = useCallback(() => {
    if (translationEnabledRef.current) stopTranslation();
    else startTranslation();
  }, [startTranslation, stopTranslation]);

  const changeTranslationLanguage = useCallback(
    (language: string) => {
      if (language === translationLanguageRef.current) return;
      translationLanguageRef.current = language;
      setTranslationLanguage(language);

      // Re-translate what is currently on screen so the change is immediate.
      setCaptions((current) => {
        const visible = current.slice(-8).filter((item) => item.original.trim().length > 0);
        if (visible.length > 0) {
          void translateMany({
            data: { items: visible.map((v) => ({ id: v.id, text: v.original })), target: language },
          })
            .then(({ results }: { results: { id: string; text: string }[] }) => {
              const map = new Map<string, string>(results.map((r) => [r.id, r.text]));
              setCaptions((rows) =>
                rows.map((row) => {
                  const next = map.get(row.id);
                  return next ? { ...row, translated: next } : row;
                }),
              );
            })
            .catch((error: unknown) => console.error("[call-translation] batch translate failed", error));
        }
        return current.map((item) =>
          visible.some((v) => v.id === item.id) ? { ...item, translated: undefined } : item,
        );
      });
    },
    [translateMany],
  );

  // Audio Playback Management — re-attach the persistent stream and force
  // play() whenever new remote tracks arrive (trackUpdate bumps).
  useEffect(() => {
    const el = audioSinkRef.current;
    if (!el) return;
    const stream = remoteStream;
    if (stream && stream.getAudioTracks().length > 0) {
      stream.getAudioTracks().forEach((t) => (t.enabled = true));
      if (el.srcObject !== stream) el.srcObject = stream;
      el.muted = false;
      el.volume = 1;
        const tryPlay = () => {
        const p = el.play();
          if (p && typeof p.catch === "function") {
            p.then(() => setConnectionLabel("Áudio reproduzindo"), () => setConnectionLabel("Toque na tela para liberar o áudio"));
          }
      };
      tryPlay();
      // Autoplay can still be blocked (no prior gesture on this document):
      // retry on the next user interaction and shortly after negotiation.
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
    if (!stream) el.srcObject = null;
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
        <CallScreen
          call={active}
          localStream={localStream}
          remoteStream={remoteStream}
          connectionLabel={connectionLabel}
          captions={captions}
          translationEnabled={translationEnabled}
          translationLanguage={translationLanguage}
          onToggleTranslation={toggleTranslation}
          onTranslationLanguageChange={changeTranslationLanguage}
          onSwitchCamera={switchCamera}
          onMinimize={() => setMinimized(true)}
          onHangup={hangupLocal}
        />
      ) : null}
    </CallContext.Provider>
  );
}
