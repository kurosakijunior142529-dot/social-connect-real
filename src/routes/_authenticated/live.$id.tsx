import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getViewerToken, startLive, endLive } from "@/lib/lives.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Room,
  RoomEvent,
  Track,
  createLocalTracks,
  createLocalScreenTracks,
  ConnectionQuality,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type LocalTrackPublication,
} from "livekit-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff,
  Heart, Send, MessageCircle, Users, DoorOpen, Gift, Share2, Radio, Signal,
  RefreshCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatElapsed, formatViewers } from "@/lib/live-utils";
import { GiftAnimation, type GiftEvent } from "@/components/gifts/gift-animation";
import { getGiftMeta, RARITY_STYLE } from "@/lib/gifts/catalog";

export const Route = createFileRoute("/_authenticated/live/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ host: s.host === 1 || s.host === "1" ? 1 : undefined }),
  component: LiveRoom,
});

type Live = {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  category: string | null;
  thumbnail_url: string | null;
  status: "preparing" | "live" | "ended";
  started_at: string | null;
  viewer_count: number;
  peak_viewer_count: number;
  like_count: number;
  audience: string;
};

function LiveRoom() {
  const { id: liveId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getToken = useServerFn(getViewerToken);
  const doStart = useServerFn(startLive);
  const doEnd = useServerFn(endLive);

  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [screenOn, setScreenOn] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [quality, setQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [elapsed, setElapsed] = useState("00:00");
  const [tab, setTab] = useState<"chat" | "people" | "gifts">("chat");
  const [chatInput, setChatInput] = useState("");
  const [reactions, setReactions] = useState<Array<{ id: number; emoji: string; x: number }>>([]);
  const [giftQueue, setGiftQueue] = useState<GiftEvent[]>([]);
  const [activeGift, setActiveGift] = useState<GiftEvent | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const reactionCounter = useRef(0);

  // Live query
  const liveQ = useQuery({
    queryKey: ["live", liveId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lives")
        .select("id, host_id, title, description, category, thumbnail_url, status, started_at, viewer_count, peak_viewer_count, like_count, audience")
        .eq("id", liveId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Live | null;
    },
    refetchInterval: 30000,
  });

  const hostProfileQ = useQuery({
    queryKey: ["profile", liveQ.data?.host_id],
    queryFn: async () => {
      if (!liveQ.data?.host_id) return null;
      const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url").eq("id", liveQ.data.host_id).maybeSingle();
      return data;
    },
    enabled: !!liveQ.data?.host_id,
  });

  const chatQ = useQuery({
    queryKey: ["live-chat", liveId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("live_chat_messages")
        .select("id, sender_id, content, pinned, deleted, is_highlighted, created_at")
        .eq("live_id", liveId)
        .eq("deleted", false)
        .order("created_at", { ascending: true })
        .limit(200);
      const rows = (data ?? []) as any[];
      if (!rows.length) return [];
      const ids = Array.from(new Set(rows.map((r) => r.sender_id)));
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: pmap.get(r.sender_id) }));
    },
  });

  const viewersQ = useQuery({
    queryKey: ["live-viewers", liveId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("live_viewers")
        .select("user_id, joined_at")
        .eq("live_id", liveId)
        .is("left_at", null);
      const rows = (data ?? []) as any[];
      if (!rows.length) return [];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: pmap.get(r.user_id) }));
    },
  });

  const giftCatalogQ = useQuery({
    queryKey: ["gift-catalog"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("gift_catalog").select("id, name, emoji, cost_coins, tier").eq("active", true).order("cost_coins");
      return (data ?? []) as any[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const live = liveQ.data;

  // Track viewer presence
  useEffect(() => {
    if (!live) return;
    (supabase as any).from("live_viewers").upsert({ live_id: liveId, user_id: user.id, joined_at: new Date().toISOString(), left_at: null }, { onConflict: "live_id,user_id" }).then(() => {});
    return () => {
      (supabase as any).from("live_viewers").update({ left_at: new Date().toISOString() }).eq("live_id", liveId).eq("user_id", user.id).then(() => {});
    };
  }, [live?.id, liveId, user.id]);

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel(`live-${liveId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "live_chat_messages", filter: `live_id=eq.${liveId}` }, () => qc.invalidateQueries({ queryKey: ["live-chat", liveId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "live_viewers", filter: `live_id=eq.${liveId}` }, () => qc.invalidateQueries({ queryKey: ["live-viewers", liveId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "lives", filter: `id=eq.${liveId}` }, () => qc.invalidateQueries({ queryKey: ["live", liveId] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_reactions", filter: `live_id=eq.${liveId}` }, (payload: any) => {
        const emoji = payload.new?.emoji ?? "❤️";
        const id = reactionCounter.current++;
        setReactions((r) => [...r, { id, emoji, x: 20 + Math.random() * 60 }]);
        setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 3200);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_gifts", filter: `live_id=eq.${liveId}` }, (payload: any) => {
        const gift = giftCatalogQ.data?.find((g: any) => g.id === payload.new?.gift_id);
        if (gift) {
          setGiftQueue((q) => [...q, {
            id: reactionCounter.current++,
            name: gift.name,
            emoji: gift.emoji,
          }]);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [liveId, qc, giftCatalogQ.data]);

  // Drain gift queue one at a time so back-to-back gifts play sequentially.
  useEffect(() => {
    if (activeGift || giftQueue.length === 0) return;
    setActiveGift(giftQueue[0]);
    setGiftQueue((q) => q.slice(1));
  }, [giftQueue, activeGift]);


  // Elapsed timer
  useEffect(() => {
    if (!live?.started_at || live.status !== "live") return;
    const t = setInterval(() => setElapsed(formatElapsed(live.started_at)), 1000);
    return () => clearInterval(t);
  }, [live?.started_at, live?.status]);

  // Connect LiveKit room
  const connect = useCallback(async () => {
    if (!live) return;
    if (room) return;
    try {
      const t = await getToken({ data: { liveId } });
      setIsHost(t.isHost);
      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: { simulcast: true, videoSimulcastLayers: [] },
      });
      r.on(RoomEvent.ConnectionQualityChanged, (q, p) => {
        if (p.identity === user.id) setQuality(q);
      });
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        setRemoteStreams((prev) => {
          const key = participant.identity;
          const existing = prev.get(key) ?? new MediaStream();
          try { existing.addTrack(track.mediaStreamTrack); } catch { /* noop */ }
          const next = new Map(prev);
          next.set(key, existing);
          return next;
        });
        // Attach audio via ref
        if (track.kind === Track.Kind.Audio && audioRef.current && !t.isHost) {
          try { track.attach(audioRef.current); audioRef.current.play().catch(() => {}); } catch { /* noop */ }
        }
      });
      r.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
        try { track.detach(); } catch { /* noop */ }
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(participant.identity);
          return next;
        });
      });
      r.on(RoomEvent.Disconnected, () => setConnected(false));
      await r.connect(t.wsUrl, t.token);
      setRoom(r);
      setConnected(true);

      if (t.isHost) {
        try {
          const tracks = await createLocalTracks({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1,
              sampleRate: 48000,
            },
            video: { facingMode, resolution: { width: 1280, height: 720, frameRate: 30 } },
          });
          for (const tr of tracks) await r.localParticipant.publishTrack(tr);
          // Bind local video preview
          const camPub = r.localParticipant.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
          if (camPub?.track && videoRef.current) {
            camPub.track.attach(videoRef.current);
          }
        } catch (err: any) {
          toast.error("Não foi possível acessar câmera/microfone: " + (err?.message ?? ""));
        }
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao entrar na sala");
    }
  }, [live, room, liveId, getToken, user.id, facingMode]);

  useEffect(() => {
    return () => {
      if (room) {
        try { room.disconnect(); } catch { /* noop */ }
      }
    };
  }, [room]);

  // Auto-connect once live is loaded
  useEffect(() => { void connect(); }, [connect]);

  // Attach the FIRST remote video for viewers (host stream)
  useEffect(() => {
    if (isHost || !videoRef.current) return;
    if (!live) return;
    const hostStream = remoteStreams.get(live.host_id);
    if (hostStream && videoRef.current.srcObject !== hostStream) {
      videoRef.current.srcObject = hostStream;
      videoRef.current.play().catch(() => {});
    }
  }, [remoteStreams, live?.host_id, isHost, live]);

  // Toggles
  const toggleMic = async () => {
    if (!room) return;
    const enabled = !micOn;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setMicOn(enabled);
  };
  const toggleCam = async () => {
    if (!room) return;
    const enabled = !camOn;
    await room.localParticipant.setCameraEnabled(enabled);
    setCamOn(enabled);
    if (enabled) {
      setTimeout(() => {
        const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
        if (camPub?.track && videoRef.current) camPub.track.attach(videoRef.current);
      }, 100);
    }
  };
  const flipCam = async () => {
    if (!room) return;
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    try {
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track) {
        await (camPub.track as any).restartTrack({ facingMode: next });
      }
    } catch (err) {
      toast.error("Este dispositivo não permite alternar câmera.");
    }
  };
  const toggleScreen = async () => {
    if (!room) return;
    if (screenOn) {
      const pubs = Array.from(room.localParticipant.trackPublications.values()).filter((p) => p.source === Track.Source.ScreenShare || p.source === Track.Source.ScreenShareAudio);
      for (const pub of pubs) if (pub.track) await room.localParticipant.unpublishTrack(pub.track);
      setScreenOn(false);
    } else {
      try {
        const tracks = await createLocalScreenTracks({ audio: true, resolution: { width: 1920, height: 1080, frameRate: 30 } });
        for (const t of tracks) await room.localParticipant.publishTrack(t);
        setScreenOn(true);
      } catch (err: any) {
        toast.error("Compartilhamento de tela cancelado.");
      }
    }
  };

  const goLive = async () => {
    try {
      await doStart({ data: { liveId } });
      qc.invalidateQueries({ queryKey: ["live", liveId] });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao iniciar");
    }
  };

  const finish = async () => {
    if (!confirm("Encerrar a transmissão agora?")) return;
    try {
      await doEnd({ data: { liveId } });
      if (room) try { await room.disconnect(); } catch { /* noop */ }
      navigate({ to: "/lives" });
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao encerrar");
    }
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = chatInput.trim();
    if (!content) return;
    setChatInput("");
    await (supabase as any).from("live_chat_messages").insert({ live_id: liveId, sender_id: user.id, content });
  };

  const sendReaction = async (emoji = "❤️") => {
    await (supabase as any).from("live_reactions").insert({ live_id: liveId, user_id: user.id, emoji });
  };

  const sendGift = async (gift: any) => {
    if (!live) return;
    await (supabase as any).from("live_gifts").insert({
      live_id: liveId,
      sender_id: user.id,
      recipient_id: live.host_id,
      gift_id: gift.id,
      coins_spent: gift.cost_coins,
    });
    await (supabase as any).from("live_chat_messages").insert({
      live_id: liveId,
      sender_id: user.id,
      content: `enviou ${gift.name} ${gift.emoji}`,
      is_highlighted: true,
    });
    toast.success(`${gift.emoji} ${gift.name} enviado!`);
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/live/${liveId}` : "";
    try {
      if (navigator.share) await navigator.share({ title: live?.title ?? "Live", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado!");
      }
    } catch { /* noop */ }
  };

  const qualityColor = useMemo(() => {
    switch (quality) {
      case ConnectionQuality.Excellent: return "text-emerald-400";
      case ConnectionQuality.Good: return "text-primary";
      case ConnectionQuality.Poor: return "text-amber-400";
      case ConnectionQuality.Lost: return "text-red-400";
      default: return "text-muted-foreground";
    }
  }, [quality]);

  if (liveQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando live…</div>;
  if (!live) return <div className="p-8 text-sm text-muted-foreground">Live não encontrada.</div>;

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-[calc(100vh-2rem)] gap-3 p-2 md:p-3 bg-black">
      {/* VIDEO PANE */}
      <div className="relative flex-1 min-w-0 rounded-3xl overflow-hidden bg-black border border-white/10">
        <video
          ref={videoRef}
          className="w-full h-full object-contain bg-black"
          autoPlay
          playsInline
          muted={isHost}
        />
        {!isHost && <audio ref={audioRef} autoPlay className="hidden" />}

        {/* Floating reactions */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {reactions.map((r) => (
            <span key={r.id} className="absolute bottom-0 text-3xl animate-float-up" style={{ left: `${r.x}%` }}>{r.emoji}</span>
          ))}
        </div>

        <GiftAnimation event={activeGift} onDone={() => setActiveGift(null)} />

        {/* TOP overlay */}
        <div className="absolute top-0 inset-x-0 p-3 flex items-start justify-between gap-2 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2 min-w-0">
            <UserAvatar avatarPath={hostProfileQ.data?.avatar_url ?? null} displayName={hostProfileQ.data?.display_name ?? hostProfileQ.data?.username ?? "?"} className="h-9 w-9 border-2 border-white/20" />
            <div className="min-w-0">
              <div className="text-white text-sm font-semibold truncate">{hostProfileQ.data?.display_name ?? hostProfileQ.data?.username ?? "Criador"}</div>
              <div className="text-white/70 text-xs truncate">{live.title}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {live.status === "live" && (
              <span className="inline-flex items-center gap-1 rounded-md bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest px-1.5 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Live
              </span>
            )}
            <span className="rounded-md bg-black/60 text-white text-[11px] px-2 py-1 flex items-center gap-1">
              <Users className="h-3 w-3" /> {formatViewers(viewersQ.data?.length ?? 0)}
            </span>
            <span className="rounded-md bg-black/60 text-white text-[11px] px-2 py-1 font-mono">{elapsed}</span>
            <span className={cn("rounded-md bg-black/60 text-[11px] px-2 py-1 flex items-center gap-1", qualityColor)}>
              <Signal className="h-3 w-3" />
            </span>
          </div>
        </div>

        {/* Preparing overlay for host */}
        {isHost && live.status === "preparing" && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
            <div className="text-center space-y-4 max-w-sm">
              <Radio className="h-12 w-12 text-primary mx-auto animate-pulse" />
              <h2 className="text-white text-xl font-bold">Pronto para começar?</h2>
              <p className="text-white/70 text-sm">Verifique câmera e microfone abaixo. Quando tudo estiver ok, entre ao vivo.</p>
              <Button onClick={goLive} className="rounded-full h-11 px-8 shadow-elegant" disabled={!connected}>
                <Radio className="h-4 w-4 mr-2" /> Iniciar transmissão
              </Button>
            </div>
          </div>
        )}

        {/* Ended overlay */}
        {live.status === "ended" && (
          <div className="absolute inset-0 grid place-items-center bg-black/70">
            <div className="text-center space-y-2">
              <h2 className="text-white text-2xl font-bold">Transmissão encerrada</h2>
              <p className="text-white/70 text-sm">Pico de {formatViewers(live.peak_viewer_count)} espectadores.</p>
              <Button onClick={() => navigate({ to: "/lives" })} className="mt-3 rounded-full">Voltar ao feed</Button>
            </div>
          </div>
        )}

        {/* BOTTOM controls */}
        <div className="absolute bottom-0 inset-x-0 p-3 flex items-center gap-2 justify-center bg-gradient-to-t from-black/70 to-transparent">
          {isHost ? (
            <>
              <IconBtn onClick={toggleMic} active={micOn} Icon={micOn ? Mic : MicOff} label={micOn ? "Mudo" : "Ativar"} />
              <IconBtn onClick={toggleCam} active={camOn} Icon={camOn ? Video : VideoOff} label={camOn ? "Câmera" : "Ligar câmera"} />
              <IconBtn onClick={flipCam} Icon={RefreshCcw} label="Flip" />
              <IconBtn onClick={toggleScreen} active={screenOn} Icon={screenOn ? MonitorOff : MonitorUp} label={screenOn ? "Parar tela" : "Compartilhar tela"} />
              <IconBtn onClick={share} Icon={Share2} label="Compartilhar" />
              <button onClick={finish} className="ml-2 h-11 px-4 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm font-semibold flex items-center gap-1.5">
                <DoorOpen className="h-4 w-4" /> Encerrar
              </button>
            </>
          ) : (
            <>
              <IconBtn onClick={() => sendReaction("❤️")} Icon={Heart} label="Curtir" />
              <IconBtn onClick={() => setTab("gifts")} Icon={Gift} label="Presente" />
              <IconBtn onClick={share} Icon={Share2} label="Compartilhar" />
              <button onClick={() => navigate({ to: "/lives" })} className="ml-2 h-11 px-4 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm font-semibold">
                Sair
              </button>
            </>
          )}
        </div>
      </div>

      {/* SIDE PANEL */}
      <aside className="md:w-[380px] flex flex-col rounded-3xl overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)]">
        <div className="flex hairline-b">
          <TabBtn active={tab === "chat"} onClick={() => setTab("chat")} Icon={MessageCircle}>Chat</TabBtn>
          <TabBtn active={tab === "people"} onClick={() => setTab("people")} Icon={Users}>Pessoas ({viewersQ.data?.length ?? 0})</TabBtn>
          <TabBtn active={tab === "gifts"} onClick={() => setTab("gifts")} Icon={Gift}>Presentes</TabBtn>
        </div>

        {tab === "chat" && (
          <>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {chatQ.data?.length ? chatQ.data.map((m: any) => (
                <div key={m.id} className={cn("flex items-start gap-2 rounded-xl p-2", m.is_highlighted ? "bg-primary/10 ring-1 ring-primary/40" : "")}>
                  <UserAvatar avatarPath={m.profile?.avatar_url ?? null} displayName={m.profile?.display_name ?? m.profile?.username ?? "?"} className="h-6 w-6" />
                  <div className="text-[13px] min-w-0 flex-1">
                    <span className="font-semibold text-primary mr-1.5">{m.profile?.display_name ?? m.profile?.username ?? "user"}</span>
                    <span className="break-words">{m.content}</span>
                  </div>
                </div>
              )) : <p className="text-sm text-muted-foreground text-center py-6">Seja o primeiro a comentar 👋</p>}
            </div>
            <form onSubmit={sendChat} className="flex gap-2 p-3 hairline-t">
              <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Diga algo…" maxLength={500} className="rounded-full bg-background" />
              <Button size="icon" type="submit" className="rounded-full"><Send className="h-4 w-4" /></Button>
            </form>
          </>
        )}

        {tab === "people" && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {viewersQ.data?.map((v: any) => (
              <div key={v.user_id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-[color:var(--surface-2)]">
                <UserAvatar avatarPath={v.profile?.avatar_url ?? null} displayName={v.profile?.display_name ?? v.profile?.username ?? "?"} className="h-8 w-8" />
                <div className="text-sm flex-1 min-w-0 truncate">
                  {v.profile?.display_name ?? v.profile?.username ?? "Espectador"}
                  {v.user_id === live.host_id && <span className="ml-1 text-[10px] text-primary font-semibold">HOST</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "gifts" && (
          <div className="flex-1 overflow-y-auto p-3 grid grid-cols-3 gap-2">
            {giftCatalogQ.data?.map((g) => {
              const meta = getGiftMeta(g.name);
              const r = RARITY_STYLE[meta.rarity];
              return (
                <button
                  key={g.id}
                  onClick={() => sendGift(g)}
                  disabled={user.id === live.host_id}
                  className={cn(
                    "relative rounded-2xl border p-3 transition text-center disabled:opacity-40 overflow-hidden",
                    r.ring,
                    "hover:-translate-y-0.5",
                  )}
                  style={{
                    background: `linear-gradient(160deg, ${meta.color}18, transparent 70%)`,
                    boxShadow: r.glow,
                  }}
                >
                  <div className="text-3xl drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">{g.emoji}</div>
                  <div className="text-[11px] font-semibold mt-1 truncate">{g.name}</div>
                  <div className={cn("text-[9px] uppercase tracking-widest font-bold", r.text)}>{r.label}</div>
                  <div className="text-[10px] text-primary mt-0.5">{g.cost_coins} 🪙</div>
                </button>
              );
            })}
            <p className="col-span-3 text-[11px] text-muted-foreground text-center mt-2">
              Envie presentes épicos para apoiar o criador ✨
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

function IconBtn({ onClick, Icon, active, label }: { onClick: () => void; Icon: typeof Mic; active?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "h-11 w-11 rounded-full grid place-items-center transition text-white",
        active === false ? "bg-red-500/80 hover:bg-red-500" : "bg-white/10 hover:bg-white/20",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function TabBtn({ active, onClick, Icon, children }: { active: boolean; onClick: () => void; Icon: typeof MessageCircle; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cn("flex-1 py-2.5 text-[12px] font-medium flex items-center justify-center gap-1.5 transition", active ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground")}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}
