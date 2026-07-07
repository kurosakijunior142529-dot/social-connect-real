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
import { createPeerConnection, getLocalMedia, stopStream } from "@/lib/webrtc";
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
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);

  // Listen for incoming calls
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
            id: string;
            caller_id: string;
            call_type: CallType;
            status: CallStatus;
          };
          if (row.status !== "ringing") return;
          // Fetch caller profile
          const { data: prof } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .eq("id", row.caller_id)
            .maybeSingle();
          setIncoming({
            id: row.id,
            type: row.call_type,
            other: prof ?? { id: row.caller_id },
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  // Listen for updates to my active/incoming calls
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`call-updates-${user.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls" },
        (payload) => {
          const row = payload.new as {
            id: string;
            status: CallStatus;
            caller_id: string;
            callee_id: string;
          };
          if (row.caller_id !== user.id && row.callee_id !== user.id) return;
          if (incoming && row.id === incoming.id && row.status !== "ringing") {
            setIncoming(null);
          }
          setActive((prev) => {
            if (!prev || prev.id !== row.id) return prev;
            if (row.status === "ended" || row.status === "rejected" || row.status === "canceled") {
              teardown();
              return null;
            }
            return { ...prev, status: row.status };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, incoming?.id]);

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
    setRemoteStream(null);
    pendingIceRef.current = [];
    remoteDescSetRef.current = false;
  }, []);

  const setupPeer = useCallback(
    async (
      callId: string,
      type: CallType,
      role: CallRole,
      selfId: string,
    ) => {
      const stream = await getLocalMedia(type === "video");
      localStreamRef.current = stream;
      setLocalStream(stream);

      const pc = createPeerConnection();
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const remote = new MediaStream();
      setRemoteStream(remote);
      pc.ontrack = (ev) => {
        ev.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
        setRemoteStream(new MediaStream(remote.getTracks()));
      };

      const channel = supabase.channel(`call-${callId}`, {
        config: { broadcast: { self: false } },
      });
      channelRef.current = channel;

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          channel.send({
            type: "broadcast",
            event: "signal",
            payload: { kind: "ice", from: selfId, candidate: ev.candidate.toJSON() },
          });
        }
      };

      channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
        if (!payload || payload.from === selfId) return;
        try {
          if (payload.kind === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSetRef.current = true;
            for (const c of pendingIceRef.current) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } catch (e) {
                console.warn("ice add failed", e);
              }
            }
            pendingIceRef.current = [];
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({
              type: "broadcast",
              event: "signal",
              payload: { kind: "answer", from: selfId, sdp: answer },
            });
          } else if (payload.kind === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSetRef.current = true;
            for (const c of pendingIceRef.current) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c));
              } catch (e) {
                console.warn("ice add failed", e);
              }
            }
            pendingIceRef.current = [];
          } else if (payload.kind === "ice") {
            if (remoteDescSetRef.current) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } catch (e) {
                console.warn("ice add failed", e);
              }
            } else {
              pendingIceRef.current.push(payload.candidate);
            }
          } else if (payload.kind === "bye") {
            hangupLocal();
          }
        } catch (e) {
          console.error("signal error", e);
        }
      });

      await new Promise<void>((resolve) => {
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
        });
      });

      if (role === "caller") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: { kind: "offer", from: selfId, sdp: offer },
        });
      }
    },
    [],
  );

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
        } catch {
          // ignore
        }
      }
      teardown();
      return null;
    });
  }, [teardown, user?.id]);

  const startCall = useCallback(
    async (other: OtherParty, type: CallType) => {
      if (!user) return;
      if (active) return;
      // Insert row
      const { data, error } = await supabase
        .from("calls")
        .insert({
          caller_id: user.id,
          callee_id: other.id,
          call_type: type,
        })
        .select("id")
        .single();
      if (error || !data) {
        console.error("start call failed", error);
        alert("Não foi possível iniciar a chamada.");
        return;
      }
      setActive({
        id: data.id,
        type,
        role: "caller",
        other,
        status: "ringing",
      });
      // Caller sets up peer immediately, waits on channel; offer will be sent, callee will only set remote after accepting and joining channel.
      try {
        await setupPeer(data.id, type, "caller", user.id);
      } catch (e) {
        console.error(e);
        alert("Não foi possível acessar câmera/microfone.");
        await supabase
          .from("calls")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", data.id);
        teardown();
        setActive(null);
      }
    },
    [user, active, setupPeer, teardown],
  );

  const acceptIncoming = useCallback(async () => {
    if (!incoming || !user) return;
    const inc = incoming;
    setIncoming(null);
    setActive({
      id: inc.id,
      type: inc.type,
      role: "callee",
      other: inc.other,
      status: "accepted",
    });
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

  // Cleanup on unmount
  useEffect(() => () => teardown(), [teardown]);

  const value = useMemo<Ctx>(() => ({ startCall, activeCall: active }), [startCall, active]);

  return (
    <CallContext.Provider value={value}>
      {children}
      {incoming ? (
        <IncomingCallDialog
          incoming={incoming}
          onAccept={acceptIncoming}
          onReject={rejectIncoming}
        />
      ) : null}
      {active ? (
        <CallScreen
          call={active}
          localStream={localStream}
          remoteStream={remoteStream}
          onHangup={hangupLocal}
        />
      ) : null}
    </CallContext.Provider>
  );
}
