import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Link2, LogIn, Plus, Radio, Tv } from "lucide-react";
import { resolveSource } from "@/lib/watch/provider";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/watch/")({
  validateSearch: z.object({ code: z.string().optional() }),
  component: WatchIndex,
});

function WatchIndex() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [videoInput, setVideoInput] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoJoinTried = useRef(false);

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
        .select("id, title, video_id, invite_code, host_id, created_at, closed_at, provider")
        .in("id", ids)
        .is("closed_at", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const src = resolveSource(videoInput);
    if (!src) {
      setError("Cole um link válido do YouTube ou Twitch (canal ou vídeo).");
      return;
    }
    setCreating(true);
    // Encode video_id: youtube → id, twitch → "channel:name" or "video:id"
    const videoId = src.provider === "youtube" ? src.videoId : `${src.kind}:${src.id}`;
    const { data, error: err } = await (supabase as any)
      .from("watch_rooms")
      .insert({
        host_id: user.id,
        provider: src.provider,
        video_id: videoId,
        title: title || (src.provider === "twitch" ? `Twitch: ${src.id}` : "Sala de assistir"),
      })
      .select("id")
      .single();
    setCreating(false);
    if (err || !data) {
      setError(err?.message ?? "Não foi possível criar a sala.");
      return;
    }
    navigate({ to: "/watch/$roomId", params: { roomId: data.id } });
  }

  async function joinRoomByCode(raw: string) {
    setError(null);
    let c = raw.trim();
    try {
      const url = new URL(c);
      c = url.searchParams.get("code") ?? c;
    } catch {
      if (c.includes("code=")) c = c.split("code=")[1]?.split("&")[0] ?? c;
    }
    if (!c) return;
    setJoining(true);
    const { data, error: err } = await (supabase as any).rpc("join_watch_room_by_code", {
      _code: c,
    });
    setJoining(false);
    const roomId = Array.isArray(data) ? data[0]?.room_id : data?.room_id;
    if (err || !roomId) {
      setError(
        err?.message?.includes("Room not found")
          ? "Sala não encontrada. Confira se o código/link foi copiado completo."
          : err?.message?.includes("Not authenticated")
            ? "Entre na sua conta para acessar a sala."
            : err?.message ?? "Falha ao entrar.",
      );
      return;
    }
    navigate({ to: "/watch/$roomId", params: { roomId } });
  }

  async function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    await joinRoomByCode(code);
  }

  useEffect(() => {
    const sharedCode = search.code?.trim();
    if (!sharedCode || autoJoinTried.current) return;
    autoJoinTried.current = true;
    setCode(sharedCode);
    void joinRoomByCode(sharedCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.code]);

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex items-center gap-2 px-4 h-12">
          <Tv className="h-5 w-5 text-primary" />
          <h1 className="text-[19px] font-display font-semibold tracking-tight">Streaming Amigo</h1>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-5">
        <section className="overflow-hidden rounded-[28px] border border-[color:var(--hairline)] bg-[color:var(--surface)] shadow-elegant">
          <div className="p-4 pb-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-primary">watch party</div>
                <h2 className="text-xl font-semibold">Criar sala privada</h2>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground">
                <Plus className="h-5 w-5" />
              </div>
            </div>
            <div className="mb-4 flex gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-[color:var(--surface-2)] px-2.5 py-1">YouTube</span>
              <span className="rounded-full bg-[color:var(--surface-2)] px-2.5 py-1">Twitch</span>
              <span className="rounded-full bg-[color:var(--surface-2)] px-2.5 py-1">tempo real</span>
            </div>
          <form onSubmit={createRoom} className="space-y-2">
            <Input
              placeholder="Cole o link do YouTube ou Twitch"
              value={videoInput}
              onChange={(e) => setVideoInput(e.target.value)}
              required
              className="h-12 rounded-2xl bg-background"
            />
            <Input
              placeholder="Título da sala (opcional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-12 rounded-2xl bg-background"
            />
            <Button type="submit" disabled={creating} className="h-12 w-full rounded-2xl">
              {creating ? "Criando…" : "Criar e entrar"}
            </Button>
          </form>
          </div>
        </section>

        <section className="rounded-[24px] bg-[color:var(--surface)] p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LogIn className="h-4 w-4 text-primary" /> Entrar por convite
          </div>
          <form onSubmit={joinByCode} className="flex gap-2">
            <Input
              placeholder="Código ou link de convite"
              value={code}
              onChange={(e) => {
                const value = e.target.value;
                try {
                  const url = new URL(value);
                  setCode(url.searchParams.get("code") ?? value);
                } catch {
                  setCode(value);
                }
              }}
              className="flex-1"
            />
             <Button type="submit" variant="secondary" disabled={joining} className="shrink-0">
               {joining ? "Entrando…" : "Entrar"}
            </Button>
          </form>
        </section>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}

        <section>
          <div className="text-sm font-semibold mb-2 px-1">Minhas salas ativas</div>
          {myRooms.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !myRooms.data?.length ? (
            <p className="text-sm text-muted-foreground">Você ainda não tem salas ativas.</p>
          ) : (
            <ul className="space-y-3">
              {myRooms.data.map((r: any) => {
                const isYT = r.provider === "youtube";
                const twitchChannel = r.video_id?.startsWith("channel:")
                  ? r.video_id.split(":")[1]
                  : null;
                return (
                  <li key={r.id}>
                    <div className="rounded-[22px] bg-[color:var(--surface)] p-3 transition hover:bg-[color:var(--surface-2)]">
                      <Link to="/watch/$roomId" params={{ roomId: r.id }} className="flex items-center gap-3">
                        <div className="h-16 w-24 rounded-2xl overflow-hidden bg-background shrink-0 grid place-items-center text-[10px] text-muted-foreground">
                          {isYT ? (
                            <img
                              src={`https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid place-items-center gap-1">
                              <Radio className="h-4 w-4 text-primary" />
                              <span>{twitchChannel ? `@${twitchChannel}` : "TWITCH"}</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{r.title ?? "Sala"}</div>
                          <div className="text-[12px] text-muted-foreground">
                            {r.provider} · {formatDistanceToNowStrict(new Date(r.created_at), {
                              locale: ptBR,
                              addSuffix: true,
                            })}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Link2 className="h-3 w-3" /> <span className="font-mono">{r.invite_code}</span>
                          </div>
                        </div>
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          const share = `${window.location.origin}/watch?code=${encodeURIComponent(r.invite_code)}`;
                          navigator.clipboard.writeText(share).catch(() => {});
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-[12px] text-muted-foreground active:scale-95"
                      >
                        <Copy className="h-3.5 w-3.5" /> Copiar link de convite
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
