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
  PROVIDER_URL,
  PREMIUM_PROVIDERS,
  type StreamingProvider,
  type StreamingProviderAdapter,
} from "@/lib/watch/adapters";
import { expectedPosition, needsCorrection, type SyncStatus } from "@/lib/watch/sync";

import {
  Copy,
  Crown,
  DoorOpen,
  ExternalLink,
  Link2,
  Maximize2,
  MessageCircle,
  Pause,
  Play,
  Send,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isWatchSessionExpired, requireFreshWatchUser } from "@/lib/watch/auth";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connected");
  const [hostControlsOnly, setHostControlsOnly] = useState(true);
  const [tab, setTab] = useState<"chat" | "people">("chat");
  const [chatInput, setChatInput] = useState("");
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
      .on("broadcast", { event: "host_controls" }, (msg: any) => {
        if (typeof msg?.payload?.hostControlsOnly === "boolean") {
          setHostControlsOnly(msg.payload.hostControlsOnly);
        }
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
    await (supabase as any)
      .from("watch_room_members")
      .update({ left_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id);
    queryClient.invalidateQueries({ queryKey: ["watch-rooms", user.id] });
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
    navigator.clipboard.writeText(inviteLink || room.invite_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const inviteLink = useMemo(
    () => (room ? `${typeof window !== "undefined" ? window.location.origin : ""}/watch?code=${encodeURIComponent(room.invite_code)}` : ""),
    [room],
  );

  if (roomQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando sala…</div>;
  }
  if (!room) {
    return <div className="p-6 text-sm text-muted-foreground">Sala não encontrada.</div>;
  }

  return (
    <div className="flex flex-col gap-3 md:flex-row md:h-[calc(100vh-2rem)]">
      {/* Player pane */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-[28px] border border-[color:var(--hairline)] bg-[color:var(--surface)]">
        <header className="flex items-center gap-2 px-3 py-3 hairline-b glass-heavy sticky top-0 z-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-primary">
              <span>{PROVIDER_LABEL[provider] ?? room.provider}</span>
              <span>·</span>
              <span>{membersQuery.data?.length ?? 1} online</span>
            </div>
            <div className="font-semibold text-base truncate">{room.title ?? "Sala de assistir"}</div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(inviteLink).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className="text-[12px] text-muted-foreground flex items-center gap-1 hover:text-foreground"
              title="Copiar link de convite"
            >
              <Link2 className="h-3 w-3" />
              <span className="font-mono truncate">{room.invite_code}</span>
              <Copy className="h-3 w-3" /> {copied ? "link copiado!" : ""}
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

        {/* Seletor de serviço */}
        <div className="hairline-b bg-[color:var(--surface)] px-3 py-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="shrink-0 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Assistindo em
            </span>
            {PROVIDER_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={!isHost}
                onClick={() => void changeProvider(p)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition border",
                  provider === p
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-[color:var(--hairline)] text-muted-foreground hover:text-foreground",
                  !isHost && "opacity-60 cursor-not-allowed",
                )}
              >
                {PREMIUM_PROVIDERS.includes(p) ? <Crown className="h-3 w-3" /> : null}
                {PROVIDER_LABEL[p]}
              </button>
            ))}
            {provider === "twitch" ? (
              <span className="shrink-0 rounded-full border border-primary/60 bg-primary/15 px-3 py-1.5 text-[12px] font-medium text-primary">
                Twitch
              </span>
            ) : null}
          </div>
          {PREMIUM_PROVIDERS.includes(provider) ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Cada pessoa assiste na própria conta do {PROVIDER_LABEL[provider]} (assinatura ativa necessária).
              {!isHost ? " A troca de serviço é feita pelo anfitrião." : ""}
            </p>
          ) : null}
        </div>

        <div className="relative bg-black aspect-video md:aspect-auto md:flex-1">
          <div ref={playerContainerRef} className="absolute inset-0" />
          {!playerReady ? (
            <div className="absolute inset-0 grid place-items-center bg-black text-sm text-white/70">
              <div className="space-y-2 text-center">
                <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
                <div>Preparando player…</div>
              </div>
            </div>
          ) : providerError ? (
            <div className="absolute inset-0 grid place-items-center bg-black px-6 text-center text-sm text-white/80">
              <div className="space-y-3">
                <div>{providerError}</div>
                {isHost ? (
                  <Button size="sm" variant="secondary" onClick={() => void changeProvider("youtube")}>
                    Voltar para o YouTube
                  </Button>
                ) : null}
              </div>
            </div>
          ) : unavailable ? (
            <div className="absolute inset-0 grid place-items-center bg-black px-6 text-center text-white/80">
              <div className="space-y-3">
                <div className="text-base font-semibold text-white">{PROVIDER_LABEL[provider]}</div>
                <div className="mx-auto max-w-[340px] text-sm">{unavailable}</div>
                {requirement ? (
                  <div className="mx-auto max-w-[340px] text-[11px] text-white/50">
                    Integração necessária: {requirement}
                  </div>
                ) : null}
                {isHost ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void changeProvider("youtube")}>
                      Voltar para o YouTube
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Controles */}
        <div className="flex flex-col items-center gap-1.5 py-3 hairline-t bg-[color:var(--surface)]">
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" size="sm" disabled={!canControl} onClick={() => void control("back")}>
              -10s
            </Button>
            <Button size="sm" disabled={!canControl} onClick={() => void control("toggle")}>
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
            <Button variant="secondary" size="sm" disabled={!canControl} onClick={() => void control("forward")}>
              +10s
            </Button>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className={cn(syncStatus === "syncing" ? "text-primary" : "")}>
              {syncStatus === "syncing"
                ? "⟳ Sincronizando…"
                : syncStatus === "disconnected"
                  ? "○ Desconectado"
                  : "● Sincronizado"}
            </span>
            {isHost ? (
              <button type="button" onClick={toggleHostControls} className="underline hover:text-foreground">
                {hostControlsOnly ? "Somente anfitrião controla" : "Todos podem controlar"}
              </button>
            ) : (
              <span>{hostControlsOnly ? "Reprodução controlada pelo anfitrião." : "Controle liberado."}</span>
            )}
          </div>
        </div>

      </div>

      {/* Chat + people pane */}
      <aside className="md:w-[390px] overflow-hidden rounded-[28px] border border-[color:var(--hairline)] bg-[color:var(--surface)] flex flex-col md:h-full max-h-[70vh] md:max-h-none shadow-elegant">
        <div className="flex hairline-b bg-[color:var(--surface-2)]/55">
          <TabBtn active={tab === "chat"} onClick={() => setTab("chat")} icon={<MessageCircle className="h-4 w-4" />}>
            Chat
          </TabBtn>
          <TabBtn active={tab === "people"} onClick={() => setTab("people")} icon={<Users className="h-4 w-4" />}>
            Participantes ({membersQuery.data?.length ?? 0})
          </TabBtn>
        </div>

        {tab === "chat" ? (
          <>
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 min-h-[280px] bg-[radial-gradient(circle_at_20%_0%,rgba(215,255,58,0.06),transparent_28%)]">
              {messagesQuery.data?.length ? (
                messagesQuery.data.map((m: any) => (
                  <div key={m.id} className="flex items-start gap-2">
                    <UserAvatar
                      avatarPath={m.profile?.avatar_url ?? null}
                      displayName={m.profile?.display_name ?? m.profile?.username ?? "?"}
                      className="h-7 w-7"
                    />
                    <div className="min-w-0 flex-1 rounded-2xl bg-background px-3 py-2">
                      <div className="text-[12px] font-semibold truncate text-primary">
                        {m.profile?.display_name ?? m.profile?.username ?? "Usuário"}
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                          {formatDistanceToNowStrict(new Date(m.created_at), { locale: ptBR, addSuffix: true })}
                        </span>
                      </div>
                      <div className="text-[13px] break-words leading-snug">{m.content}</div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhuma mensagem ainda. Diga oi 👋
                </p>
              )}
            </div>
            <form onSubmit={sendMessage} className="flex gap-2 p-3 hairline-t bg-[color:var(--surface)]">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Mensagem…"
                className="flex-1 rounded-full bg-background"
              />
              <Button type="submit" size="icon" aria-label="Enviar" className="rounded-full">
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
            <div className="mt-4 p-3 rounded-2xl bg-background text-[12px] text-muted-foreground">
              <div className="mb-2 font-medium text-foreground">Convite da sala</div>
              <div className="break-all font-mono">{inviteLink}</div>
              <Button size="sm" variant="secondary" className="mt-3 rounded-full" onClick={copyCode}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copiar código
              </Button>
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
