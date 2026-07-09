import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tv, Plus, LogIn } from "lucide-react";
import { extractYouTubeId } from "@/lib/watch/provider";
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
        .select("id, title, video_id, invite_code, host_id, created_at, closed_at")
        .in("id", ids)
        .is("closed_at", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const videoId = extractYouTubeId(videoInput);
    if (!videoId) {
      setError("Cole um link válido do YouTube ou um ID de vídeo.");
      return;
    }
    setCreating(true);
    const { data, error: err } = await (supabase as any)
      .from("watch_rooms")
      .insert({
        host_id: user.id,
        provider: "youtube",
        video_id: videoId,
        title: title || "Sala de assistir",
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
    const { data } = await (supabase as any)
      .from("watch_rooms")
      .select("id")
      .eq("invite_code", c)
      .is("closed_at", null)
      .maybeSingle();
    if (!data) {
      setError("Sala não encontrada ou já encerrada.");
      return;
    }
    // Ensure membership row exists (RLS will reject a room they can't see, but we can insert as self)
    await (supabase as any)
      .from("watch_room_members")
      .upsert({ room_id: data.id, user_id: user.id, left_at: null }, { onConflict: "room_id,user_id" });
    navigate({ to: "/watch/$roomId", params: { roomId: data.id } });
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
              placeholder="Link do YouTube ou ID do vídeo"
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
            <Button type="submit" variant="secondary">Entrar</Button>
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
              {myRooms.data.map((r: any) => (
                <li key={r.id}>
                  <Link
                    to="/watch/$roomId"
                    params={{ roomId: r.id }}
                    className="block rounded-xl bg-[color:var(--surface)] p-3 hover:bg-[color:var(--surface-2)] transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-20 rounded-lg overflow-hidden bg-black shrink-0">
                        <img
                          src={`https://i.ytimg.com/vi/${r.video_id}/hqdefault.jpg`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm truncate">{r.title ?? "Sala"}</div>
                        <div className="text-[12px] text-muted-foreground">
                          Código: <span className="font-mono">{r.invite_code}</span> ·{" "}
                          {formatDistanceToNowStrict(new Date(r.created_at), { locale: ptBR, addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
