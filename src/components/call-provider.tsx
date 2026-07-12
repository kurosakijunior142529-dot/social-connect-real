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
import { IncomingCallDialog } from "@/components/incoming-call-dialog";
import { createPeerConnection, getCameraTrack, getLocalMedia, stopStream } from "@/lib/webrtc";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

const CallContext = createContext<Ctx | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be inside CallProvider");
  return ctx;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  
  // persistentRemoteStreamRef holds the actual MediaStream object throughout the call
  const persistentRemoteStreamRef = useRef<MediaStream>(new MediaStream());
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [trackUpdate, setTrackUpdate] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const facingModeRef = useRef<"user" | "environment">("user");
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const callerReadyRef = useRef(false);
  const [connectionLabel, setConnectionLabel] = useState("Conectando");

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
    setConnectionLabel("Conectando");
  }, []);

  const setupPeer = useCallback(
    async (callId: string, type: CallType, role: CallRole, selfId: string) => {
      const stream = localStreamRef.current ?? (await getLocalMedia(type === "video", facingModeRef.current));
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection();
      pcRef.current = pc;
      videoSenderRef.current = null;
      pc.addTransceiver("audio", { direction: "sendrecv" });
      if (type === "video") pc.addTransceiver("video", { direction: "sendrecv" });
      stream.getTracks().forEach((t) => {
        const sender = pc.addTrack(t, stream);
        if (t.kind === "video") videoSenderRef.current = sender;
      });

      const remote = persistentRemoteStreamRef.current;
      setRemoteStream(remote);
      
      pc.ontrack = (ev) => {
        const src = ev.streams[0];
        const incomingTracks = src ? src.getTracks() : ev.track ? [ev.track] : [];
        let added = false;
        for (const t of incomingTracks) {
          if (!remote.getTracks().find((rt) => rt.id === t.id)) {
            remote.addTrack(t);
            added = true;
          }
        }
        if (added) {
          setTrackUpdate(v => v + 1);
          // We still trigger a state change for the UI, but we keep the SAME MediaStream object
          // so the audio element doesn't reset its srcObject.
          setRemoteStream(new MediaStream(remote.getTracks()));
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        setConnectionLabel(
          state === "connected" || state === "completed"
            ? "Conectado"
            : state === "checking"
              ? "Estabilizando"
              : state === "failed" || state === "disconnected"
                ? "Reconectando"
                : "Conectando",
        );
        if (state === "failed" || state === "disconnected") {
          try { pc.restartIce(); } catch (e) { console.warn("restartIce failed", e); }
        }
      };

      const sendSignal = async (kind: "offer" | "answer" | "ice" | "bye", payload: Record<string, unknown>) => {
        const { error } = await (supabase as any).from("call_signals").insert({
          call_id: callId,
          sender_id: selfId,
          kind,
          payload,
        });
        if (error) console.warn("call signal insert failed", error);
      };

      const handleSignal = async (row: any) => {
        if (!row || row.sender_id === selfId || processedSignalsRef.current.has(row.id)) return;
        processedSignalsRef.current.add(row.id);
        const payload = row.payload ?? {};
        try {
          if (row.kind === "offer" && role === "callee") {
            if (pc.signalingState !== "stable") return;
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSetRef.current = true;
            for (const c of pendingIceRef.current) {
              try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn(e); }
            }
            pendingIceRef.current = [];
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal("answer", { sdp: answer });
          } else if (row.kind === "answer" && role === "caller") {
            if (pc.signalingState === "stable") return;
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSetRef.current = true;
            for (const c of pendingIceRef.current) {
              try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { console.warn(e); }
            }
            pendingIceRef.current = [];
          } else if (row.kind === "ice") {
            const candidate = payload.candidate as RTCIceCandidateInit | undefined;
            if (!candidate) return;
            if (remoteDescSetRef.current) {
              try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn(e); }
            } else {
              pendingIceRef.current.push(candidate);
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

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          void sendSignal("ice", { candidate: ev.candidate.toJSON() });
        }
      };

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

      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal("offer", { sdp: offer });
      }
    },
    [],
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
          channelRef.current?.send({
            type: "broadcast",
            event: "signal",
            payload: { kind: "bye", from: user?.id },
          });
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
      await setupPeer(inc.id, inc.type, "callee", user.id);
      await supabase
        .from("calls")
        .update({ status: "accepted", accepted_at: new Date().toISOString() })
        .eq("id", inc.id);
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

  // Audio Playback Management
  useEffect(() => {
    const el = audioSinkRef.current;
    if (!el) return;
    
    const stream = remoteStream;
    if (stream && stream.getTracks().length > 0) {
      // Avoid resetting srcObject if it's essentially the same stream
      // We check the ID of the first track as a heuristic
      const currentStream = el.srcObject as MediaStream | null;
      const currentTrackId = currentStream?.getTracks()[0]?.id;
      const newTrackId = stream.getTracks()[0]?.id;
      
      if (el.srcObject !== stream && currentTrackId !== newTrackId) {
        el.srcObject = stream;
      }
      
      el.muted = false;
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else if (!stream) {
      el.srcObject = null;
    }
  }, [remoteStream]);

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
      {active ? (
        <CallScreen
          call={active}
          localStream={localStream}
          remoteStream={remoteStream}
          connectionLabel={connectionLabel}
          onSwitchCamera={switchCamera}
          onHangup={hangupLocal}
        />
      ) : null}
    </CallContext.Provider>
  );
}
