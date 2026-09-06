import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  Copy,
  Globe2,
  Link2,
  LogIn,
  Lock,
  Plus,
  Radio,
  Search,
  Tv,
  Users,
} from "lucide-react";
import { resolveSource } from "@/lib/watch/provider";
import {
  PROVIDER_OPTIONS,
  PROVIDER_LABEL,
  PREMIUM_PROVIDERS,
  type StreamingProvider,
} from "@/lib/watch/adapters/types";
import {
  ROOM_CATEGORIES,
  VISIBILITY_OPTIONS,
  categoryEmoji,
  categoryLabel,
  extractInviteCode,
  inviteLinkFor,
  roomErrorMessage,
  roomThumb,
  PENDING_INVITE_KEY,
  type RoomVisibility,
} from "@/lib/watch/rooms";
import { UserAvatar } from "@/components/user-avatar";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isWatchSessionExpired, requireFreshWatchUser } from "@/lib/watch/auth";

export const Route = createFileRoute("/_authenticated/watch/")({
  validateSearch: z.object({ code: z.string().optional() }),
  component: WatchIndex,
  head: () => ({
    meta: [
      { title: "Salas · Streaming Amigo · vibely" },
      { name: "description", content: "Descubra salas públicas para assistir junto, crie a sua sala ou entre por convite no vibely." },
      { property: "og:title", content: "Salas · Streaming Amigo · vibely" },
      { property: "og:description", content: "Assista vídeos e lives em sincronia com seus amigos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Tab = "public" | "invite" | "mine";

function WatchIndex() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("public");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("");
  const [videoInput, setVideoInput] = useState("");
  const [newProvider, setNewProvider] = useState<StreamingProvider>("youtube");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<RoomVisibility>("public");
  const [newCategory, setNewCategory] = useState<string>("geral");
  const [scheduledAt, setScheduledAt] = useState("");
  const [code, setCode] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoJoinTried = useRef(false);

  const publicRooms = useQuery({
    queryKey: ["watch-public-rooms", query, category],
    queryFn: async () => {
      const { data, error: err } = await (supabase as any).rpc("list_public_watch_rooms", {
        _search: query || null,
        _category: category || null,
        _limit: 60,
      });
      if (err) throw err;
      return (data ?? []) as any[];
    },
    staleTime: 15_000,
    placeholderData: (prev: any) => prev,
  });

  const myRooms = useQuery({
    queryKey: ["watch-rooms", user.id],
    queryFn: async () => {
      const { data: memberRows } = await (supabase as any)
        .from("watch_room_members")
        .select("room_id")
        .eq("user_id", user.id)
        .is("left_at", null);
      const ids = ((memberRows ?? []) as any[]).map((m) => m.room_id);
      if (!ids.length) return [];
      const { data } = await (supabase as any)
        .from("watch_rooms")
        .select("id, title, video_id, invite_code, host_id, created_at, closed_at, provider, visibility, category, cover_url, max_members")
        .in("id", ids)
        .is("closed_at", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const filteredMine = useMemo(() => {
    const list = myRooms.data ?? [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((r: any) => String(r.title ?? "").toLowerCase().includes(q));
  }, [myRooms.data, query]);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const premium = PREMIUM_PROVIDERS.includes(newProvider);
    let provider: string = newProvider;
    let videoId = "";
    let roomTitle = title;
    if (!premium) {
      const src = resolveSource(videoInput);
      if (!src) {
        setError("Cole um link válido do YouTube ou Twitch (canal ou vídeo).");
        return;
      }
      provider = src.provider;
      videoId = src.provider === "youtube" ? src.videoId : `${src.kind}:${src.id}`;
      roomTitle = title || (src.provider === "twitch" ? `Twitch: ${src.id}` : "Sala de assistir");
    } else {
      roomTitle = title || `${PROVIDER_LABEL[newProvider]}: assistindo juntos`;
    }
    setCreating(true);
    try {
      const freshUser = await requireFreshWatchUser();
      const { data, error: err } = await (supabase as any)
        .from("watch_rooms")
        .insert({
          host_id: freshUser.id,
          provider,
          video_id: videoId,
          title: roomTitle,
          visibility,
          category: newCategory,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        })
        .select("id")
        .single();
      if (err || !data) throw err ?? new Error("Não foi possível criar a sala.");
      navigate({ to: "/watch/$roomId", params: { roomId: data.id } });
    } catch (err) {
      if (isWatchSessionExpired(err)) {
        toast.error("Sua sessão expirou. Entre novamente para criar uma sala.");
        navigate({ to: "/auth", replace: true });
      } else {
        setError(err instanceof Error ? err.message : "Não foi possível criar a sala.");
      }
    } finally {
      setCreating(false);
    }
  }

  async function joinRoomByCode(raw: string) {
    setError(null);
    const c = extractInviteCode(raw);
    if (!c) return;
    setJoining(true);
    try {
      await requireFreshWatchUser();
      const { data, error: err } = await (supabase as any).rpc("join_watch_room_by_code", { _code: c });
      const roomId = Array.isArray(data) ? data[0]?.room_id : data?.room_id;
      if (err || !roomId) throw err ?? new Error("ROOM_NOT_FOUND");
      navigate({ to: "/watch/$roomId", params: { roomId } });
    } catch (err) {
      if (isWatchSessionExpired(err)) {
        toast.error("Sua sessão expirou. Entre novamente para acessar a sala.");
        navigate({ to: "/auth", replace: true });
      } else {
        setError(roomErrorMessage(err instanceof Error ? err.message : null));
      }
    } finally {
      setJoining(false);
    }
  }

  async function joinPublicRoom(roomId: string) {
    setError(null);
    try {
      await requireFreshWatchUser();
      const { error: err } = await (supabase as any).rpc("join_watch_room", { _room: roomId });
      if (err) throw err;
      navigate({ to: "/watch/$roomId", params: { roomId } });
    } catch (err) {
      if (isWatchSessionExpired(err)) {
        toast.error("Sua sessão expirou. Entre novamente para acessar a sala.");
        navigate({ to: "/auth", replace: true });
        return;
      }
      const message = roomErrorMessage(err instanceof Error ? err.message : null);
      setError(message);
      toast.error(message);
    }
  }

  // Convite compartilhado por link antigo (?code=) ou salvo antes do login
  useEffect(() => {
    if (autoJoinTried.current) return;
    let pending: string | null = null;
    try {
      pending = window.localStorage.getItem(PENDING_INVITE_KEY);
    } catch {
      pending = null;
    }
    const sharedCode = search.code?.trim() || pending || "";
    if (!sharedCode) return;
    autoJoinTried.current = true;
    try {
      window.localStorage.removeItem(PENDING_INVITE_KEY);
    } catch {
      /* ignore */
    }
    setTab("invite");
    setCode(sharedCode);
    void joinRoomByCode(sharedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.code]);

  function copyInvite(inviteCode: string) {
    navigator.clipboard
      .writeText(inviteLinkFor(inviteCode))
      .then(() => toast.success("Link de convite copiado"))
      .catch(() => {});
  }

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex items-center gap-2 px-4 h-12">
          <Tv className="h-5 w-5 text-primary" />
          <h1 className="flex-1 text-[19px] font-display font-semibold tracking-tight">Salas</h1>
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setShowCreate((v) => !v)}>
            <Plus className="h-4 w-4" /> Criar
          </Button>
        </div>
        <div className="flex gap-1 px-3 pb-2">
          {([
            { id: "public", label: "Públicas", icon: Globe2 },
            { id: "invite", label: "Por convite", icon: Link2 },
            { id: "mine", label: "Minhas salas", icon: Users },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-medium transition",
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-[color:var(--surface)] text-muted-foreground",
              )}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-5">
        {showCreate ? (
          <section className="overflow-hidden rounded-[28px] border border-[color:var(--hairline)] bg-[color:var(--surface)] shadow-elegant">
            <div className="p-4 pb-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-primary">watch party</div>
                  <h2 className="text-xl font-semibold">Criar sala</h2>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Plus className="h-5 w-5" />
                </div>
              </div>

              <form onSubmit={createRoom} className="space-y-2">
                <div className="grid grid-cols-4 gap-1.5">
                  {PROVIDER_OPTIONS.map((p) => {
                    const premium = PREMIUM_PROVIDERS.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewProvider(p)}
                        className={cn(
                          "rounded-2xl px-1 py-2 text-[11px] font-medium transition leading-tight",
                          newProvider === p
                            ? "bg-primary text-primary-foreground"
                            : "bg-[color:var(--surface-2)] text-muted-foreground",
                        )}
                      >
                        {PROVIDER_LABEL[p]}
                        {premium ? (
                          <span
                            className={cn(
                              "mt-0.5 block text-[9px] font-normal",
                              newProvider === p ? "text-primary-foreground/80" : "text-muted-foreground/70",
                            )}
                          >
                            assinatura
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {PREMIUM_PROVIDERS.includes(newProvider) ? (
                  <p className="rounded-2xl bg-primary/10 px-3 py-2 text-[11px] text-primary">
                    Cada participante precisa ter assinatura ativa do {PROVIDER_LABEL[newProvider]} e assiste
                    pelo app/site oficial — a sala sincroniza o play, a pausa e o chat de todo mundo.
                  </p>
                ) : (
                  <Input
                    placeholder="Cole o link do YouTube ou Twitch"
                    value={videoInput}
                    onChange={(e) => setVideoInput(e.target.value)}
                    required
                    className="h-12 rounded-2xl bg-background"
                  />
                )}
                <Input
                  placeholder="Título da sala (opcional)"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-12 rounded-2xl bg-background"
                />

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ROOM_CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setNewCategory(c.id)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-[12px] transition",
                        newCategory === c.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-[color:var(--surface-2)] text-muted-foreground",
                      )}
                    >
                      {c.emoji} {c.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {VISIBILITY_OPTIONS.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVisibility(v.id)}
                      className={cn(
                        "rounded-2xl px-2 py-2 text-[12px] font-medium transition",
                        visibility === v.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-[color:var(--surface-2)] text-muted-foreground",
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {VISIBILITY_OPTIONS.find((v) => v.id === visibility)?.hint}
                </p>

                <div className="space-y-1 pt-1">
                  <label className="text-[11px] font-medium text-muted-foreground" htmlFor="schedule-room">
                    Agendar para depois (opcional)
                  </label>
                  <Input
                    id="schedule-room"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="h-11 rounded-2xl bg-background"
                  />
                </div>

                <Button type="submit" disabled={creating} className="h-12 w-full rounded-2xl">
                  {creating ? "Criando…" : "Criar e entrar"}
                </Button>
              </form>
            </div>
          </section>
        ) : null}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar sala pelo nome"
            className="h-11 rounded-2xl pl-9 bg-[color:var(--surface)]"
          />
        </div>

        {error ? (
          <p className="flex items-center gap-2 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-500">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        ) : null}

        {tab === "public" ? (
          <section className="space-y-3">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setCategory("")}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[12px] transition",
                  category === "" ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface)] text-muted-foreground",
                )}
              >
                Todas
              </button>
              {ROOM_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-[12px] transition",
                    category === c.id ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface)] text-muted-foreground",
                  )}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>

            {publicRooms.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[104px] animate-pulse rounded-[22px] bg-[color:var(--surface)]" />
                ))}
              </div>
            ) : publicRooms.isError ? (
              <EmptyState
                icon={<AlertCircle className="h-5 w-5 text-red-500" />}
                title="Erro ao carregar as salas"
                subtitle="Verifique sua conexão e tente novamente."
                action={<Button size="sm" variant="secondary" onClick={() => publicRooms.refetch()}>Tentar novamente</Button>}
              />
            ) : !publicRooms.data?.length ? (
              <EmptyState
                icon={<Globe2 className="h-5 w-5 text-primary" />}
                title="Nenhuma sala pública agora"
                subtitle="Seja o primeiro: crie uma sala pública e convide a galera."
                action={<Button size="sm" onClick={() => setShowCreate(true)}>Criar sala pública</Button>}
              />
            ) : (
              <ul className="space-y-3">
                {publicRooms.data.map((r: any) => {
                  const thumb = roomThumb(r);
                  const full = Number(r.member_count) >= Number(r.max_members);
                  return (
                    <li key={r.id}>
                      <div className="rounded-[22px] bg-[color:var(--surface)] p-3">
                        <div className="flex gap-3">
                          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-2xl bg-background grid place-items-center text-[10px] text-muted-foreground">
                            {thumb ? (
                              <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <Radio className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{r.title ?? "Sala de assistir"}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                              <UserAvatar avatarPath={r.host_avatar_url} displayName={r.host_display_name ?? "?"} className="h-4 w-4" />
                              <span className="truncate">@{r.host_username ?? "host"}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="rounded-full bg-[color:var(--surface-2)] px-2 py-0.5">
                                {categoryEmoji(r.category)} {categoryLabel(r.category)}
                              </span>
                              <span className="rounded-full bg-[color:var(--surface-2)] px-2 py-0.5">
                                <Users className="mr-1 inline h-3 w-3" />
                                {r.member_count}/{r.max_members}
                              </span>
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">ao vivo</span>
                            </div>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          disabled={full}
                          onClick={() => joinPublicRoom(r.id)}
                          className="mt-3 h-9 w-full rounded-full"
                        >
                          {full ? "Sala cheia" : "Entrar na sala"}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {tab === "invite" ? (
          <section className="space-y-4">
            <div className="rounded-[24px] bg-[color:var(--surface)] p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <LogIn className="h-4 w-4 text-primary" /> Entrar por convite
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void joinRoomByCode(code);
                }}
                className="flex gap-2"
              >
                <Input
                  placeholder="Código ou link de convite"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" variant="secondary" disabled={joining} className="shrink-0">
                  {joining ? "Entrando…" : "Entrar"}
                </Button>
              </form>
              <p className="text-[11px] text-muted-foreground">
                Cole o link recebido por mensagem. Salas privadas só aceitam quem tem o convite.
              </p>
            </div>

            <div>
              <div className="mb-2 px-1 text-sm font-semibold">Convites das minhas salas</div>
              {myRooms.isLoading ? (
                <div className="h-16 animate-pulse rounded-[22px] bg-[color:var(--surface)]" />
              ) : !myRooms.data?.filter((r: any) => r.host_id === user.id).length ? (
                <EmptyState
                  icon={<Link2 className="h-5 w-5 text-primary" />}
                  title="Você ainda não criou salas"
                  subtitle="Crie uma sala por convite para compartilhar o link."
                />
              ) : (
                <ul className="space-y-2">
                  {myRooms.data
                    .filter((r: any) => r.host_id === user.id)
                    .map((r: any) => (
                      <li key={r.id} className="flex items-center gap-2 rounded-[20px] bg-[color:var(--surface)] p-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold">{r.title ?? "Sala"}</div>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Link2 className="h-3 w-3" /> <span className="font-mono">{r.invite_code}</span>
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" className="shrink-0 gap-1.5" onClick={() => copyInvite(r.invite_code)}>
                          <Copy className="h-3.5 w-3.5" /> Copiar
                        </Button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {tab === "mine" ? (
          <section>
            {myRooms.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-[92px] animate-pulse rounded-[22px] bg-[color:var(--surface)]" />
                ))}
              </div>
            ) : !filteredMine.length ? (
              <EmptyState
                icon={<Tv className="h-5 w-5 text-primary" />}
                title="Você ainda não tem salas ativas"
                subtitle="Crie uma sala ou entre em uma sala pública para assistir junto."
                action={<Button size="sm" onClick={() => setShowCreate(true)}>Criar sala</Button>}
              />
            ) : (
              <ul className="space-y-3">
                {filteredMine.map((r: any) => {
                  const thumb = roomThumb(r);
                  return (
                    <li key={r.id}>
                      <div className="rounded-[22px] bg-[color:var(--surface)] p-3 transition hover:bg-[color:var(--surface-2)]">
                        <Link to="/watch/$roomId" params={{ roomId: r.id }} className="flex items-center gap-3">
                          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-2xl bg-background grid place-items-center text-[10px] text-muted-foreground">
                            {thumb ? (
                              <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <Radio className="h-4 w-4 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{r.title ?? "Sala"}</div>
                            <div className="text-[12px] text-muted-foreground">
                              {r.provider} ·{" "}
                              {formatDistanceToNowStrict(new Date(r.created_at), { locale: ptBR, addSuffix: true })}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="rounded-full bg-[color:var(--surface-2)] px-2 py-0.5">
                                {r.visibility === "public" ? (
                                  <>
                                    <Globe2 className="mr-1 inline h-3 w-3" /> pública
                                  </>
                                ) : (
                                  <>
                                    <Lock className="mr-1 inline h-3 w-3" />
                                    {r.visibility === "private" ? "privada" : "por convite"}
                                  </>
                                )}
                              </span>
                              <span className="rounded-full bg-[color:var(--surface-2)] px-2 py-0.5">
                                {categoryEmoji(r.category)} {categoryLabel(r.category)}
                              </span>
                            </div>
                          </div>
                        </Link>
                        {r.host_id === user.id ? (
                          <button
                            type="button"
                            onClick={() => copyInvite(r.invite_code)}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-[12px] text-muted-foreground active:scale-95"
                          >
                            <Copy className="h-3.5 w-3.5" /> Copiar link de convite
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-8 text-center">
      <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-[color:var(--surface-2)]">{icon}</div>
      <div className="text-sm font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-[260px] text-[12px] text-muted-foreground">{subtitle}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
