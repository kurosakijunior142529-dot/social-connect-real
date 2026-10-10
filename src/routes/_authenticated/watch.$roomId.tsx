import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import {
  createAdapter,
  PROVIDER_LABEL,
  PROVIDER_OPTIONS,
  PREMIUM_PROVIDERS,
  type StreamingProvider,
  type StreamingProviderAdapter,
} from "@/lib/watch/adapters";
import { expectedPosition, needsCorrection, type SyncStatus } from "@/lib/watch/sync";

import {
  Copy,
  Crown,
  DoorOpen,
  Link2,
  Maximize2,
  MessageCircle,
  Pause,
  Play,
  Send,
  UserPlus,
  Users,
} from "lucide-react";
import { ForwardDialog } from "@/components/chat/forward-dialog";
import { WatchQueue } from "@/components/watch/watch-queue";
import { useVoice } from "@/components/voice/voice-provider";
import { appConfirm } from "@/components/app-dialog";
import { useBroadcastWatching } from "@/lib/watch/presence";
import { ChevronLeft, ListVideo, Mic, MicOff, Minimize2, Power, RectangleHorizontal, RotateCcw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { isWatchSessionExpired, requireFreshWatchUser } from "@/lib/watch/auth";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/watch/$roomId")({
  component: WatchRoomPage,
});

const REACTIONS = ["❤️", "🔥", "😂", "🍿", "👏"];

type Room = {
  id: string;
  host_id: string;
  video_id: string;
  title: string | null;
  invite_code: string;
  provider: string;
  closed_at?: string | null;
};
type RoomState = {
  room_id: string;
  position_sec: number;
  playing: boolean;
  video_id: string | null;
  updated_at: string;
  updated_by: string | null;
};

