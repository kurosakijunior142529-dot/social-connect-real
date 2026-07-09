import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { createYouTubePlayer } from "@/lib/watch/youtube";
import type { WatchProviderPlayer } from "@/lib/watch/provider";
import {
  Copy,
  Crown,
  DoorOpen,
  Maximize2,
  MessageCircle,
  Pause,
  Play,
  Send,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/watch/$roomId")({
  component: WatchRoomPage,
});

type Room = {
  id: string;
  host_id: string;
  video_id: string;
  title: string | null;
  invite_code: string;
  provider: string;
};
type RoomState = {
  room_id: string;
  position_sec: number;
  playing: boolean;
  video_id: string | null;
  updated_at: string;
  updated_by: string | null;
};

const DRIFT_THRESHOLD = 1.5;

function WatchRoomPage() {
  const { roomId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const playerContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<WatchProviderPlayer | null>(null);
  const lastStateAppliedRef = useRef<{ playing: boolean; position: number; at: number } | null>(null);
  const suppressBroadcastRef = useRef(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [tab, setTab] = useState<"chat" | "people">("chat");
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);

  // Ensure membership
  useEffect(() => {
    (supabase as any)
      .from("watch_room_members")
      .upsert(
        { room_id: roomId, user_id: user.id, left_at: null },
        { onConflict: "room_id,user_id" },
      )
      .then(() => {});
    return () => {
      (supabase as any)
        .from("watch_room_members")
        .update({ left_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .then(() => {});
    };
  }, [roomId, user.id]);

  const roomQuery = useQuery({
    queryKey: ["watch-room", roomId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("watch_rooms")
        .select("id, host_id, video_id, title, invite_code, provider")
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
        .select("id, username, display_name, avatar_url")
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
        .select("id, username, display_name, avatar_url")
        .in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      return rows.map((r) => ({ ...r, profile: map.get(r.sender_id) }));
    },
  });

  const room = roomQuery.data;
  const isHost = !!room && room.host_id === user.id;

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
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, queryClient]);

  // Mount YouTube player once
  useEffect(() => {
    if (!room || !playerContainerRef.current) return;
    if (playerRef.current) return;
    let cancelled = false;
    createYouTubePlayer(playerContainerRef.current, room.video_id, {
      onReady: (p) => {
        if (cancelled) {
          p.destroy();
          return;
        }
        playerRef.current = p;
        setPlayerReady(true);
      },
      onStateChange: (s) => {
        // If host, broadcast play/pause changes
        if (!isHost || suppressBroadcastRef.current) return;
        const p = playerRef.current;
        if (!p) return;
        if (s === "playing" || s === "paused") {
          void writeState(s === "playing", p.getCurrentTime());
        }
      },
    });
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.video_id]);

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

  // Sync from state to player (guests + host on reconnect)
  useEffect(() => {
    if (!playerReady) return;
    const state = stateQuery.data;
    const p = playerRef.current;
    if (!state || !p) return;
    // Compute expected position accounting for time since last update
    const secondsSinceUpdate = (Date.now() - new Date(state.updated_at).getTime()) / 1000;
    const expected = state.playing ? state.position_sec + secondsSinceUpdate : state.position_sec;
    const currentTime = p.getCurrentTime();
    const drift = Math.abs(currentTime - expected);
    suppressBroadcastRef.current = true;
    try {
      if (drift > DRIFT_THRESHOLD) p.seek(expected);
      if (state.playing && !p.isPlaying()) p.play();
      if (!state.playing && p.isPlaying()) p.pause();
    } finally {
      // release on next tick
      setTimeout(() => {
        suppressBroadcastRef.current = false;
      }, 300);
    }
    lastStateAppliedRef.current = { playing: state.playing, position: expected, at: Date.now() };
  }, [stateQuery.data, playerReady]);

  // Host heartbeat every 5s
  useEffect(() => {
    if (!isHost || !playerReady) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      void writeState(p.isPlaying(), p.getCurrentTime());
    }, 5000);
    return () => clearInterval(t);
  }, [isHost, playerReady, writeState]);

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
    await (supabase as any)
      .from("watch_room_members")
      .update({ left_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id);
    navigate({ to: "/watch" });
  }

  function toggleFullscreen() {
    const el = playerContainerRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  function copyCode() {
    if (!room) return;
    navigator.clipboard.writeText(room.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const inviteLink = useMemo(
    () => (room ? `${typeof window !== "undefined" ? window.location.origin : ""}/watch` : ""),
    [room],
  );

  if (roomQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando sala…</div>;
  }
  if (!room) {
    return <div className="p-6 text-sm text-muted-foreground">Sala não encontrada.</div>;
  }

  return (
    <div className="flex flex-col md:flex-row md:h-[calc(100vh-2rem)]">
      {/* Player pane */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-2 px-3 py-2 hairline-b glass-heavy sticky top-0 z-10">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate">{room.title ?? "Sala de assistir"}</div>
            <button
              type="button"
              onClick={copyCode}
              className="text-[12px] text-muted-foreground flex items-center gap-1 hover:text-foreground"
              title="Copiar código de convite"
            >
              <span className="font-mono">{room.invite_code}</span>
              <Copy className="h-3 w-3" /> {copied ? "copiado!" : ""}
            </button>
          </div>
          <button
            onClick={toggleFullscreen}
            className="h-8 w-8 grid place-items-center rounded-full hover:bg-[color:var(--surface-2)]"
            title="Tela cheia"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={leave}
            className="h-8 px-3 grid place-items-center rounded-full bg-red-600/90 hover:bg-red-600 text-white text-xs font-medium"
          >
            <DoorOpen className="h-3.5 w-3.5 mr-1 inline" /> Sair
          </button>
        </header>

        <div className="relative bg-black aspect-video md:aspect-auto md:flex-1">
          <div ref={playerContainerRef} className="absolute inset-0" />
        </div>

        {/* Host controls */}
        {isHost ? (
          <div className="flex items-center justify-center gap-2 py-2 hairline-t bg-[color:var(--surface)]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const p = playerRef.current;
                if (!p) return;
                p.seek(Math.max(0, p.getCurrentTime() - 10));
                writeState(p.isPlaying(), p.getCurrentTime());
              }}
            >
              -10s
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const p = playerRef.current;
                if (!p) return;
                if (p.isPlaying()) {
                  p.pause();
                  writeState(false, p.getCurrentTime());
                } else {
                  p.play();
                  writeState(true, p.getCurrentTime());
                }
              }}
            >
              {stateQuery.data?.playing ? (
                <>
                  <Pause className="h-4 w-4 mr-1" /> Pausar
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" /> Tocar
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const p = playerRef.current;
                if (!p) return;
                p.seek(p.getCurrentTime() + 10);
                writeState(p.isPlaying(), p.getCurrentTime());
              }}
            >
              +10s
            </Button>
          </div>
        ) : (
          <div className="text-center text-[12px] text-muted-foreground py-2 hairline-t">
            Reprodução controlada pelo anfitrião. Você está sincronizado.
          </div>
        )}
      </div>

      {/* Chat + people pane */}
      <aside className="md:w-96 md:border-l md:border-[color:var(--hairline)] flex flex-col md:h-full max-h-[70vh] md:max-h-none">
        <div className="flex hairline-b">
          <TabBtn active={tab === "chat"} onClick={() => setTab("chat")} icon={<MessageCircle className="h-4 w-4" />}>
            Chat
          </TabBtn>
          <TabBtn active={tab === "people"} onClick={() => setTab("people")} icon={<Users className="h-4 w-4" />}>
            Participantes ({membersQuery.data?.length ?? 0})
          </TabBtn>
        </div>

        {tab === "chat" ? (
          <>
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[280px]">
              {messagesQuery.data?.length ? (
                messagesQuery.data.map((m: any) => (
                  <div key={m.id} className="flex items-start gap-2">
                    <UserAvatar
                      avatarPath={m.profile?.avatar_url ?? null}
                      displayName={m.profile?.display_name ?? m.profile?.username ?? "?"}
                      className="h-7 w-7"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold truncate">
                        {m.profile?.display_name ?? m.profile?.username ?? "Usuário"}
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(m.created_at), { locale: ptBR, addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-[13px] break-words">{m.content}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma mensagem ainda. Diga oi 👋
                </p>
              )}
            </div>
            <form onSubmit={sendMessage} className="flex gap-2 p-2 hairline-t">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Mensagem…"
                className="flex-1"
              />
              <Button type="submit" size="icon" aria-label="Enviar">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {membersQuery.data?.map((m: any) => (
              <div key={m.user_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[color:var(--surface-2)]">
                <UserAvatar
                  avatarPath={m.profile?.avatar_url ?? null}
                  displayName={m.profile?.display_name ?? m.profile?.username ?? "?"}
                  className="h-9 w-9"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    {m.profile?.display_name ?? m.profile?.username ?? "Usuário"}
                    {m.user_id === room.host_id ? (
                      <span title="Anfitrião" className="text-yellow-500">
                        <Crown className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                    {m.user_id === user.id ? (
                      <span className="text-[10px] text-muted-foreground">(você)</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">@{m.profile?.username}</div>
                </div>
                {isHost && m.user_id !== user.id ? (
                  <Button size="sm" variant="ghost" onClick={() => transferHost(m.user_id)} title="Passar comando">
                    <Crown className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))}
            <div className="mt-4 p-3 rounded-xl bg-[color:var(--surface)] text-[12px] text-muted-foreground">
              Convide amigos com o código <span className="font-mono text-foreground">{room.invite_code}</span> em{" "}
              <span className="font-mono">{inviteLink}</span>.
            </div>
          </div>
        )}
      </aside>
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
