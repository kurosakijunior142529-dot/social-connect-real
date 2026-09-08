import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff,
  Heart, Send, MessageCircle, Users, DoorOpen, Gift, Share2, Radio, Signal,
  RefreshCcw, X, Pin, Trash2, ShieldBan, ShieldPlus, MoreVertical, Crown,
  BarChart3, Flag, UserPlus, Check,
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
  ended_at: string | null;
  viewer_count: number;
  peak_viewer_count: number;
  like_count: number;
  audience: string;
};

const QUICK_REACTIONS = ["❤️", "🔥", "👏", "😂", "🎉", "😮"];

/** Presets de captura da câmera — até 4K e 120 fps quando o aparelho permitir. */
type QualityKey = "720p30" | "1080p60" | "1440p60" | "4k60" | "4k120";
const QUALITY_PRESETS: Record<QualityKey, { label: string; width: number; height: number; frameRate: number }> = {
  "720p30": { label: "HD 720p · 30fps", width: 1280, height: 720, frameRate: 30 },
  "1080p60": { label: "Full HD 1080p · 60fps", width: 1920, height: 1080, frameRate: 60 },
  "1440p60": { label: "QHD 1440p · 60fps", width: 2560, height: 1440, frameRate: 60 },
  "4k60": { label: "4K · 60fps", width: 3840, height: 2160, frameRate: 60 },
  "4k120": { label: "4K · 120fps", width: 3840, height: 2160, frameRate: 120 },
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
  const [videoQuality, setVideoQuality] = useState<QualityKey>("1080p60");
  const [quality, setQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [elapsed, setElapsed] = useState("00:00");
  const [tab, setTab] = useState<"chat" | "people" | "gifts">("chat");
  const [chatInput, setChatInput] = useState("");
  const [reactions, setReactions] = useState<Array<{ id: number; emoji: string; x: number }>>([]);
  const [giftQueue, setGiftQueue] = useState<GiftEvent[]>([]);
  const [activeGift, setActiveGift] = useState<GiftEvent | null>(null);
  const [mobileSheet, setMobileSheet] = useState<null | "chat" | "people" | "gifts" | "panel">(null);
  const [showReactionBar, setShowReactionBar] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const reactionCounter = useRef(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Live query
  const liveQ = useQuery({
    queryKey: ["live", liveId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lives")
        .select("id, host_id, title, description, category, thumbnail_url, status, started_at, ended_at, viewer_count, peak_viewer_count, like_count, audience")
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
      const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, badge_variant").eq("id", liveQ.data.host_id).maybeSingle();
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
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, badge_variant").in("id", ids);
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
      const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url, is_verified, badge_variant").in("id", ids);
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

  /** Presentes recebidos + ranking de apoiadores da transmissão. */
  const supportersQ = useQuery({
    queryKey: ["live-supporters", liveId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("live_gifts")
        .select("sender_id, coins_spent")
        .eq("live_id", liveId);
      const rows = (data ?? []) as any[];
      const totals = new Map<string, number>();
      let coins = 0;
      for (const r of rows) {
        coins += r.coins_spent ?? 0;
        totals.set(r.sender_id, (totals.get(r.sender_id) ?? 0) + (r.coins_spent ?? 0));
      }
      const ids = Array.from(totals.keys());
      let pmap = new Map<string, any>();
      if (ids.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
        pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
      }
      const top = ids
        .map((id) => ({ id, coins: totals.get(id) ?? 0, profile: pmap.get(id) }))
        .sort((a, b) => b.coins - a.coins)
        .slice(0, 10);
      return { count: rows.length, coins, top };
    },
  });

  const modsQ = useQuery({
    queryKey: ["live-mods", liveId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("live_moderators").select("user_id").eq("live_id", liveId);
      return ((data ?? []) as any[]).map((r) => r.user_id as string);
    },
  });

  const live = liveQ.data;
  const hostId = live?.host_id;
  const amHostUser = !!hostId && hostId === user.id;
  const canModerate = amHostUser || (modsQ.data ?? []).includes(user.id);

  const followQ = useQuery({
    queryKey: ["live-follow", hostId, user.id],
    queryFn: async () => {
      if (!hostId || hostId === user.id) return false;
      const { data } = await supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", hostId).maybeSingle();
      return !!data;
    },
    enabled: !!hostId,
  });

  const toggleFollow = async () => {
    if (!hostId || hostId === user.id) return;
    if (followQ.data) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", hostId);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: hostId });
    }
    qc.invalidateQueries({ queryKey: ["live-follow", hostId, user.id] });
  };

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
        setReactions((r) => [...r.slice(-14), { id, emoji, x: 20 + Math.random() * 60 }]);
        setTimeout(() => setReactions((r) => r.filter((x) => x.id !== id)), 3200);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_gifts", filter: `live_id=eq.${liveId}` }, (payload: any) => {
        qc.invalidateQueries({ queryKey: ["live-supporters", liveId] });
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

  // Host heartbeat: keeps the live marked as active. Without it,
  // end_stale_lives() closes the broadcast after 3 minutes of silence.
  useEffect(() => {
    if (!isHost || !live || live.status === "ended") return;
    const beat = () => { void (supabase as any).rpc("live_heartbeat", { _live_id: liveId }); };
    beat();
    const t = setInterval(beat, 30000);
    return () => clearInterval(t);
  }, [isHost, live?.status, live?.id, liveId, live]);

  // Host leaving the page ends the broadcast instead of leaving a ghost live.
  useEffect(() => {
    if (!isHost || !live || live.status !== "live") return;
    const onLeave = () => {
      try {
        (supabase as any)
          .from("lives")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", liveId)
          .eq("host_id", user.id)
          .then(() => {});
      } catch { /* noop */ }
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [isHost, live?.status, liveId, user.id, live]);

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
          const preset = QUALITY_PRESETS[videoQuality];
          const audio = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
          };
          let tracks;
          try {
            tracks = await createLocalTracks({
              audio,
              video: { facingMode, resolution: { width: preset.width, height: preset.height, frameRate: preset.frameRate } },
            });
          } catch {
            // Aparelho não suporta o preset escolhido: cai para Full HD.
            tracks = await createLocalTracks({
              audio,
              video: { facingMode, resolution: { width: 1920, height: 1080, frameRate: 30 } },
            });
            toast.message("Seu aparelho não suporta essa qualidade. Usando Full HD.");
          }
          for (const tr of tracks) {
            await r.localParticipant.publishTrack(tr, {
              videoEncoding: tr.kind === "video"
                ? { maxBitrate: bitrateFor(videoQuality), maxFramerate: preset.frameRate }
                : undefined,
            });
          }
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

  // Mantém o chat rolado no fim quando chegam mensagens novas.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatQ.data?.length]);

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
    } catch {
      toast.error("Este dispositivo não permite alternar câmera.");
    }
  };
  /** Troca a qualidade da câmera durante a transmissão, sem encerrar a live. */
  const changeQuality = async (key: QualityKey) => {
    setVideoQuality(key);
    const p = QUALITY_PRESETS[key];
    if (!room) return;
    try {
      const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
      if (camPub?.track) {
        await (camPub.track as any).restartTrack({
          facingMode,
          resolution: { width: p.width, height: p.height, frameRate: p.frameRate },
        });
        toast.success(`Qualidade: ${p.label}`);
      }
    } catch {
      toast.error("Seu aparelho não suporta essa qualidade.");
    }
  };

  /** Compartilha tela do PC, do celular (quando suportado) ou de um jogo. */
  const toggleScreen = async () => {
    if (!room) return;
    if (screenOn) {
      const pubs = Array.from(room.localParticipant.trackPublications.values()).filter((p) => p.source === Track.Source.ScreenShare || p.source === Track.Source.ScreenShareAudio);
      for (const pub of pubs) if (pub.track) await room.localParticipant.unpublishTrack(pub.track);
      setScreenOn(false);
      return;
    }
    const canCapture = typeof navigator !== "undefined"
      && !!(navigator.mediaDevices as any)?.getDisplayMedia;
    if (!canCapture) {
      toast.error("Este navegador não permite transmitir a tela. No celular, use o app do Vibely ou transmita pelo PC.");
      return;
    }
    const p = QUALITY_PRESETS[videoQuality];
    try {
      let tracks;
      try {
        tracks = await createLocalScreenTracks({
          audio: true,
          resolution: { width: p.width, height: p.height, frameRate: Math.min(p.frameRate, 60) },
        });
      } catch {
        tracks = await createLocalScreenTracks({ audio: true, resolution: { width: 1920, height: 1080, frameRate: 60 } });
      }
      for (const t of tracks) {
        await room.localParticipant.publishTrack(t, {
          videoEncoding: t.kind === "video" ? { maxBitrate: bitrateFor(videoQuality), maxFramerate: Math.min(p.frameRate, 60) } : undefined,
        });
        if (t.kind === "video") {
          t.mediaStreamTrack.addEventListener("ended", () => setScreenOn(false), { once: true });
        }
      }
      setScreenOn(true);
      toast.success("Transmitindo sua tela.");
    } catch {
      toast.error("Compartilhamento de tela cancelado.");
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
      qc.invalidateQueries({ queryKey: ["live", liveId] });
      setMobileSheet(null);
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
    const { error } = await supabase.rpc("send_live_gift", {
      _live_id: liveId,
      _gift_id: gift.id,
      _message: `${gift.name} ${gift.emoji}`,
    });
    if (error) {
      toast.error(error.message || "Não foi possível enviar o presente");
      return;
    }
    toast.success(`${gift.emoji} ${gift.name} enviado!`);
  };

  // ---- Moderação ----
  const deleteMessage = async (id: string) => {
    const { error } = await (supabase as any).from("live_chat_messages").update({ deleted: true }).eq("id", id);
    if (error) return toast.error("Não foi possível apagar o comentário.");
    qc.invalidateQueries({ queryKey: ["live-chat", liveId] });
  };
  const pinMessage = async (m: any) => {
    const { error } = await (supabase as any).from("live_chat_messages").update({ pinned: !m.pinned }).eq("id", m.id);
    if (error) return toast.error("Não foi possível fixar o comentário.");
    qc.invalidateQueries({ queryKey: ["live-chat", liveId] });
  };
  const banUser = async (uid: string) => {
    if (uid === hostId) return;
    const { error } = await (supabase as any).from("live_bans").insert({ live_id: liveId, user_id: uid, banned_by: user.id });
    if (error) return toast.error("Não foi possível remover o usuário.");
    await (supabase as any).from("live_viewers").update({ left_at: new Date().toISOString() }).eq("live_id", liveId).eq("user_id", uid);
    toast.success("Usuário removido da transmissão.");
    qc.invalidateQueries({ queryKey: ["live-viewers", liveId] });
  };
  const addModerator = async (uid: string) => {
    const { error } = await (supabase as any).from("live_moderators").insert({ live_id: liveId, user_id: uid, added_by: user.id });
    if (error) return toast.error("Não foi possível adicionar moderador.");
    toast.success("Moderador adicionado.");
    qc.invalidateQueries({ queryKey: ["live-mods", liveId] });
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
      default: return "text-white/60";
    }
  }, [quality]);

  const pinned = (chatQ.data ?? []).filter((m: any) => m.pinned).slice(-1)[0];
  const lastMessages = (chatQ.data ?? []).slice(-6);

  if (liveQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Carregando live…</div>;
  if (!live) return <div className="p-8 text-sm text-muted-foreground">Live não encontrada.</div>;

  const chatList = (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {chatQ.data?.length ? chatQ.data.map((m: any) => (
        <ChatRow
          key={m.id}
          m={m}
          hostId={live.host_id}
          canModerate={canModerate}
          amHostUser={amHostUser}
          onPin={() => pinMessage(m)}
          onDelete={() => deleteMessage(m.id)}
          onBan={() => banUser(m.sender_id)}
          onMod={() => addModerator(m.sender_id)}
        />
      )) : <p className="text-sm text-muted-foreground text-center py-6">Seja o primeiro a comentar 👋</p>}
      <div ref={chatEndRef} />
    </div>
  );

  const peopleList = (
    <div className="flex-1 overflow-y-auto p-2 space-y-1">
      {viewersQ.data?.map((v: any) => (
        <div key={v.user_id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-[color:var(--surface-2)]">
          <UserAvatar avatarPath={v.profile?.avatar_url ?? null} displayName={v.profile?.display_name ?? v.profile?.username ?? "?"} className="h-8 w-8" />
          <div className="text-sm flex-1 min-w-0 truncate">
            {v.profile?.display_name ?? v.profile?.username ?? "Espectador"}
            {v.user_id === live.host_id && <span className="ml-1 text-[10px] text-primary font-semibold">HOST</span>}
            {(modsQ.data ?? []).includes(v.user_id) && v.user_id !== live.host_id && (
              <span className="ml-1 text-[10px] text-amber-400 font-semibold">MOD</span>
            )}
          </div>
          {canModerate && v.user_id !== live.host_id && v.user_id !== user.id && (
            <DropdownMenu>
              <DropdownMenuTrigger className="h-7 w-7 grid place-items-center rounded-full hover:bg-white/10">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {amHostUser && (
                  <DropdownMenuItem onClick={() => addModerator(v.user_id)}>
                    <ShieldPlus className="h-4 w-4 mr-2" /> Tornar moderador
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-red-400" onClick={() => banUser(v.user_id)}>
                  <ShieldBan className="h-4 w-4 mr-2" /> Remover da live
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}
    </div>
  );

  const giftsGrid = (
    <div className="flex-1 overflow-y-auto p-3">
      {!!supportersQ.data?.top.length && (
        <div className="mb-3 rounded-2xl border border-[color:var(--hairline)] p-3">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
            <Crown className="h-3.5 w-3.5 text-amber-400" /> Principais apoiadores
          </div>
          <div className="space-y-1.5">
            {supportersQ.data.top.slice(0, 5).map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                <UserAvatar avatarPath={s.profile?.avatar_url ?? null} displayName={s.profile?.display_name ?? "?"} className="h-6 w-6" />
                <span className="flex-1 truncate">{s.profile?.display_name ?? s.profile?.username ?? "Apoiador"}</span>
                <span className="text-primary text-xs font-semibold">{s.coins} 🪙</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
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
      </div>
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-[calc(100vh-2rem)] md:gap-3 md:p-3 bg-black">
      {/* VIDEO PANE */}
      <div className="relative flex-1 min-w-0 md:rounded-3xl overflow-hidden bg-black md:border md:border-white/10">
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
            <span key={r.id} className="absolute bottom-24 text-3xl animate-float-up" style={{ left: `${r.x}%` }}>{r.emoji}</span>
          ))}
        </div>

        <GiftAnimation event={activeGift} onDone={() => setActiveGift(null)} />

        {/* TOP overlay */}
        <div className="absolute top-0 inset-x-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 rounded-full bg-black/40 backdrop-blur-md pl-1 pr-2 py-1">
              <UserAvatar avatarPath={hostProfileQ.data?.avatar_url ?? null} displayName={hostProfileQ.data?.display_name ?? hostProfileQ.data?.username ?? "?"} className="h-9 w-9 border-2 border-primary/50" />
              <div className="min-w-0">
                <div className="text-white text-sm font-semibold truncate flex items-center gap-1">
                  {hostProfileQ.data?.display_name ?? hostProfileQ.data?.username ?? "Criador"}
                  {hostProfileQ.data?.is_verified && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="text-white/70 text-[11px] truncate max-w-[42vw] md:max-w-xs">
                  {live.title}{live.category ? ` · ${live.category}` : ""}
                </div>
              </div>
              {!amHostUser && (
                <button
                  onClick={toggleFollow}
                  className={cn(
                    "ml-1 h-7 px-3 rounded-full text-[11px] font-semibold transition",
                    followQ.data ? "bg-white/15 text-white" : "bg-primary text-primary-foreground",
                  )}
                >
                  {followQ.data ? "Seguindo" : "Seguir"}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {live.status === "live" && (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-600 text-white text-[10px] font-bold uppercase tracking-widest px-1.5 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Live
                </span>
              )}
              <span className="rounded-md bg-black/60 text-white text-[11px] px-2 py-1 flex items-center gap-1">
                <Users className="h-3 w-3" /> {formatViewers(viewersQ.data?.length ?? 0)}
              </span>
              <span className="hidden sm:inline rounded-md bg-black/60 text-white text-[11px] px-2 py-1 font-mono">{elapsed}</span>
              <span className={cn("hidden sm:flex rounded-md bg-black/60 text-[11px] px-2 py-1 items-center gap-1", qualityColor)}>
                <Signal className="h-3 w-3" />
              </span>
              <button
                onClick={() => navigate({ to: "/lives" })}
                aria-label="Fechar"
                className="h-8 w-8 rounded-full bg-black/60 grid place-items-center text-white hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {pinned && (
            <div className="mt-2 flex items-start gap-2 rounded-xl bg-primary/15 border border-primary/30 px-2.5 py-1.5 text-white text-[12px] backdrop-blur-md">
              <Pin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <span className="min-w-0">
                <b className="mr-1">{pinned.profile?.display_name ?? pinned.profile?.username ?? "user"}</b>
                {pinned.content}
              </span>
            </div>
          )}
        </div>

        {/* Preparing overlay for host */}
        {isHost && live.status === "preparing" && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-sm">
            <div className="text-center space-y-4 max-w-sm px-6">
              <Radio className="h-12 w-12 text-primary mx-auto animate-pulse" />
              <h2 className="text-white text-xl font-bold">Pronto para começar?</h2>
              <p className="text-white/70 text-sm">Verifique câmera e microfone abaixo. Quando tudo estiver ok, entre ao vivo.</p>
              <Button onClick={goLive} className="rounded-full h-11 px-8 shadow-elegant" disabled={!connected}>
                <Radio className="h-4 w-4 mr-2" /> Iniciar transmissão
              </Button>
            </div>
          </div>
        )}

        {/* Resumo pós-live */}
        {live.status === "ended" && (
          <div className="absolute inset-0 overflow-y-auto bg-black/85 backdrop-blur-sm p-5 grid place-items-center">
            <div className="w-full max-w-sm rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-5 space-y-4">
              <div className="text-center">
                <h2 className="text-xl font-bold">Transmissão encerrada</h2>
                <p className="text-sm text-muted-foreground">{live.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Duração" value={formatDuration(live.started_at, live.ended_at)} />
                <Stat label="Pico de espectadores" value={formatViewers(live.peak_viewer_count)} />
                <Stat label="Curtidas" value={formatViewers(live.like_count ?? 0)} />
                <Stat label="Presentes" value={`${supportersQ.data?.count ?? 0} · ${supportersQ.data?.coins ?? 0} 🪙`} />
              </div>
              {!!supportersQ.data?.top.length && (
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Principais apoiadores</div>
                  <div className="space-y-1.5">
                    {supportersQ.data.top.slice(0, 3).map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                        <UserAvatar avatarPath={s.profile?.avatar_url ?? null} displayName={s.profile?.display_name ?? "?"} className="h-6 w-6" />
                        <span className="flex-1 truncate">{s.profile?.display_name ?? s.profile?.username}</span>
                        <span className="text-primary text-xs font-semibold">{s.coins} 🪙</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <Button onClick={() => navigate({ to: "/lives" })} className="w-full rounded-full">Voltar às lives</Button>
            </div>
          </div>
        )}

        {/* Comentários flutuantes (mobile) */}
        {live.status !== "ended" && (
          <div className="md:hidden pointer-events-none absolute bottom-[6.5rem] left-3 right-20 space-y-1.5">
            {lastMessages.map((m: any) => (
              <div key={m.id} className="flex items-start gap-1.5 text-[12px] text-white drop-shadow">
                <UserAvatar avatarPath={m.profile?.avatar_url ?? null} displayName={m.profile?.display_name ?? "?"} className="h-5 w-5" />
                <span className="rounded-2xl bg-black/45 backdrop-blur-sm px-2 py-1">
                  <b className="text-primary mr-1">{m.profile?.display_name ?? m.profile?.username ?? "user"}</b>
                  {m.content}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Barra lateral de ações (mobile) */}
        {live.status !== "ended" && (
          <div className="md:hidden absolute right-2 bottom-[6.5rem] flex flex-col items-center gap-3">
            <RailBtn Icon={Heart} label="Curtir" onClick={() => { void sendReaction("❤️"); setShowReactionBar((v) => !v); }} />
            {showReactionBar && (
              <div className="flex flex-col gap-1 rounded-full bg-black/50 backdrop-blur-md p-1.5">
                {QUICK_REACTIONS.map((e) => (
                  <button key={e} className="text-xl" onClick={() => sendReaction(e)}>{e}</button>
                ))}
              </div>
            )}
            <RailBtn Icon={Gift} label="Presente" onClick={() => setMobileSheet("gifts")} />
            {isHost && (
              <RailBtn
                Icon={screenOn ? MonitorOff : MonitorUp}
                label={screenOn ? "Parar tela" : "Compartilhar tela"}
                onClick={toggleScreen}
              />
            )}
            <RailBtn Icon={Users} label="Pessoas" onClick={() => setMobileSheet("people")} badge={viewersQ.data?.length} />
            <RailBtn Icon={Share2} label="Compartilhar" onClick={share} />
            {hostProfileQ.data?.username && (
              <Link to="/u/$username" params={{ username: hostProfileQ.data.username }} aria-label="Perfil do criador">
                <RailBtn Icon={UserPlus} label="Perfil" onClick={() => {}} />
              </Link>
            )}
            {amHostUser ? (
              <RailBtn Icon={BarChart3} label="Painel" onClick={() => setMobileSheet("panel")} />
            ) : (
              <RailBtn Icon={Flag} label="Denunciar" onClick={() => toast.success("Denúncia enviada para análise.")} />
            )}
          </div>
        )}

        {/* Barra inferior */}
        {live.status !== "ended" && (
          <div className="absolute bottom-0 inset-x-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-black/85 to-transparent">
            {/* Mobile: comentar + controles do host */}
            <div className="md:hidden flex items-center gap-2">
              <form onSubmit={sendChat} className="flex-1 flex items-center gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Comentar…"
                  maxLength={500}
                  className="flex-1 h-11 rounded-full bg-white/12 backdrop-blur-md px-4 text-sm text-white placeholder:text-white/50 outline-none focus:bg-white/20"
                />
                <button type="submit" aria-label="Enviar" className="h-11 w-11 rounded-full bg-primary text-primary-foreground grid place-items-center">
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <button onClick={() => setMobileSheet("gifts")} aria-label="Enviar presente" className="h-11 w-11 rounded-full bg-white/12 backdrop-blur-md text-white grid place-items-center">
                <Gift className="h-5 w-5" />
              </button>
              {isHost && (
                <button onClick={() => setMobileSheet("panel")} aria-label="Painel do criador" className="h-11 w-11 rounded-full bg-white/12 backdrop-blur-md text-white grid place-items-center">
                  <BarChart3 className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Desktop */}
            <div className="hidden md:flex items-center gap-2 justify-center">
              {isHost ? (
                <>
                  <IconBtn onClick={toggleMic} active={micOn} Icon={micOn ? Mic : MicOff} label={micOn ? "Mudo" : "Ativar"} />
                  <IconBtn onClick={toggleCam} active={camOn} Icon={camOn ? Video : VideoOff} label={camOn ? "Câmera" : "Ligar câmera"} />
                  <IconBtn onClick={flipCam} Icon={RefreshCcw} label="Flip" />
                  <IconBtn onClick={toggleScreen} active={screenOn} Icon={screenOn ? MonitorOff : MonitorUp} label={screenOn ? "Parar tela" : "Compartilhar tela"} />
                  <IconBtn onClick={() => setTab("gifts")} Icon={Gift} label="Presentes recebidos" />
                  <IconBtn onClick={share} Icon={Share2} label="Compartilhar" />
                  <IconBtn onClick={() => setMobileSheet("panel")} Icon={BarChart3} label="Painel do criador" />
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
        )}
      </div>

      {/* SIDE PANEL (desktop) */}
      <aside className="hidden md:flex md:w-[380px] flex-col rounded-3xl overflow-hidden bg-[color:var(--surface)] border border-[color:var(--hairline)]">
        <div className="flex hairline-b">
          <TabBtn active={tab === "chat"} onClick={() => setTab("chat")} Icon={MessageCircle}>Chat</TabBtn>
          <TabBtn active={tab === "people"} onClick={() => setTab("people")} Icon={Users}>Pessoas ({viewersQ.data?.length ?? 0})</TabBtn>
          <TabBtn active={tab === "gifts"} onClick={() => setTab("gifts")} Icon={Gift}>Presentes</TabBtn>
        </div>

        {tab === "chat" && (
          <>
            {chatList}
            <form onSubmit={sendChat} className="flex gap-2 p-3 hairline-t">
              <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Diga algo…" maxLength={500} className="rounded-full bg-background" />
              <Button size="icon" type="submit" className="rounded-full"><Send className="h-4 w-4" /></Button>
            </form>
          </>
        )}
        {tab === "people" && peopleList}
        {tab === "gifts" && giftsGrid}
      </aside>

      {/* Sheets mobile + painel do criador */}
      <Sheet open={mobileSheet !== null} onOpenChange={(o) => !o && setMobileSheet(null)}>
        <SheetContent side="bottom" className="h-[75vh] flex flex-col p-0 rounded-t-3xl">
          <SheetHeader className="p-4 pb-2">
            <SheetTitle>
              {mobileSheet === "gifts" ? "Presentes" : mobileSheet === "people" ? "Pessoas na live" : mobileSheet === "panel" ? "Painel do criador" : "Comentários"}
            </SheetTitle>
          </SheetHeader>
          {mobileSheet === "gifts" && giftsGrid}
          {mobileSheet === "people" && peopleList}
          {mobileSheet === "chat" && chatList}
          {mobileSheet === "panel" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Espectadores agora" value={formatViewers(viewersQ.data?.length ?? 0)} />
                <Stat label="Pico" value={formatViewers(live.peak_viewer_count)} />
                <Stat label="Curtidas" value={formatViewers(live.like_count ?? 0)} />
                <Stat label="Presentes" value={`${supportersQ.data?.count ?? 0} · ${supportersQ.data?.coins ?? 0} 🪙`} />
                <Stat label="Tempo no ar" value={elapsed} />
                <Stat label="Moderadores" value={`${modsQ.data?.length ?? 0}`} />
              </div>
              {!!supportersQ.data?.top.length && (
                <div>
                  <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Ranking de apoiadores</div>
                  <div className="space-y-1.5">
                    {supportersQ.data.top.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-2 text-sm">
                        <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                        <UserAvatar avatarPath={s.profile?.avatar_url ?? null} displayName={s.profile?.display_name ?? "?"} className="h-6 w-6" />
                        <span className="flex-1 truncate">{s.profile?.display_name ?? s.profile?.username}</span>
                        <span className="text-primary text-xs font-semibold">{s.coins} 🪙</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {isHost && (
                <div className="grid grid-cols-2 gap-2">
                  <PanelBtn onClick={toggleMic} active={micOn} Icon={micOn ? Mic : MicOff} label={micOn ? "Microfone ligado" : "Microfone mudo"} />
                  <PanelBtn onClick={toggleCam} active={camOn} Icon={camOn ? Video : VideoOff} label={camOn ? "Câmera ligada" : "Câmera desligada"} />
                  <PanelBtn onClick={flipCam} Icon={RefreshCcw} label="Virar câmera" />
                  <PanelBtn onClick={toggleScreen} active={screenOn} Icon={screenOn ? MonitorOff : MonitorUp} label={screenOn ? "Parar tela" : "Compartilhar tela"} />
                  <PanelBtn onClick={() => setMobileSheet("people")} Icon={Users} label="Moderar pessoas" />
                  <PanelBtn onClick={share} Icon={Share2} label="Convidar" />
                </div>
              )}
              {isHost && (
                <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-2)] p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Qualidade da imagem</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(QUALITY_PRESETS) as QualityKey[]).map((k) => (
                      <button
                        key={k}
                        onClick={() => changeQuality(k)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-[12px] font-medium text-left transition",
                          videoQuality === k
                            ? "border-primary/60 bg-primary/15 text-foreground"
                            : "border-[color:var(--hairline)] hover:bg-white/5",
                        )}
                      >
                        {QUALITY_PRESETS[k].label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Se o aparelho ou a internet não aguentar, a qualidade cai automaticamente.
                  </p>
                </div>
              )}
              {isHost && (
                <button onClick={finish} className="w-full h-11 rounded-full bg-red-600 hover:bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-1.5">
                  <DoorOpen className="h-4 w-4" /> Encerrar transmissão
                </button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function formatDuration(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) return "—";
  const mins = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}min`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface-2)] p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function ChatRow({
  m, hostId, canModerate, amHostUser, onPin, onDelete, onBan, onMod,
}: {
  m: any; hostId: string; canModerate: boolean; amHostUser: boolean;
  onPin: () => void; onDelete: () => void; onBan: () => void; onMod: () => void;
}) {
  return (
    <div className={cn("group flex items-start gap-2 rounded-xl p-2", m.is_highlighted || m.pinned ? "bg-primary/10 ring-1 ring-primary/40" : "")}>
      <UserAvatar avatarPath={m.profile?.avatar_url ?? null} displayName={m.profile?.display_name ?? m.profile?.username ?? "?"} className="h-6 w-6" />
      <div className="text-[13px] min-w-0 flex-1">
        <span className="font-semibold text-primary mr-1.5">{m.profile?.display_name ?? m.profile?.username ?? "user"}</span>
        <span className="break-words">{m.content}</span>
      </div>
      {canModerate && (
        <DropdownMenu>
          <DropdownMenuTrigger className="h-6 w-6 grid place-items-center rounded-full opacity-60 hover:opacity-100 hover:bg-white/10">
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onPin}>
              <Pin className="h-4 w-4 mr-2" /> {m.pinned ? "Desafixar" : "Fixar comentário"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> Apagar comentário
            </DropdownMenuItem>
            {amHostUser && m.sender_id !== hostId && (
              <DropdownMenuItem onClick={onMod}>
                <ShieldPlus className="h-4 w-4 mr-2" /> Tornar moderador
              </DropdownMenuItem>
            )}
            {m.sender_id !== hostId && (
              <DropdownMenuItem className="text-red-400" onClick={onBan}>
                <ShieldBan className="h-4 w-4 mr-2" /> Remover da live
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function RailBtn({ Icon, label, onClick, badge }: { Icon: typeof Mic; label: string; onClick: () => void; badge?: number }) {
  return (
    <button onClick={onClick} aria-label={label} className="relative h-12 w-12 rounded-full bg-black/45 backdrop-blur-md grid place-items-center text-white active:scale-95 transition">
      <Icon className="h-5 w-5" />
      {typeof badge === "number" && badge > 0 && (
        <span className="absolute -bottom-1 text-[10px] bg-black/70 rounded-full px-1.5">{formatViewers(badge)}</span>
      )}
    </button>
  );
}

function PanelBtn({ onClick, Icon, label, active }: { onClick: () => void; Icon: typeof Mic; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-3 text-left text-[12px] font-medium flex items-center gap-2 transition",
        active === false ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-[color:var(--hairline)] bg-[color:var(--surface-2)]",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" /> {label}
    </button>
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