function WatchRoomPage() {
  const { roomId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<StreamingProviderAdapter | null>(null);
  const controlChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const suppressBroadcastRef = useRef(false);


  const [playerReady, setPlayerReady] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [requirement, setRequirement] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connected");
  const [hostControlsOnly, setHostControlsOnly] = useState(true);
  const [tab, setTab] = useState<"chat" | "queue" | "people">("chat");
  const [chatInput, setChatInput] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [copied, setCopied] = useState(false);


  // Ensure membership
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await requireFreshWatchUser();
        const { error } = await (supabase as any).rpc("join_watch_room", { _room: roomId });
        if (error) throw error;
        if (!cancelled) {
          void queryClient.invalidateQueries({ queryKey: ["watch-members", roomId] });
        }
      } catch (error) {
        if (cancelled) return;
        if (isWatchSessionExpired(error)) {
          toast.error("Sua sessão expirou. Entre novamente para acessar a sala.");
          navigate({ to: "/auth", replace: true });
          return;
        }
        toast.error("Não foi possível entrar nesta sala.");
        navigate({ to: "/watch", replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate, queryClient, roomId]);

  const roomQuery = useQuery({
    queryKey: ["watch-room", roomId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("watch_rooms")
        .select("id, host_id, video_id, title, invite_code, provider, closed_at")
        .eq("id", roomId)
        .maybeSingle();
      if (error) throw error;
      return data as Room | null;
    },
  });

  const stateQuery = useQuery({
    queryKey: ["watch-state", roomId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("watch_room_state")
        .select("*")
        .eq("room_id", roomId)
        .maybeSingle();
      return (data ?? null) as RoomState | null;
    },
  });

  const membersQuery = useQuery({
    queryKey: ["watch-members", roomId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("watch_room_members")
        .select("user_id, joined_at, left_at")
        .eq("room_id", roomId)
        .is("left_at", null);
      const ids = ((data ?? []) as any[]).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified, badge_variant")
        .in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((m: any) => ({ ...m, profile: map.get(m.user_id) }));
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["watch-messages", roomId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("watch_room_messages")
        .select("id, sender_id, content, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(200);
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.sender_id)));
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_verified, badge_variant")
        .in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: map.get(r.sender_id) }));
    },
  });

  const room = roomQuery.data;
  const isHost = !!room && room.host_id === user.id;

  useBroadcastWatching(user.id, room && !room.closed_at ? { roomId, title: room.title } : null);
  const voice = useVoice();
  const inVoice = voice.channel?.id === roomId && voice.status !== "idle";
  const [theater, setTheater] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [showUi, setShowUi] = useState(true);
  const [isFs, setIsFs] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const poke = useCallback(() => {
    setShowUi(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setShowUi(false), 3500);
  }, []);
  useEffect(() => {
    poke();
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => { window.clearTimeout(hideTimer.current); document.removeEventListener("fullscreenchange", onFs); };
  }, [poke]);
  const [floating, setFloating] = useState<{ id: number; emoji: string; dx: number }[]>([]);
  const pushFloating = useCallback((emoji: string) => {
    const id = Date.now() + Math.random();
    const dx = Math.round(Math.random() * 80 - 60);
    setFloating((prev) => [...prev.slice(-24), { id, emoji, dx }]);
    setTimeout(() => setFloating((prev) => prev.filter((f) => f.id !== id)), 2300);
  }, []);
  const pushFloatingRef = useRef(pushFloating);
  pushFloatingRef.current = pushFloating;

  const memberNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const m of (membersQuery.data ?? []) as any[]) out[m.user_id] = m.profile?.display_name ?? m.profile?.username ?? "alguém";
    return out;
  }, [membersQuery.data]);

  // Sala encerrada pelo anfitrião: todo mundo sai na hora.
  useEffect(() => {
    if (!room?.closed_at) return;
    if (voice.channel?.id === roomId) voice.leave();
    if (!isHost) toast("Esta sala foi encerrada pelo anfitrião.");
    navigate({ to: "/watch", replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.closed_at]);

  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase
      .channel(`watch-room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watch_room_state", filter: `room_id=eq.${roomId}` },
        () => queryClient.invalidateQueries({ queryKey: ["watch-state", roomId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watch_room_messages", filter: `room_id=eq.${roomId}` },
        () => queryClient.invalidateQueries({ queryKey: ["watch-messages", roomId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watch_room_members", filter: `room_id=eq.${roomId}` },
        () => queryClient.invalidateQueries({ queryKey: ["watch-members", roomId] }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "watch_rooms", filter: `id=eq.${roomId}` },
        () => queryClient.invalidateQueries({ queryKey: ["watch-room", roomId] }),
      )
      .on("broadcast", { event: "host_controls" }, (msg: any) => {
        if (typeof msg?.payload?.hostControlsOnly === "boolean") {
          setHostControlsOnly(msg.payload.hostControlsOnly);
        }
      })
      .on("broadcast", { event: "reaction" }, (msg: any) => {
        const e = msg?.payload?.emoji;
        if (typeof e === "string" && REACTIONS.includes(e)) pushFloatingRef.current(e);
      })
      .on("broadcast", { event: "room_closed" }, () => {
        queryClient.invalidateQueries({ queryKey: ["watch-room", roomId] });
      })
      .subscribe((status) => {
        setSyncStatus(status === "SUBSCRIBED" ? "connected" : "disconnected");
      });
    controlChannelRef.current = ch;
    return () => {
      controlChannelRef.current = null;
      supabase.removeChannel(ch);
    };
  }, [roomId, queryClient]);

  const provider = ((room?.provider as StreamingProvider) ?? "youtube") as StreamingProvider;

  const writeState = useCallback(
    async (playing: boolean, position: number) => {
      await (supabase as any)
        .from("watch_room_state")
        .upsert(
          {
            room_id: roomId,
            playing,
            position_sec: position,
            video_id: room?.video_id ?? null,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          },
          { onConflict: "room_id" },
        );
    },
    [roomId, room?.video_id, user.id],
  );
  const writeStateRef = useRef(writeState);
  writeStateRef.current = writeState;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  // Monta o adapter do provedor atual (YouTube mantém o player existente).
  useEffect(() => {
    if (!room || !playerContainerRef.current) return;
    let cancelled = false;
    const container = playerContainerRef.current;
    setPlayerReady(false);
    setProviderError(null);
    setUnavailable(null);

    const adapter = createAdapter(provider, container, room.video_id, {
      onStateChange: (s) => {
        if (!isHostRef.current || suppressBroadcastRef.current) return;
        const a = adapterRef.current;
        if (!a) return;
        if (s === "playing" || s === "paused") {
          void a.getCurrentTime().then((t) => writeStateRef.current(s === "playing", t));
        }
      },
    });
    adapterRef.current = adapter;

    void adapter
      .initialize()
      .then(() => {
        if (cancelled) return;
        if (!adapter.playable) {
          setUnavailable(adapter.unavailableMessage ?? null);
          setRequirement(adapter.requirement ?? null);
          container.innerHTML = "";
        } else {
          setRequirement(null);
        }
        setPlayerReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setProviderError("Não foi possível carregar este serviço.");
        setPlayerReady(true);
      });

    return () => {
      cancelled = true;
      void adapter.destroy();
      if (adapterRef.current === adapter) adapterRef.current = null;
      container.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.video_id, provider, room?.id]);

  // Sincroniza estado -> participante (correção só acima de 0,75s)
  useEffect(() => {
    if (!playerReady) return;
    const state = stateQuery.data;
    const a = adapterRef.current;
    if (!state || !a || !a.playable) return;
    let cancelled = false;
    void (async () => {
      const expected = expectedPosition({
        positionSec: state.position_sec,
        playing: state.playing,
        updatedAt: state.updated_at,
      });
      const currentTime = await a.getCurrentTime();
      if (cancelled) return;
      const mustCorrect = needsCorrection(currentTime, expected);
      suppressBroadcastRef.current = true;
      try {
        if (mustCorrect) {
          setSyncStatus("syncing");
          await a.seek(expected);
        }
        if (state.playing && !a.isPlaying()) await a.play();
        if (!state.playing && a.isPlaying()) await a.pause();
      } finally {
        setTimeout(() => {
          suppressBroadcastRef.current = false;
          setSyncStatus("synced");
        }, 300);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stateQuery.data, playerReady]);

  // Host heartbeat every 5s
  useEffect(() => {
    if (!isHost || !playerReady) return;
    const t = setInterval(() => {
      const a = adapterRef.current;
      if (!a || !a.playable) return;
      void a.getCurrentTime().then((time) => writeState(a.isPlaying(), time));
    }, 5000);
    return () => clearInterval(t);
  }, [isHost, playerReady, writeState]);

  const canControl = isHost || !hostControlsOnly;

  const control = useCallback(
    async (action: "toggle" | "back" | "forward") => {
      const a = adapterRef.current;
      if (!a || !a.playable || !canControl) return;
      const time = await a.getCurrentTime();
      if (action === "toggle") {
        if (a.isPlaying()) {
          await a.pause();
          await writeState(false, time);
        } else {
          await a.play();
          await writeState(true, time);
        }
        return;
      }
      const target = action === "back" ? Math.max(0, time - 10) : time + 10;
      await a.seek(target);
      await writeState(a.isPlaying(), target);
    },
    [canControl, writeState],
  );

  async function changeProvider(next: StreamingProvider) {
    if (!isHost || !room || next === provider) return;
    const old = adapterRef.current;
    adapterRef.current = null;
    await old?.destroy();
    const { error } = await (supabase as any)
      .from("watch_rooms")
      .update({ provider: next })
      .eq("id", roomId);
    if (error) {
      toast.error("Não foi possível trocar o serviço.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["watch-room", roomId] });
  }

  function toggleHostControls() {
    if (!isHost) return;
    const next = !hostControlsOnly;
    setHostControlsOnly(next);
    void controlChannelRef.current?.send({
      type: "broadcast",
      event: "host_controls",
      payload: { hostControlsOnly: next },
    });
  }


  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = chatInput.trim();
    if (!content) return;
    setChatInput("");
    await (supabase as any)
      .from("watch_room_messages")
      .insert({ room_id: roomId, sender_id: user.id, content });
  }

  async function transferHost(newHostId: string) {
    if (!isHost) return;
    await (supabase as any).from("watch_rooms").update({ host_id: newHostId }).eq("id", roomId);
    queryClient.invalidateQueries({ queryKey: ["watch-room", roomId] });
  }

  async function leave() {
    if (inVoice) voice.leave();
    await (supabase as any).rpc("leave_watch_room", { _room: roomId });
    queryClient.invalidateQueries({ queryKey: ["watch-rooms", user.id] });
    queryClient.invalidateQueries({ queryKey: ["feed-watch-rooms"] });
    navigate({ to: "/watch" });
  }

  async function endRoom() {
    const ok = await appConfirm("Encerrar a sala para todos?", {
      description: "A sala fecha de vez e some da lista. Ninguém mais consegue entrar.",
      confirmText: "Encerrar",
    });
    if (!ok) return;
    const { error } = await (supabase as any).rpc("close_watch_room", { _room: roomId });
    if (error) return toast.error("Não foi possível encerrar a sala.");
    controlChannelRef.current?.send({ type: "broadcast", event: "room_closed", payload: {} });
    if (inVoice) voice.leave();
    queryClient.invalidateQueries({ queryKey: ["watch-rooms", user.id] });
    queryClient.invalidateQueries({ queryKey: ["feed-watch-rooms"] });
    toast.success("Sala encerrada");
    navigate({ to: "/watch" });
  }

  function sendReaction(emoji: string) {
    pushFloating(emoji);
    try { navigator.vibrate?.(8); } catch {}
    controlChannelRef.current?.send({ type: "broadcast", event: "reaction", payload: { emoji } });
  }

  async function toggleVoice() {
    if (inVoice) return voice.leave();
    try {
      await voice.join({ id: roomId, name: room?.title ?? "Sala de assistir", emoji: "🍿" });
    } catch {
      toast.error("Não foi possível ligar a voz agora.");
    }
  }

  async function playVideo(videoId: string) {
    if (!isHost) return;
    const { error } = await (supabase as any).from("watch_rooms").update({ video_id: videoId, provider: "youtube" }).eq("id", roomId);
    if (error) { toast.error("Não foi possível trocar o vídeo."); return; }
    await (supabase as any).from("watch_room_state").upsert(
      { room_id: roomId, playing: true, position_sec: 0, video_id: videoId, updated_at: new Date().toISOString(), updated_by: user.id },
      { onConflict: "room_id" },
    );
    queryClient.invalidateQueries({ queryKey: ["watch-room", roomId] });
    toast.success("Tocando o próximo vídeo");
  }

  function toggleFullscreen() {
    const el = stageRef.current as any;
    if (!el) return;
    if (!document.fullscreenElement) {
      const req = el.requestFullscreen ?? el.webkitRequestFullscreen;
      if (req) {
        Promise.resolve(req.call(el)).then(() => {
          try { (screen.orientation as any)?.lock?.("landscape").catch(() => {}); } catch {}
        }).catch(() => setIsFs((v) => !v));
      } else setIsFs((v) => !v);
    } else document.exitFullscreen?.();
    poke();
  }

  function copyCode() {
    if (!room) return;
    navigator.clipboard.writeText(inviteLink || room.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const inviteLink = useMemo(
    () => (room ? `${typeof window !== "undefined" ? window.location.origin : ""}/watch?code=${encodeURIComponent(room.invite_code)}${room.video_id ? `&v=${encodeURIComponent(room.video_id)}` : ""}` : ""),
    [room],
  );

  if (roomQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando sala…</div>;
  }
  if (!room) {
    return <div className="p-6 text-sm text-muted-foreground">Sala não encontrada.</div>;
  }

  const playing = !!stateQuery.data?.playing;
  const onlineCount = membersQuery.data?.length ?? 1;
  const recentMsgs = (messagesQuery.data ?? []).slice(-4);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background md:static md:z-auto md:h-[calc(100dvh-3rem)] md:flex-row md:gap-4">
      <ForwardDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        userId={user.id}
        message={{
          kind: "text",
          content: `🎬 Vem assistir "${room.title ?? "comigo"}" comigo no Vibely! ${inviteLink}`,
        }}
      />
      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden md:rounded-[28px] md:border md:border-[color:var(--hairline)]">
        {/* Header compacto */}
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+10px)] md:pt-3">
          <button type="button" onClick={() => navigate({ to: "/watch" })} aria-label="Voltar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--surface-2)] active:scale-90 transition">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="truncate font-display text-[16px] font-bold leading-tight">{room.title ?? "Sala de assistir"}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-1.5 py-0.5 font-semibold text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> {onlineCount} assistindo
              </span>
              <span className="truncate">{PROVIDER_LABEL[provider] ?? room.provider}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="hidden -space-x-2 sm:flex">
              {(membersQuery.data ?? []).slice(0, 3).map((m: any) => (
                <UserAvatar key={m.user_id} avatarPath={m.profile?.avatar_url ?? null}
                  displayName={m.profile?.display_name ?? m.profile?.username ?? "?"}
                  className="h-8 w-8 ring-2 ring-background" />
              ))}
            </div>
            <button type="button" onClick={toggleVoice} aria-label={inVoice ? "Sair da voz" : "Conversar por voz"}
              className={cn("grid h-10 w-10 place-items-center rounded-full transition active:scale-90",
                inVoice ? "bg-primary text-primary-foreground shadow-elegant" : "bg-[color:var(--surface-2)]")}>
              {inVoice ? <Mic className="h-[18px] w-[18px]" /> : <MicOff className="h-[18px] w-[18px]" />}
            </button>
            <button type="button" onClick={() => setInviteOpen(true)} aria-label="Convidar"
              className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--surface-2)] active:scale-90 transition">
              <UserPlus className="h-[18px] w-[18px]" />
            </button>
            {isHost ? (
              <button type="button" onClick={() => void endRoom()} aria-label="Encerrar sala"
                className="grid h-10 w-10 place-items-center rounded-full bg-destructive/15 text-destructive active:scale-90 transition">
                <Power className="h-[18px] w-[18px]" />
              </button>
            ) : (
              <button type="button" onClick={() => void leave()} aria-label="Sair da sala"
                className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--surface-2)] active:scale-90 transition">
                <DoorOpen className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>
        </header>

        {/* Palco do vídeo */}
        <div ref={stageRef} onPointerDown={poke}
          className={cn("relative w-full shrink-0 overflow-hidden bg-black md:flex-1",
            isFs ? "h-full" : theater ? "aspect-video md:aspect-auto" : "aspect-video md:aspect-auto")}>
          <div ref={playerContainerRef} className="absolute inset-0" />
          {/* captura de toque para mostrar/ocultar controles */}
          <button type="button" aria-label="Mostrar controles" onClick={() => setShowUi((v) => !v)}
            className="absolute inset-0 z-10 cursor-default" />

          {!playerReady ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-black text-sm text-white/70">
              <div className="space-y-2 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-primary" />
                <div>Preparando o cinema…</div>
              </div>
            </div>
          ) : providerError || unavailable ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-black px-6 text-center text-white/80">
              <div className="space-y-3">
                <div className="text-base font-semibold text-white">{PROVIDER_LABEL[provider]}</div>
                <div className="mx-auto max-w-[340px] text-sm">{providerError ?? unavailable}</div>
                {requirement ? <div className="mx-auto max-w-[340px] text-[11px] text-white/50">Integração necessária: {requirement}</div> : null}
                {isHost ? (
                  <Button size="sm" variant="secondary" className="rounded-full" onClick={() => void changeProvider("youtube")}>Voltar para o YouTube</Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Overlay de controles */}
          <div className={cn("pointer-events-none absolute inset-0 z-20 transition-opacity duration-300", showUi ? "opacity-100" : "opacity-0")}>
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 to-transparent" />
            <div className={cn("absolute left-3 top-3 flex items-center gap-1.5", showUi && "pointer-events-auto")}>
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md",
                syncStatus === "disconnected" ? "bg-destructive/80 text-destructive-foreground" : "bg-black/45 text-white")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", syncStatus === "disconnected" ? "bg-white" : "bg-primary", syncStatus === "syncing" && "animate-pulse")} />
                {syncStatus === "syncing" ? "Sincronizando" : syncStatus === "disconnected" ? "Desconectado" : "Em sincronia"}
              </span>
              <button type="button" disabled={!isHost} onClick={toggleHostControls}
                className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/85 backdrop-blur-md">
                <Crown className="h-3 w-3" /> {hostControlsOnly ? "Só o anfitrião" : "Todos controlam"}
              </button>
            </div>
            <div className={cn("absolute right-3 top-3 flex gap-1.5", showUi && "pointer-events-auto")}>
              <button type="button" onClick={() => setTheater((v) => !v)} aria-label="Modo teatro"
                className={cn("hidden h-9 w-9 place-items-center rounded-full backdrop-blur-md md:grid", theater ? "bg-primary text-primary-foreground" : "bg-black/45 text-white")}>
                <RectangleHorizontal className="h-4 w-4" />
              </button>
              <button type="button" onClick={toggleFullscreen} aria-label="Tela cheia"
                className="grid h-9 w-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md">
                {isFs ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
            <div className={cn("absolute inset-0 flex items-center justify-center gap-8", showUi && "[&>button]:pointer-events-auto")}>
              <button type="button" disabled={!canControl} onClick={() => void control("back")} aria-label="Voltar 10 segundos"
                className="grid h-12 w-12 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition active:scale-90 disabled:opacity-40">
                <RotateCcw className="h-5 w-5" />
              </button>
              <button type="button" disabled={!canControl} onClick={() => void control("toggle")} aria-label={playing ? "Pausar" : "Tocar"}
                className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-elegant transition active:scale-90 disabled:opacity-40">
                {playing ? <Pause className="h-7 w-7 fill-current" /> : <Play className="h-7 w-7 translate-x-0.5 fill-current" />}
              </button>
              <button type="button" disabled={!canControl} onClick={() => void control("forward")} aria-label="Avançar 10 segundos"
                className="grid h-12 w-12 place-items-center rounded-full bg-black/40 text-white backdrop-blur-md transition active:scale-90 disabled:opacity-40">
                <RotateCw className="h-5 w-5" />
              </button>
            </div>
            {isHost ? (
              <div className={cn("absolute inset-x-3 bottom-3 flex gap-1.5 overflow-x-auto no-scrollbar", showUi && "pointer-events-auto")}>
                {PROVIDER_OPTIONS.map((p) => (
                  <button key={p} type="button" onClick={() => void changeProvider(p)}
                    className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold backdrop-blur-md transition",
                      provider === p ? "bg-primary text-primary-foreground" : "bg-black/45 text-white/80")}>
                    {PREMIUM_PROVIDERS.includes(p) ? <Crown className="h-3 w-3" /> : null}
                    {PROVIDER_LABEL[p]}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Chat flutuante em tela cheia */}
          {isFs ? (
            <div className="pointer-events-none absolute bottom-14 left-3 z-20 max-w-[55%] space-y-1.5">
              {recentMsgs.map((m: any) => (
                <div key={m.id} className="w-fit rounded-2xl bg-black/45 px-3 py-1.5 text-[13px] text-white backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
                  <span className="mr-1.5 font-semibold text-primary">{m.profile?.display_name ?? m.profile?.username ?? "Alguém"}</span>
                  {m.content}
                </div>
              ))}
            </div>
          ) : null}
          {isFs ? (
            <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-1.5">
              {REACTIONS.map((emo) => (
                <button key={emo} type="button" onClick={() => sendReaction(emo)} aria-label={`Reagir ${emo}`}
                  className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-xl backdrop-blur-md transition active:scale-75">{emo}</button>
              ))}
            </div>
          ) : null}

          <div className="pointer-events-none absolute bottom-6 right-8 z-30 h-0 w-0">
            {floating.map((f) => (
              <span key={f.id} className="watch-react absolute bottom-0 right-0 text-4xl" style={{ ["--wx" as any]: `${f.dx}px` }}>{f.emoji}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Painel social */}
      {!theater ? (
      <aside className="flex min-h-0 flex-1 flex-col md:w-[380px] md:flex-none md:overflow-hidden md:rounded-[28px] md:border md:border-[color:var(--hairline)] md:bg-[color:var(--surface)]">
        <div className="flex gap-1 px-3 pt-3">
          {([
            ["chat", "Chat", MessageCircle],
            ["queue", "Fila", ListVideo],
            ["people", `Pessoas · ${membersQuery.data?.length ?? 0}`, Users],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={cn("inline-flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-semibold transition",
                tab === key ? "bg-foreground text-background" : "bg-[color:var(--surface-2)] text-muted-foreground")}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "queue" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <WatchQueue roomId={roomId} userId={user.id} isHost={isHost} names={memberNames} onPlay={playVideo} />
          </div>
        ) : tab === "chat" ? (
          <>
            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
              {messagesQuery.data?.length ? (
                messagesQuery.data.map((m: any) => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                      {!mine ? (
                        <UserAvatar avatarPath={m.profile?.avatar_url ?? null}
                          displayName={m.profile?.display_name ?? m.profile?.username ?? "?"} className="h-7 w-7 shrink-0" />
                      ) : null}
                      <div className={cn("min-w-0 max-w-[78%] rounded-[20px] px-3.5 py-2",
                        mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-[color:var(--surface-2)]")}>
                        {!mine ? (
                          <div className="truncate text-[11px] font-semibold text-primary">{m.profile?.display_name ?? m.profile?.username ?? "Usuário"}</div>
                        ) : null}
                        <div className="break-words text-[14px] leading-snug">{m.content}</div>
                        <div className={cn("mt-0.5 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                          {formatDistanceToNowStrict(new Date(m.created_at), { locale: ptBR, addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="grid h-full place-items-center py-10 text-center">
                  <div>
                    <div className="text-4xl">🍿</div>
                    <p className="mt-2 text-sm font-medium">A sessão começou</p>
                    <p className="text-xs text-muted-foreground">Mande a primeira mensagem ou uma reação.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-[color:var(--hairline)] px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2">
              <div className="mb-2 flex justify-between gap-1">
                {REACTIONS.map((emo) => (
                  <button key={emo} type="button" onClick={() => sendReaction(emo)} aria-label={`Reagir ${emo}`}
                    className="grid h-10 flex-1 place-items-center rounded-2xl bg-[color:var(--surface-2)] text-xl transition active:scale-75">{emo}</button>
                ))}
              </div>
              <form onSubmit={sendMessage} className="flex items-center gap-2">
                <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Comente algo…"
                  className="h-11 flex-1 rounded-full border-0 bg-[color:var(--surface-2)] text-[15px]" />
                <Button type="submit" size="icon" aria-label="Enviar" disabled={!chatInput.trim()}
                  className="h-11 w-11 shrink-0 rounded-full" onMouseDown={(e) => e.preventDefault()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
            {membersQuery.data?.map((m: any) => (
              <div key={m.user_id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-[color:var(--surface-2)]">
                <UserAvatar avatarPath={m.profile?.avatar_url ?? null}
                  displayName={m.profile?.display_name ?? m.profile?.username ?? "?"} className="h-10 w-10" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {m.profile?.display_name ?? m.profile?.username ?? "Usuário"}
                    {m.user_id === room.host_id ? <Crown className="h-3.5 w-3.5 text-primary" /> : null}
                    {m.user_id === user.id ? <span className="text-[10px] text-muted-foreground">(você)</span> : null}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">@{m.profile?.username}</div>
                </div>
                {isHost && m.user_id !== user.id ? (
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => transferHost(m.user_id)} title="Passar comando">
                    <Crown className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))}
            <div className="mt-4 rounded-3xl bg-[color:var(--surface-2)] p-4">
              <div className="text-sm font-semibold">Chame mais gente</div>
              <div className="mt-1 flex items-center gap-1 text-[12px] text-muted-foreground"><Link2 className="h-3 w-3" /> Código <span className="font-mono">{room.invite_code}</span></div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" className="rounded-full" onClick={() => setInviteOpen(true)}><UserPlus className="mr-1 h-3.5 w-3.5" /> Convidar</Button>
                <Button size="sm" variant="secondary" className="rounded-full" onClick={copyCode}><Copy className="mr-1 h-3.5 w-3.5" /> {copied ? "Copiado!" : "Copiar link"}</Button>
              </div>
            </div>
          </div>
        )}
      </aside>
      ) : null}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 py-2 text-[13px] font-medium flex items-center justify-center gap-1.5 transition",
        active
          ? "text-foreground border-b-2 border-primary"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
