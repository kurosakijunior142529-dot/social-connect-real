import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tv, Plus, LogIn } from "lucide-react";
import { resolveSource } from "@/lib/watch/provider";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/watch/")({
  component: WatchIndex,
});

function WatchIndex() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [videoInput, setVideoInput] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const c = code.trim();
    if (!c) return;
    setJoining(true);
    const { data, error: err } = await (supabase as any).rpc("join_watch_room_by_code", {
      _code: c,
    });
    setJoining(false);
    const roomId = Array.isArray(data) ? data[0]?.room_id : data?.room_id;
    if (err || !roomId) {
      setError(err?.message?.includes("Room not found") ? "Sala não encontrada." : err?.message ?? "Falha ao entrar.");
      return;
    }
    navigate({ to: "/watch/$roomId", params: { roomId } });
  }

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex items-center gap-2 px-4 h-12">
          <Tv className="h-5 w-5" />
          <h1 className="text-[19px] font-display font-semibold tracking-tight">Streaming Amigo</h1>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-6">
        <section className="rounded-2xl bg-[color:var(--surface)] p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Plus className="h-4 w-4" /> Criar nova sala
          </div>
          <form onSubmit={createRoom} className="space-y-2">
            <Input
              placeholder="Link do YouTube, Twitch (canal ou vídeo) ou ID"
              value={videoInput}
              onChange={(e) => setVideoInput(e.target.value)}
              required
            />
            <Input
              placeholder="Título da sala (opcional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button type="submit" disabled={creating} className="w-full">
              {creating ? "Criando…" : "Criar e entrar"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Ex.: <code>https://youtu.be/dQw4w9WgXcQ</code>,{" "}
              <code>https://twitch.tv/shroud</code>,{" "}
              <code>https://twitch.tv/videos/12345678</code>
            </p>
          </form>
        </section>

        <section className="rounded-2xl bg-[color:var(--surface)] p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LogIn className="h-4 w-4" /> Entrar por código de convite
          </div>
          <form onSubmit={joinByCode} className="flex gap-2">
            <Input
              placeholder="Código"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" variant="secondary" disabled={joining}>
              {joining ? "…" : "Entrar"}
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
            <ul className="space-y-2">
              {myRooms.data.map((r: any) => {
                const isYT = r.provider === "youtube";
                const twitchChannel = r.video_id?.startsWith("channel:")
                  ? r.video_id.split(":")[1]
                  : null;
                return (
                  <li key={r.id}>
                    <Link
                      to="/watch/$roomId"
                      params={{ roomId: r.id }}
                      className="block rounded-xl bg-[color:var(--surface)] p-3 hover:bg-[color:var(--surface-2)] transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-20 rounded-lg overflow-hidden bg-black shrink-0 grid place-items-center text-[10px] text-white/70">
                          {isYT ? (
                            <img
                              src={`https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span>{twitchChannel ? `@${twitchChannel}` : "TWITCH"}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{r.title ?? "Sala"}</div>
                          <div className="text-[12px] text-muted-foreground">
                            {r.provider} · Código:{" "}
                            <span className="font-mono">{r.invite_code}</span> ·{" "}
                            {formatDistanceToNowStrict(new Date(r.created_at), {
                              locale: ptBR,
                              addSuffix: true,
                            })}
                          </div>
                        </div>
                      </div>
                    </Link>
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
